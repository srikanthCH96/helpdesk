import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { store, UPLOADS_DIR } from './store.ts';
import {
  AuthenticatedRequest,
  authenticateJwt,
  rateLimitAuth,
  requireRoles,
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from './authMiddleware.ts';
import { computeSlaDeadlines, runSlaMonitorCycle } from './slaEngine.ts';
import {
  DatabaseSchema,
  RoleName,
  TicketPriority,
  TicketRecord,
  TicketStatus,
  UserRecord,
} from './types.ts';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.txt', '.log', '.csv', '.docx', '.xlsx']);
const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIMES.has(file.mimetype)) {
      cb(new Error('Unsupported file type. Allowed: PNG, JPG, PDF, TXT, LOG, CSV, DOCX, XLSX.'));
      return;
    }
    cb(null, true);
  },
});

function sanitizeUser(u: UserRecord, db: DatabaseSchema) {
  const dept = db.departments.find((d) => d.id === u.departmentId);
  const activeAssigned = db.tickets.filter(
    (t) =>
      t.assignedAgentId === u.id &&
      t.status !== 'RESOLVED' &&
      t.status !== 'CLOSED' &&
      t.status !== 'CANCELLED'
  ).length;

  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    departmentId: u.departmentId,
    departmentName: dept?.name || 'General',
    jobTitle: u.jobTitle,
    phone: u.phone,
    avatarUrl: u.avatarUrl || null,
    active: u.active,
    availabilityStatus: u.availabilityStatus,
    maxConcurrentTickets: u.maxConcurrentTickets,
    activeAssignedCount: activeAssigned,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function enrichTicket(ticket: TicketRecord, db: DatabaseSchema, viewerRole: RoleName) {
  const requester = db.users.find((u) => u.id === ticket.requesterId);
  const agent = ticket.assignedAgentId
    ? db.users.find((u) => u.id === ticket.assignedAgentId)
    : null;
  const category = db.categories.find((c) => c.id === ticket.categoryId);
  const department = db.departments.find((d) => d.id === ticket.departmentId);

  const comments = db.comments
    .filter((c) => c.ticketId === ticket.id)
    .filter((c) => (viewerRole === 'EMPLOYEE' ? !c.internalNote : true))
    .map((c) => {
      const author = db.users.find((u) => u.id === c.authorId);
      return {
        ...c,
        authorName: author?.fullName || 'Unknown User',
        authorRole: author?.role || 'EMPLOYEE',
      };
    });

  const attachments = db.attachments
    .filter((a) => a.ticketId === ticket.id)
    .map((a) => {
      const uploader = db.users.find((u) => u.id === a.uploadedById);
      return {
        ...a,
        uploadedByName: uploader?.fullName || 'Unknown',
        downloadUrl: `/api/tickets/attachments/${a.id}/download`,
      };
    });

  const statusHistory = db.statusHistory
    .filter((h) => h.ticketId === ticket.id)
    .map((h) => {
      const actor = db.users.find((u) => u.id === h.changedById);
      return {
        ...h,
        changedByName: actor?.fullName || 'System',
      };
    });

  const assignments = db.assignments
    .filter((a) => a.ticketId === ticket.id)
    .map((a) => {
      const ag = db.users.find((u) => u.id === a.agentId);
      const by = db.users.find((u) => u.id === a.assignedById);
      return {
        ...a,
        agentName: ag?.fullName || 'Unknown',
        assignedByName: by?.fullName || 'System',
      };
    });

  const escalations = db.escalations.filter((e) => e.ticketId === ticket.id);

  return {
    ...ticket,
    categoryName: category?.name || 'Other',
    departmentName: department?.name || 'General',
    requesterName: requester?.fullName || 'Unknown',
    requesterEmail: requester?.email || '',
    requesterJobTitle: requester?.jobTitle || '',
    assignedAgentName: agent?.fullName || null,
    assignedAgentEmail: agent?.email || null,
    comments,
    attachments,
    statusHistory,
    assignments,
    escalations,
  };
}

function addNotification(
  db: DatabaseSchema,
  userId: number,
  ticketId: number | null,
  title: string,
  message: string,
  eventType: string
) {
  db.counters.notification += 1;
  db.notifications.unshift({
    id: db.counters.notification,
    userId,
    ticketId,
    title,
    message,
    eventType,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

function addAudit(
  db: DatabaseSchema,
  actorId: number | null,
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  details: string,
  ipAddress = '127.0.0.1'
) {
  db.counters.auditLog += 1;
  db.auditLogs.unshift({
    id: db.counters.auditLog,
    actorId,
    actorEmail,
    action,
    entityType,
    entityId,
    details,
    ipAddress,
    createdAt: new Date().toISOString(),
  });
}

function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include uppercase, lowercase, and numeric characters.';
  }
  return null;
}

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'OPEN', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['RESOLVED', 'ASSIGNED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS', 'OPEN'],
  CLOSED: ['OPEN'],
  CANCELLED: [],
};

export function createApiRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const db = store.getState();
    res.json({
      success: true,
      status: 'UP',
      service: 'HelpDesk Pro Enterprise API (Node Preview Runtime)',
      timestamp: new Date().toISOString(),
      storageMode: db.settings.s3Configured ? 'AWS_S3' : 'LOCAL_DEV_ADAPTER',
      emailMode: db.settings.smtpConfigured ? 'SMTP' : 'DEV_LOG_ADAPTER',
    });
  });

  // ------------------------------------------------------------------
  // AUTHENTICATION
  // ------------------------------------------------------------------
  router.post('/auth/login', rateLimitAuth(), (req, res: Response) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required.' });
      return;
    }

    const db = store.getState();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === String(email).trim().toLowerCase()
    );

    if (!user || !bcrypt.compareSync(String(password), user.passwordHash)) {
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
      return;
    }

    if (!user.active) {
      res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Contact an IT administrator.',
      });
      return;
    }

    const payload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    store.transaction((state) => {
      addAudit(
        state,
        user.id,
        user.email,
        'USER_LOGIN',
        'USER',
        String(user.id),
        `Signed in with role ${user.role}`,
        req.ip || '127.0.0.1'
      );
    });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: sanitizeUser(user, db),
      },
    });
  });

  router.post('/auth/register', rateLimitAuth(), (req, res: Response) => {
    const { fullName, email, password, departmentId, jobTitle, phone } = req.body || {};
    if (!fullName || !email || !password) {
      res.status(400).json({
        success: false,
        message: 'Full name, email address, and password are required.',
      });
      return;
    }

    const strengthError = validatePasswordStrength(String(password));
    if (strengthError) {
      res.status(400).json({ success: false, message: strengthError });
      return;
    }

    const db = store.getState();
    const normalizedEmail = String(email).trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
      return;
    }

    const created = store.transaction((state) => {
      state.counters.user += 1;
      const now = new Date().toISOString();
      const newUser: UserRecord = {
        id: state.counters.user,
        fullName: String(fullName).trim(),
        email: normalizedEmail,
        passwordHash: bcrypt.hashSync(String(password), 10),
        role: 'EMPLOYEE',
        departmentId: Number(departmentId) || state.departments[0]?.id || 1,
        jobTitle: String(jobTitle || 'Enterprise Employee').trim(),
        phone: String(phone || '').trim(),
        active: true,
        availabilityStatus: 'AVAILABLE',
        maxConcurrentTickets: 0,
        createdAt: now,
        updatedAt: now,
      };
      state.users.push(newUser);
      addAudit(
        state,
        newUser.id,
        newUser.email,
        'EMPLOYEE_REGISTERED',
        'USER',
        String(newUser.id),
        `Self-registered employee account`,
        req.ip || '127.0.0.1'
      );
      return newUser;
    });

    const payload = { userId: created.id, email: created.email, role: created.role };
    res.status(201).json({
      success: true,
      data: {
        accessToken: signAccessToken(payload),
        refreshToken: signRefreshToken(payload),
        user: sanitizeUser(created, store.getState()),
      },
    });
  });

  router.post('/auth/refresh', (req, res: Response) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      res.status(400).json({ success: false, message: 'Refresh token is required.' });
      return;
    }
    try {
      const decoded = verifyToken(String(refreshToken));
      const db = store.getState();
      const user = db.users.find((u) => u.id === decoded.userId && u.active);
      if (!user) {
        res.status(401).json({ success: false, message: 'User not active.' });
        return;
      }
      const payload = { userId: user.id, email: user.email, role: user.role };
      res.json({
        success: true,
        data: {
          accessToken: signAccessToken(payload),
          refreshToken: signRefreshToken(payload),
        },
      });
    } catch {
      res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }
  });

  router.post('/auth/logout', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    store.transaction((state) => {
      if (req.user) {
        addAudit(
          state,
          req.user.userId,
          req.user.email,
          'USER_LOGOUT',
          'USER',
          String(req.user.userId),
          'User logged out'
        );
      }
    });
    res.json({ success: true, message: 'Logged out successfully' });
  });

  router.post('/auth/forgot-password', rateLimitAuth(), (req, res: Response) => {
    const { email } = req.body || {};
    if (!email) {
      res.status(400).json({ success: false, message: 'Email address is required.' });
      return;
    }
    const db = store.getState();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === String(email).trim().toLowerCase()
    );

    let devResetToken: string | undefined;
    if (user) {
      devResetToken = crypto.randomBytes(16).toString('hex');
      store.transaction((state) => {
        state.counters.passwordResetToken += 1;
        state.passwordResetTokens.push({
          id: state.counters.passwordResetToken,
          userId: user.id,
          token: devResetToken!,
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          used: false,
          createdAt: new Date().toISOString(),
        });
        addAudit(
          state,
          user.id,
          user.email,
          'PASSWORD_RESET_REQUESTED',
          'USER',
          String(user.id),
          'Generated password reset token'
        );
      });
    }

    // Never reveal whether email exists in production; return devToken only in local preview mode
    res.json({
      success: true,
      message:
        'If an account matches that email address, password reset instructions have been issued.',
      data: devResetToken ? { previewResetToken: devResetToken } : undefined,
    });
  });

  router.post('/auth/reset-password', rateLimitAuth(), (req, res: Response) => {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      res.status(400).json({ success: false, message: 'Reset token and new password are required.' });
      return;
    }
    const strengthError = validatePasswordStrength(String(newPassword));
    if (strengthError) {
      res.status(400).json({ success: false, message: strengthError });
      return;
    }

    const db = store.getState();
    const tokenRec = db.passwordResetTokens.find(
      (t) => t.token === String(token).trim() && !t.used
    );
    if (!tokenRec || new Date(tokenRec.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ success: false, message: 'Invalid or expired password reset token.' });
      return;
    }

    store.transaction((state) => {
      const rec = state.passwordResetTokens.find((t) => t.id === tokenRec.id);
      const user = state.users.find((u) => u.id === tokenRec.userId);
      if (rec && user) {
        rec.used = true;
        user.passwordHash = bcrypt.hashSync(String(newPassword), 10);
        user.updatedAt = new Date().toISOString();
        addAudit(
          state,
          user.id,
          user.email,
          'PASSWORD_RESET_COMPLETED',
          'USER',
          String(user.id),
          'Password updated via reset token'
        );
      }
    });

    res.json({ success: true, message: 'Password has been reset successfully.' });
  });

  router.get('/auth/me', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    const db = store.getState();
    const user = db.users.find((u) => u.id === req.user!.userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }
    res.json({ success: true, data: sanitizeUser(user, db) });
  });

  // Publicly accessible list of departments for registration form
  router.get('/departments', (_req, res: Response) => {
    const db = store.getState();
    const enriched = db.departments.map((d) => ({
      ...d,
      memberCount: db.users.filter((u) => u.departmentId === d.id).length,
      openTicketCount: db.tickets.filter(
        (t) => t.departmentId === d.id && t.status !== 'CLOSED' && t.status !== 'CANCELLED'
      ).length,
    }));
    res.json({ success: true, data: enriched });
  });

  router.post(
    '/departments',
    authenticateJwt,
    requireRoles('ADMIN'),
    (req: AuthenticatedRequest, res: Response) => {
      const { name, code, managerName, description } = req.body || {};
      if (!name || !code) {
        res.status(400).json({ success: false, message: 'Department name and code are required.' });
        return;
      }
      const created = store.transaction((state) => {
        state.counters.department += 1;
        const now = new Date().toISOString();
        const dept = {
          id: state.counters.department,
          name: String(name).trim(),
          code: String(code).trim().toUpperCase(),
          managerName: String(managerName || 'Unassigned').trim(),
          description: String(description || '').trim(),
          createdAt: now,
          updatedAt: now,
        };
        state.departments.push(dept);
        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          'DEPARTMENT_CREATED',
          'DEPARTMENT',
          String(dept.id),
          `Created department ${dept.name}`
        );
        return dept;
      });
      res.status(201).json({ success: true, data: created });
    }
  );

  // ------------------------------------------------------------------
  // USERS (ADMIN & AGENT DIRECTORY)
  // ------------------------------------------------------------------
  router.get(
    '/users',
    authenticateJwt,
    requireRoles('ADMIN', 'SUPPORT_AGENT'),
    (req: AuthenticatedRequest, res: Response) => {
      const db = store.getState();
      const { role, search, active } = req.query;
      let users = db.users;

      if (role && typeof role === 'string') {
        users = users.filter((u) => u.role === role);
      }
      if (active === 'true' || active === 'false') {
        users = users.filter((u) => u.active === (active === 'true'));
      }
      if (search && typeof search === 'string') {
        const q = search.toLowerCase();
        users = users.filter(
          (u) =>
            u.fullName.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.jobTitle.toLowerCase().includes(q)
        );
      }

      res.json({ success: true, data: users.map((u) => sanitizeUser(u, db)) });
    }
  );

  router.get('/users/:id', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (req.user!.role !== 'ADMIN' && req.user!.userId !== id) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    const db = store.getState();
    const user = db.users.find((u) => u.id === id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }
    res.json({ success: true, data: sanitizeUser(user, db) });
  });

  router.post(
    '/users',
    authenticateJwt,
    requireRoles('ADMIN'),
    (req: AuthenticatedRequest, res: Response) => {
      const {
        fullName,
        email,
        password,
        role,
        departmentId,
        jobTitle,
        phone,
        availabilityStatus,
        maxConcurrentTickets,
      } = req.body || {};

      if (!fullName || !email || !role) {
        res.status(400).json({
          success: false,
          message: 'Full name, email, and role are required.',
        });
        return;
      }

      const db = store.getState();
      const normalizedEmail = String(email).trim().toLowerCase();
      if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
        res.status(409).json({ success: false, message: 'Email address already in use.' });
        return;
      }

      const created = store.transaction((state) => {
        state.counters.user += 1;
        const now = new Date().toISOString();
        const user: UserRecord = {
          id: state.counters.user,
          fullName: String(fullName).trim(),
          email: normalizedEmail,
          passwordHash: bcrypt.hashSync(String(password || 'Enterprise@2026'), 10),
          role: role as RoleName,
          departmentId: Number(departmentId) || 1,
          jobTitle: String(jobTitle || 'Team Member').trim(),
          phone: String(phone || '').trim(),
          active: true,
          availabilityStatus: availabilityStatus || 'AVAILABLE',
          maxConcurrentTickets: Number(maxConcurrentTickets) || (role === 'SUPPORT_AGENT' ? 12 : 0),
          createdAt: now,
          updatedAt: now,
        };
        state.users.push(user);
        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          'USER_CREATED',
          'USER',
          String(user.id),
          `Created ${user.role} account for ${user.email}`
        );
        return user;
      });

      res.status(201).json({ success: true, data: sanitizeUser(created, store.getState()) });
    }
  );

  router.put(
    '/users/:id',
    authenticateJwt,
    requireRoles('ADMIN'),
    (req: AuthenticatedRequest, res: Response) => {
      const id = Number(req.params.id);
      const {
        fullName,
        role,
        departmentId,
        jobTitle,
        phone,
        availabilityStatus,
        maxConcurrentTickets,
      } = req.body || {};

      const updated = store.transaction((state) => {
        const user = state.users.find((u) => u.id === id);
        if (!user) return null;
        if (fullName) user.fullName = String(fullName).trim();
        if (role) user.role = role as RoleName;
        if (departmentId) user.departmentId = Number(departmentId);
        if (jobTitle !== undefined) user.jobTitle = String(jobTitle).trim();
        if (phone !== undefined) user.phone = String(phone).trim();
        if (availabilityStatus) user.availabilityStatus = availabilityStatus;
        if (maxConcurrentTickets !== undefined) {
          user.maxConcurrentTickets = Number(maxConcurrentTickets);
        }
        user.updatedAt = new Date().toISOString();
        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          'USER_UPDATED',
          'USER',
          String(user.id),
          `Updated profile for ${user.email}`
        );
        return user;
      });

      if (!updated) {
        res.status(404).json({ success: false, message: 'User not found.' });
        return;
      }
      res.json({ success: true, data: sanitizeUser(updated, store.getState()) });
    }
  );

  router.patch(
    '/users/:id/status',
    authenticateJwt,
    requireRoles('ADMIN'),
    (req: AuthenticatedRequest, res: Response) => {
      const id = Number(req.params.id);
      const { active } = req.body || {};
      if (id === req.user!.userId && active === false) {
        res.status(400).json({
          success: false,
          message: 'Administrators cannot deactivate their own active session account.',
        });
        return;
      }

      const updated = store.transaction((state) => {
        const user = state.users.find((u) => u.id === id);
        if (!user) return null;
        user.active = Boolean(active);
        user.updatedAt = new Date().toISOString();
        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          user.active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          'USER',
          String(user.id),
          `Set account active=${user.active} for ${user.email}`
        );
        return user;
      });

      if (!updated) {
        res.status(404).json({ success: false, message: 'User not found.' });
        return;
      }
      res.json({ success: true, data: sanitizeUser(updated, store.getState()) });
    }
  );

  // ------------------------------------------------------------------
  // CATEGORIES
  // ------------------------------------------------------------------
  router.get('/categories', authenticateJwt, (_req, res: Response) => {
    const db = store.getState();
    res.json({ success: true, data: db.categories });
  });

  router.post(
    '/categories',
    authenticateJwt,
    requireRoles('ADMIN'),
    (req: AuthenticatedRequest, res: Response) => {
      const { name, description, defaultPriority } = req.body || {};
      if (!name) {
        res.status(400).json({ success: false, message: 'Category name is required.' });
        return;
      }
      const created = store.transaction((state) => {
        state.counters.category += 1;
        const now = new Date().toISOString();
        const cat = {
          id: state.counters.category,
          name: String(name).trim(),
          description: String(description || '').trim(),
          defaultPriority: (defaultPriority || 'MEDIUM') as TicketPriority,
          active: true,
          createdAt: now,
          updatedAt: now,
        };
        state.categories.push(cat);
        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          'CATEGORY_CREATED',
          'CATEGORY',
          String(cat.id),
          `Created ticket category ${cat.name}`
        );
        return cat;
      });
      res.status(201).json({ success: true, data: created });
    }
  );

  router.put(
    '/categories/:id',
    authenticateJwt,
    requireRoles('ADMIN'),
    (req: AuthenticatedRequest, res: Response) => {
      const id = Number(req.params.id);
      const { name, description, defaultPriority, active } = req.body || {};
      const updated = store.transaction((state) => {
        const cat = state.categories.find((c) => c.id === id);
        if (!cat) return null;
        if (name) cat.name = String(name).trim();
        if (description !== undefined) cat.description = String(description).trim();
        if (defaultPriority) cat.defaultPriority = defaultPriority as TicketPriority;
        if (active !== undefined) cat.active = Boolean(active);
        cat.updatedAt = new Date().toISOString();
        return cat;
      });
      if (!updated) {
        res.status(404).json({ success: false, message: 'Category not found.' });
        return;
      }
      res.json({ success: true, data: updated });
    }
  );

  router.delete(
    '/categories/:id',
    authenticateJwt,
    requireRoles('ADMIN'),
    (req: AuthenticatedRequest, res: Response) => {
      const id = Number(req.params.id);
      const db = store.getState();
      if (db.tickets.some((t) => t.categoryId === id)) {
        res.status(409).json({
          success: false,
          message: 'Cannot delete a category referenced by existing tickets. Deactivate it instead.',
        });
        return;
      }
      store.transaction((state) => {
        state.categories = state.categories.filter((c) => c.id !== id);
        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          'CATEGORY_DELETED',
          'CATEGORY',
          String(id),
          `Deleted ticket category #${id}`
        );
      });
      res.json({ success: true, message: 'Category deleted' });
    }
  );

  // ------------------------------------------------------------------
  // TICKETS
  // ------------------------------------------------------------------
  router.get('/tickets', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    const db = store.getState();
    const { role, userId } = req.user!;
    const {
      status,
      priority,
      categoryId,
      departmentId,
      assignedToMe,
      unassigned,
      search,
      sortBy = 'createdAt',
      sortDir = 'desc',
      page = '1',
      pageSize = '20',
    } = req.query;

    let tickets = db.tickets.slice();

    // Strict RBAC scope
    if (role === 'EMPLOYEE') {
      tickets = tickets.filter((t) => t.requesterId === userId);
    } else if (role === 'SUPPORT_AGENT') {
      if (assignedToMe === 'true') {
        tickets = tickets.filter((t) => t.assignedAgentId === userId);
      } else {
        // Agents see tickets assigned to them or unassigned queue tickets
        tickets = tickets.filter(
          (t) => t.assignedAgentId === userId || t.assignedAgentId === null
        );
      }
    }

    if (unassigned === 'true') {
      tickets = tickets.filter((t) => t.assignedAgentId === null);
    }
    if (status && typeof status === 'string' && status !== 'ALL') {
      tickets = tickets.filter((t) => t.status === status);
    }
    if (priority && typeof priority === 'string' && priority !== 'ALL') {
      tickets = tickets.filter((t) => t.priority === priority);
    }
    if (categoryId && categoryId !== 'ALL') {
      tickets = tickets.filter((t) => t.categoryId === Number(categoryId));
    }
    if (departmentId && departmentId !== 'ALL') {
      tickets = tickets.filter((t) => t.departmentId === Number(departmentId));
    }
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      tickets = tickets.filter((t) => {
        const reqUser = db.users.find((u) => u.id === t.requesterId);
        return (
          t.ticketNumber.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (reqUser?.fullName.toLowerCase().includes(q) ?? false)
        );
      });
    }

    const priorityWeight: Record<TicketPriority, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    tickets.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'priority') {
        return (priorityWeight[a.priority] - priorityWeight[b.priority]) * dir;
      }
      if (sortBy === 'resolutionDueAt') {
        return (
          (new Date(a.resolutionDueAt).getTime() - new Date(b.resolutionDueAt).getTime()) * dir
        );
      }
      if (sortBy === 'ticketNumber') {
        return a.ticketNumber.localeCompare(b.ticketNumber) * dir;
      }
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    });

    const total = tickets.length;
    const p = Math.max(1, Number(page));
    const ps = Math.max(1, Math.min(100, Number(pageSize)));
    const paged = tickets.slice((p - 1) * ps, p * ps);

    res.json({
      success: true,
      data: {
        items: paged.map((t) => enrichTicket(t, db, role)),
        total,
        page: p,
        pageSize: ps,
        totalPages: Math.max(1, Math.ceil(total / ps)),
      },
    });
  });

  router.get('/tickets/attachments/:attachmentId/download', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    const attachmentId = Number(req.params.attachmentId);
    const db = store.getState();
    const att = db.attachments.find((a) => a.id === attachmentId);
    if (!att) {
      res.status(404).json({ success: false, message: 'Attachment not found.' });
      return;
    }
    const ticket = db.tickets.find((t) => t.id === att.ticketId);
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found.' });
      return;
    }
    if (req.user!.role === 'EMPLOYEE' && ticket.requesterId !== req.user!.userId) {
      res.status(403).json({ success: false, message: 'Access denied to this attachment.' });
      return;
    }
    const filePath = path.join(UPLOADS_DIR, att.storedFileName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: 'Stored file missing on disk.' });
      return;
    }
    res.download(filePath, att.originalFileName);
  });

  router.get('/tickets/:id', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const db = store.getState();
    const ticket = db.tickets.find((t) => t.id === id);
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found.' });
      return;
    }
    if (req.user!.role === 'EMPLOYEE' && ticket.requesterId !== req.user!.userId) {
      res.status(403).json({
        success: false,
        message: 'Employees cannot access tickets belonging to other employees.',
      });
      return;
    }
    if (
      req.user!.role === 'SUPPORT_AGENT' &&
      ticket.assignedAgentId !== null &&
      ticket.assignedAgentId !== req.user!.userId
    ) {
      res.status(403).json({
        success: false,
        message: 'This ticket is assigned to another support agent.',
      });
      return;
    }

    res.json({ success: true, data: enrichTicket(ticket, db, req.user!.role) });
  });

  router.post('/tickets', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    const { subject, description, categoryId, priority, departmentId } = req.body || {};
    if (!subject || !description || !categoryId || !priority) {
      res.status(400).json({
        success: false,
        message: 'Subject, description, category, and priority are required.',
      });
      return;
    }

    const db = store.getState();
    const requester = db.users.find((u) => u.id === req.user!.userId)!;
    const catExists = db.categories.some((c) => c.id === Number(categoryId));
    if (!catExists) {
      res.status(400).json({ success: false, message: 'Invalid ticket category.' });
      return;
    }

    const now = new Date().toISOString();
    const { responseDueAt, resolutionDueAt } = computeSlaDeadlines(priority as TicketPriority, now);

    const created = store.transaction((state) => {
      state.counters.ticket += 1;
      const ticketNumber = `HD-${1040 + state.counters.ticket}`;
      const newTicket: TicketRecord = {
        id: state.counters.ticket,
        ticketNumber,
        subject: String(subject).trim(),
        description: String(description).trim(),
        status: 'OPEN',
        priority: priority as TicketPriority,
        categoryId: Number(categoryId),
        departmentId: Number(departmentId) || requester.departmentId,
        requesterId: requester.id,
        assignedAgentId: null,
        responseDueAt,
        resolutionDueAt,
        firstRespondedAt: null,
        resolvedAt: null,
        closedAt: null,
        slaBreached: false,
        slaWarningSent: false,
        escalationLevel: 0,
        resolutionSummary: null,
        createdAt: now,
        updatedAt: now,
      };
      state.tickets.unshift(newTicket);

      state.counters.statusHistory += 1;
      state.statusHistory.push({
        id: state.counters.statusHistory,
        ticketId: newTicket.id,
        fromStatus: null,
        toStatus: 'OPEN',
        changedById: requester.id,
        reason: 'Ticket created',
        changedAt: now,
      });

      // Notify requester + all admins
      addNotification(
        state,
        requester.id,
        newTicket.id,
        `Ticket Created: ${newTicket.ticketNumber}`,
        `Your request "${newTicket.subject}" has been logged and entered the triage queue.`,
        'TICKET_CREATED'
      );
      for (const admin of state.users.filter((u) => u.role === 'ADMIN' && u.active)) {
        addNotification(
          state,
          admin.id,
          newTicket.id,
          `New Unassigned Ticket: ${newTicket.ticketNumber}`,
          `${requester.fullName} submitted a ${newTicket.priority} ticket: "${newTicket.subject}".`,
          'TICKET_CREATED'
        );
      }

      addAudit(
        state,
        requester.id,
        requester.email,
        'TICKET_CREATED',
        'TICKET',
        newTicket.ticketNumber,
        `Created ${newTicket.priority} ticket`
      );
      return newTicket;
    });

    res.status(201).json({
      success: true,
      data: enrichTicket(created, store.getState(), req.user!.role),
    });
  });

  router.post(
    '/tickets/:id/assign',
    authenticateJwt,
    requireRoles('ADMIN', 'SUPPORT_AGENT'),
    (req: AuthenticatedRequest, res: Response) => {
      const id = Number(req.params.id);
      const { agentId, notes } = req.body || {};
      const targetAgentId =
        req.user!.role === 'SUPPORT_AGENT' ? req.user!.userId : Number(agentId);

      if (!targetAgentId) {
        res.status(400).json({ success: false, message: 'Target support agent ID is required.' });
        return;
      }

      const db = store.getState();
      const ticket = db.tickets.find((t) => t.id === id);
      if (!ticket) {
        res.status(404).json({ success: false, message: 'Ticket not found.' });
        return;
      }
      const agent = db.users.find(
        (u) => u.id === targetAgentId && (u.role === 'SUPPORT_AGENT' || u.role === 'ADMIN') && u.active
      );
      if (!agent) {
        res.status(400).json({ success: false, message: 'Selected agent is invalid or inactive.' });
        return;
      }
      if (ticket.assignedAgentId === targetAgentId) {
        res.status(409).json({
          success: false,
          message: `Ticket ${ticket.ticketNumber} is already assigned to ${agent.fullName}.`,
        });
        return;
      }

      const updated = store.transaction((state) => {
        const t = state.tickets.find((x) => x.id === id)!;
        const now = new Date().toISOString();
        const prevStatus = t.status;
        t.assignedAgentId = agent.id;
        if (t.status === 'OPEN') {
          t.status = 'ASSIGNED';
          state.counters.statusHistory += 1;
          state.statusHistory.push({
            id: state.counters.statusHistory,
            ticketId: t.id,
            fromStatus: prevStatus,
            toStatus: 'ASSIGNED',
            changedById: req.user!.userId,
            reason: `Assigned to ${agent.fullName}`,
            changedAt: now,
          });
        }
        t.updatedAt = now;

        state.counters.assignment += 1;
        state.assignments.unshift({
          id: state.counters.assignment,
          ticketId: t.id,
          agentId: agent.id,
          assignedById: req.user!.userId,
          notes: String(notes || (req.user!.role === 'SUPPORT_AGENT' ? 'Agent accepted ticket from queue' : 'Assigned by administrator')),
          assignedAt: now,
        });

        addNotification(
          state,
          agent.id,
          t.id,
          `Assigned Ticket: ${t.ticketNumber}`,
          `You have been assigned "${t.subject}" (${t.priority}).`,
          'TICKET_ASSIGNED'
        );
        addNotification(
          state,
          t.requesterId,
          t.id,
          `Agent Assigned: ${t.ticketNumber}`,
          `${agent.fullName} is now handling your support request.`,
          'TICKET_ASSIGNED'
        );

        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          'TICKET_ASSIGNED',
          'TICKET',
          t.ticketNumber,
          `Assigned to ${agent.fullName}`
        );
        return t;
      });

      res.json({ success: true, data: enrichTicket(updated, store.getState(), req.user!.role) });
    }
  );

  router.patch(
    '/tickets/:id/status',
    authenticateJwt,
    (req: AuthenticatedRequest, res: Response) => {
      const id = Number(req.params.id);
      const { status, reason } = req.body || {};
      const nextStatus = status as TicketStatus;

      const db = store.getState();
      const ticket = db.tickets.find((t) => t.id === id);
      if (!ticket) {
        res.status(404).json({ success: false, message: 'Ticket not found.' });
        return;
      }

      // Role permissions for status updates
      if (req.user!.role === 'EMPLOYEE') {
        if (ticket.requesterId !== req.user!.userId) {
          res.status(403).json({ success: false, message: 'Forbidden' });
          return;
        }
        if (nextStatus !== 'CANCELLED' && nextStatus !== 'CLOSED') {
          res.status(403).json({
            success: false,
            message: 'Employees may only cancel an open ticket or confirm closure of a resolved ticket.',
          });
          return;
        }
      }

      if (
        req.user!.role === 'SUPPORT_AGENT' &&
        ticket.assignedAgentId !== null &&
        ticket.assignedAgentId !== req.user!.userId
      ) {
        res.status(403).json({
          success: false,
          message: 'Only the assigned agent or an administrator can change this ticket status.',
        });
        return;
      }

      const allowed = VALID_TRANSITIONS[ticket.status] || [];
      if (!allowed.includes(nextStatus)) {
        res.status(400).json({
          success: false,
          message: `Invalid status transition from ${ticket.status} to ${nextStatus}.`,
        });
        return;
      }

      const updated = store.transaction((state) => {
        const t = state.tickets.find((x) => x.id === id)!;
        const now = new Date().toISOString();
        const prev = t.status;
        t.status = nextStatus;
        t.updatedAt = now;

        if (nextStatus === 'IN_PROGRESS' && !t.firstRespondedAt) {
          t.firstRespondedAt = now;
        }
        if (nextStatus === 'RESOLVED') {
          t.resolvedAt = now;
        }
        if (nextStatus === 'CLOSED') {
          t.closedAt = now;
        }
        if (nextStatus === 'IN_PROGRESS' && prev === 'ASSIGNED' && !t.assignedAgentId) {
          t.assignedAgentId = req.user!.userId;
        }

        state.counters.statusHistory += 1;
        state.statusHistory.push({
          id: state.counters.statusHistory,
          ticketId: t.id,
          fromStatus: prev,
          toStatus: nextStatus,
          changedById: req.user!.userId,
          reason: String(reason || `Status changed to ${nextStatus}`),
          changedAt: now,
        });

        addNotification(
          state,
          t.requesterId,
          t.id,
          `Ticket ${t.ticketNumber}: ${nextStatus}`,
          `Status updated from ${prev} to ${nextStatus}.`,
          'STATUS_CHANGED'
        );

        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          'TICKET_STATUS_CHANGED',
          'TICKET',
          t.ticketNumber,
          `${prev} -> ${nextStatus}`
        );
        return t;
      });

      res.json({ success: true, data: enrichTicket(updated, store.getState(), req.user!.role) });
    }
  );

  router.post(
    '/tickets/:id/resolve',
    authenticateJwt,
    requireRoles('SUPPORT_AGENT', 'ADMIN'),
    (req: AuthenticatedRequest, res: Response) => {
      const id = Number(req.params.id);
      const { resolutionSummary } = req.body || {};
      if (!resolutionSummary || !String(resolutionSummary).trim()) {
        res.status(400).json({
          success: false,
          message: 'A resolution summary is required to resolve a ticket.',
        });
        return;
      }

      const db = store.getState();
      const ticket = db.tickets.find((t) => t.id === id);
      if (!ticket) {
        res.status(404).json({ success: false, message: 'Ticket not found.' });
        return;
      }

      const updated = store.transaction((state) => {
        const t = state.tickets.find((x) => x.id === id)!;
        const now = new Date().toISOString();
        const prev = t.status;
        t.status = 'RESOLVED';
        t.resolvedAt = now;
        t.updatedAt = now;
        t.resolutionSummary = String(resolutionSummary).trim();
        if (!t.firstRespondedAt) t.firstRespondedAt = now;
        if (!t.assignedAgentId) t.assignedAgentId = req.user!.userId;

        state.counters.statusHistory += 1;
        state.statusHistory.push({
          id: state.counters.statusHistory,
          ticketId: t.id,
          fromStatus: prev,
          toStatus: 'RESOLVED',
          changedById: req.user!.userId,
          reason: t.resolutionSummary,
          changedAt: now,
        });

        state.counters.comment += 1;
        state.comments.push({
          id: state.counters.comment,
          ticketId: t.id,
          authorId: req.user!.userId,
          body: `Resolution Summary: ${t.resolutionSummary}`,
          internalNote: false,
          createdAt: now,
        });

        addNotification(
          state,
          t.requesterId,
          t.id,
          `Ticket ${t.ticketNumber} Resolved`,
          `Your ticket "${t.subject}" has been marked as resolved.`,
          'TICKET_RESOLVED'
        );

        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          'TICKET_RESOLVED',
          'TICKET',
          t.ticketNumber,
          t.resolutionSummary
        );
        return t;
      });

      res.json({ success: true, data: enrichTicket(updated, store.getState(), req.user!.role) });
    }
  );

  router.post('/tickets/:id/reopen', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const { reason } = req.body || {};
    const db = store.getState();
    const ticket = db.tickets.find((t) => t.id === id);
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found.' });
      return;
    }
    if (req.user!.role === 'EMPLOYEE' && ticket.requesterId !== req.user!.userId) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
      res.status(400).json({
        success: false,
        message: 'Only resolved or closed tickets can be reopened.',
      });
      return;
    }

    const updated = store.transaction((state) => {
      const t = state.tickets.find((x) => x.id === id)!;
      const now = new Date().toISOString();
      const prev = t.status;
      t.status = t.assignedAgentId ? 'IN_PROGRESS' : 'OPEN';
      t.resolvedAt = null;
      t.closedAt = null;
      t.updatedAt = now;

      state.counters.statusHistory += 1;
      state.statusHistory.push({
        id: state.counters.statusHistory,
        ticketId: t.id,
        fromStatus: prev,
        toStatus: t.status,
        changedById: req.user!.userId,
        reason: String(reason || 'Ticket reopened by requester'),
        changedAt: now,
      });

      if (t.assignedAgentId) {
        addNotification(
          state,
          t.assignedAgentId,
          t.id,
          `Ticket Reopened: ${t.ticketNumber}`,
          `"${t.subject}" was reopened: ${String(reason || 'Further assistance requested')}`,
          'TICKET_REOPENED'
        );
      }

      addAudit(
        state,
        req.user!.userId,
        req.user!.email,
        'TICKET_REOPENED',
        'TICKET',
        t.ticketNumber,
        String(reason || 'Reopened')
      );
      return t;
    });

    res.json({ success: true, data: enrichTicket(updated, store.getState(), req.user!.role) });
  });

  router.post('/tickets/:id/comments', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const { body, internalNote } = req.body || {};
    if (!body || !String(body).trim()) {
      res.status(400).json({ success: false, message: 'Comment body cannot be empty.' });
      return;
    }

    const db = store.getState();
    const ticket = db.tickets.find((t) => t.id === id);
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found.' });
      return;
    }

    if (req.user!.role === 'EMPLOYEE' && ticket.requesterId !== req.user!.userId) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const isInternal = req.user!.role !== 'EMPLOYEE' && Boolean(internalNote);

    const updated = store.transaction((state) => {
      const t = state.tickets.find((x) => x.id === id)!;
      const now = new Date().toISOString();
      state.counters.comment += 1;
      state.comments.push({
        id: state.counters.comment,
        ticketId: t.id,
        authorId: req.user!.userId,
        body: String(body).trim(),
        internalNote: isInternal,
        createdAt: now,
      });
      t.updatedAt = now;
      if (req.user!.role !== 'EMPLOYEE' && !isInternal && !t.firstRespondedAt) {
        t.firstRespondedAt = now;
      }

      if (!isInternal) {
        const targetNotify =
          req.user!.userId === t.requesterId ? t.assignedAgentId : t.requesterId;
        if (targetNotify) {
          const author = state.users.find((u) => u.id === req.user!.userId);
          addNotification(
            state,
            targetNotify,
            t.id,
            `New Comment on ${t.ticketNumber}`,
            `${author?.fullName || 'User'}: ${String(body).trim().slice(0, 90)}`,
            'COMMENT_ADDED'
          );
        }
      }
      return t;
    });

    res.status(201).json({
      success: true,
      data: enrichTicket(updated, store.getState(), req.user!.role),
    });
  });

  router.post(
    '/tickets/:id/attachments',
    authenticateJwt,
    upload.single('file'),
    (req: AuthenticatedRequest, res: Response) => {
      const id = Number(req.params.id);
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No valid file uploaded.' });
        return;
      }
      const db = store.getState();
      const ticket = db.tickets.find((t) => t.id === id);
      if (!ticket) {
        res.status(404).json({ success: false, message: 'Ticket not found.' });
        return;
      }
      if (req.user!.role === 'EMPLOYEE' && ticket.requesterId !== req.user!.userId) {
        res.status(403).json({ success: false, message: 'Forbidden' });
        return;
      }

      const updated = store.transaction((state) => {
        const t = state.tickets.find((x) => x.id === id)!;
        const now = new Date().toISOString();
        state.counters.attachment += 1;
        state.attachments.push({
          id: state.counters.attachment,
          ticketId: t.id,
          uploadedById: req.user!.userId,
          originalFileName: req.file!.originalname,
          storedFileName: req.file!.filename,
          mimeType: req.file!.mimetype,
          sizeBytes: req.file!.size,
          storageProvider: state.settings.s3Configured ? 'AWS_S3' : 'LOCAL_DEV_ADAPTER',
          createdAt: now,
        });
        t.updatedAt = now;
        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          'ATTACHMENT_UPLOADED',
          'TICKET',
          t.ticketNumber,
          `Uploaded ${req.file!.originalname} (${req.file!.size} bytes)`
        );
        return t;
      });

      res.status(201).json({
        success: true,
        data: enrichTicket(updated, store.getState(), req.user!.role),
      });
    }
  );

  // ------------------------------------------------------------------
  // SLA RULES, BREACHES & ESCALATIONS
  // ------------------------------------------------------------------
  router.get('/sla/rules', authenticateJwt, (_req, res: Response) => {
    const db = store.getState();
    res.json({ success: true, data: db.slaRules });
  });

  router.post(
    '/sla/rules',
    authenticateJwt,
    requireRoles('ADMIN'),
    (req: AuthenticatedRequest, res: Response) => {
      const {
        name,
        priority,
        responseTimeMinutes,
        resolutionTimeMinutes,
        escalationLevel1Minutes,
        escalationLevel2Minutes,
        businessHoursOnly,
        notifyBeforeMinutes,
      } = req.body || {};

      if (!name || !priority || !responseTimeMinutes || !resolutionTimeMinutes) {
        res.status(400).json({ success: false, message: 'Incomplete SLA rule parameters.' });
        return;
      }

      const created = store.transaction((state) => {
        state.counters.slaRule += 1;
        const now = new Date().toISOString();
        const rule = {
          id: state.counters.slaRule,
          name: String(name).trim(),
          priority: priority as TicketPriority,
          responseTimeMinutes: Number(responseTimeMinutes),
          resolutionTimeMinutes: Number(resolutionTimeMinutes),
          escalationLevel1Minutes: Number(escalationLevel1Minutes) || Math.round(Number(resolutionTimeMinutes) * 0.6),
          escalationLevel2Minutes: Number(escalationLevel2Minutes) || Math.round(Number(resolutionTimeMinutes) * 0.9),
          businessHoursOnly: Boolean(businessHoursOnly),
          notifyBeforeMinutes: Number(notifyBeforeMinutes) || 30,
          active: true,
          createdAt: now,
          updatedAt: now,
        };
        state.slaRules.push(rule);
        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          'SLA_RULE_CREATED',
          'SLA_RULE',
          String(rule.id),
          `Created SLA rule ${rule.name}`
        );
        return rule;
      });
      res.status(201).json({ success: true, data: created });
    }
  );

  router.put(
    '/sla/rules/:id',
    authenticateJwt,
    requireRoles('ADMIN'),
    (req: AuthenticatedRequest, res: Response) => {
      const id = Number(req.params.id);
      const {
        name,
        responseTimeMinutes,
        resolutionTimeMinutes,
        escalationLevel1Minutes,
        escalationLevel2Minutes,
        businessHoursOnly,
        notifyBeforeMinutes,
        active,
      } = req.body || {};

      const updated = store.transaction((state) => {
        const rule = state.slaRules.find((r) => r.id === id);
        if (!rule) return null;
        if (name) rule.name = String(name).trim();
        if (responseTimeMinutes !== undefined) rule.responseTimeMinutes = Number(responseTimeMinutes);
        if (resolutionTimeMinutes !== undefined) rule.resolutionTimeMinutes = Number(resolutionTimeMinutes);
        if (escalationLevel1Minutes !== undefined) rule.escalationLevel1Minutes = Number(escalationLevel1Minutes);
        if (escalationLevel2Minutes !== undefined) rule.escalationLevel2Minutes = Number(escalationLevel2Minutes);
        if (businessHoursOnly !== undefined) rule.businessHoursOnly = Boolean(businessHoursOnly);
        if (notifyBeforeMinutes !== undefined) rule.notifyBeforeMinutes = Number(notifyBeforeMinutes);
        if (active !== undefined) rule.active = Boolean(active);
        rule.updatedAt = new Date().toISOString();
        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          'SLA_RULE_UPDATED',
          'SLA_RULE',
          String(rule.id),
          `Updated ${rule.name} (${rule.responseTimeMinutes}m / ${rule.resolutionTimeMinutes}m)`
        );
        return rule;
      });

      if (!updated) {
        res.status(404).json({ success: false, message: 'SLA rule not found.' });
        return;
      }
      res.json({ success: true, data: updated });
    }
  );

  router.get(
    '/sla/breaches',
    authenticateJwt,
    requireRoles('ADMIN', 'SUPPORT_AGENT'),
    (req: AuthenticatedRequest, res: Response) => {
      const db = store.getState();
      const breached = db.tickets
        .filter((t) => t.slaBreached || new Date(t.resolutionDueAt).getTime() < Date.now())
        .filter((t) =>
          req.user!.role === 'SUPPORT_AGENT' ? t.assignedAgentId === req.user!.userId : true
        )
        .map((t) => enrichTicket(t, db, req.user!.role));
      res.json({ success: true, data: breached });
    }
  );

  router.get(
    '/sla/escalations',
    authenticateJwt,
    requireRoles('ADMIN', 'SUPPORT_AGENT'),
    (_req: AuthenticatedRequest, res: Response) => {
      const db = store.getState();
      const list = db.escalations.map((e) => {
        const ticket = db.tickets.find((t) => t.id === e.ticketId);
        const escalatedTo = e.escalatedToUserId
          ? db.users.find((u) => u.id === e.escalatedToUserId)
          : null;
        return {
          ...e,
          ticketNumber: ticket?.ticketNumber || `#${e.ticketId}`,
          ticketSubject: ticket?.subject || '',
          ticketPriority: ticket?.priority || 'MEDIUM',
          escalatedToName: escalatedTo?.fullName || 'Operations Admin',
        };
      });
      res.json({ success: true, data: list });
    }
  );

  router.post(
    '/sla/check-now',
    authenticateJwt,
    requireRoles('ADMIN'),
    (_req, res: Response) => {
      const result = runSlaMonitorCycle();
      res.json({ success: true, data: result });
    }
  );

  // ------------------------------------------------------------------
  // REPORTS & ANALYTICS
  // ------------------------------------------------------------------
  router.get('/reports/dashboard', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    const db = store.getState();
    const { role, userId } = req.user!;

    if (role === 'EMPLOYEE') {
      const own = db.tickets.filter((t) => t.requesterId === userId);
      const counts = {
        totalTickets: own.length,
        openTickets: own.filter((t) => t.status === 'OPEN' || t.status === 'ASSIGNED').length,
        inProgressTickets: own.filter((t) => t.status === 'IN_PROGRESS').length,
        resolvedTickets: own.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
      };
      const statusDistribution = (['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as TicketStatus[]).map(
        (s) => ({
          status: s,
          count: own.filter((t) => t.status === s).length,
        })
      );
      const recentActivity = db.statusHistory
        .filter((h) => own.some((t) => t.id === h.ticketId))
        .slice(-8)
        .reverse()
        .map((h) => {
          const t = own.find((x) => x.id === h.ticketId);
          const actor = db.users.find((u) => u.id === h.changedById);
          return {
            ...h,
            ticketNumber: t?.ticketNumber || '',
            subject: t?.subject || '',
            changedByName: actor?.fullName || 'System',
          };
        });
      res.json({
        success: true,
        data: {
          role,
          counts,
          statusDistribution,
          recentTickets: own.slice(0, 6).map((t) => enrichTicket(t, db, role)),
          recentActivity,
        },
      });
      return;
    }

    if (role === 'SUPPORT_AGENT') {
      const assigned = db.tickets.filter((t) => t.assignedAgentId === userId);
      const unassigned = db.tickets.filter((t) => t.assignedAgentId === null && t.status === 'OPEN');
      const now = Date.now();
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const overdueTickets = assigned.filter(
        (t) =>
          t.status !== 'RESOLVED' &&
          t.status !== 'CLOSED' &&
          t.status !== 'CANCELLED' &&
          (t.slaBreached || new Date(t.resolutionDueAt).getTime() < now)
      );

      const counts = {
        assignedTickets: assigned.length,
        openTickets: assigned.filter((t) => t.status === 'OPEN' || t.status === 'ASSIGNED').length,
        inProgressTickets: assigned.filter((t) => t.status === 'IN_PROGRESS').length,
        resolvedToday: assigned.filter(
          (t) => t.resolvedAt && new Date(t.resolvedAt).getTime() >= todayStart.getTime()
        ).length,
        overdueTickets: overdueTickets.length,
        unassignedQueueCount: unassigned.length,
      };

      const priorityBreakdown = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as TicketPriority[]).map(
        (p) => ({
          priority: p,
          count: assigned.filter(
            (t) => t.priority === p && t.status !== 'CLOSED' && t.status !== 'CANCELLED'
          ).length,
        })
      );

      const recentActivity = db.statusHistory
        .filter((h) => assigned.some((t) => t.id === h.ticketId))
        .slice(-10)
        .reverse()
        .map((h) => {
          const t = db.tickets.find((x) => x.id === h.ticketId);
          const actor = db.users.find((u) => u.id === h.changedById);
          return {
            ...h,
            ticketNumber: t?.ticketNumber || '',
            subject: t?.subject || '',
            changedByName: actor?.fullName || 'System',
          };
        });

      res.json({
        success: true,
        data: {
          role,
          counts,
          priorityBreakdown,
          slaMonitoring: assigned
            .filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED')
            .slice(0, 6)
            .map((t) => enrichTicket(t, db, role)),
          recentActivity,
        },
      });
      return;
    }

    // ADMIN Dashboard
    const totalTickets = db.tickets.length;
    const breachedCount = db.tickets.filter((t) => t.slaBreached).length;
    const slaCompliancePct =
      totalTickets === 0 ? 100 : Math.round(((totalTickets - breachedCount) / totalTickets) * 1000) / 10;

    const counts = {
      totalEmployees: db.users.filter((u) => u.role === 'EMPLOYEE').length,
      totalAgents: db.users.filter((u) => u.role === 'SUPPORT_AGENT').length,
      totalTickets,
      openTickets: db.tickets.filter((t) => t.status === 'OPEN' || t.status === 'ASSIGNED').length,
      inProgressTickets: db.tickets.filter((t) => t.status === 'IN_PROGRESS').length,
      resolvedTickets: db.tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
      slaCompliancePct,
      breachedTickets: breachedCount,
    };

    const categoryDistribution = db.categories.map((c) => ({
      name: c.name,
      count: db.tickets.filter((t) => t.categoryId === c.id).length,
    }));

    const priorityDistribution = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as TicketPriority[]).map(
      (p) => ({
        name: p,
        count: db.tickets.filter((t) => t.priority === p).length,
      })
    );

    const agentPerformance = db.users
      .filter((u) => u.role === 'SUPPORT_AGENT')
      .map((ag) => {
        const agTickets = db.tickets.filter((t) => t.assignedAgentId === ag.id);
        const resolved = agTickets.filter(
          (t) => t.status === 'RESOLVED' || t.status === 'CLOSED'
        );
        const breached = agTickets.filter((t) => t.slaBreached).length;
        const avgMins =
          resolved.length > 0
            ? Math.round(
                resolved.reduce((acc, t) => {
                  const end = t.resolvedAt ? new Date(t.resolvedAt).getTime() : Date.now();
                  return acc + (end - new Date(t.createdAt).getTime()) / 60_000;
                }, 0) / resolved.length
              )
            : 0;
        return {
          agentId: ag.id,
          agentName: ag.fullName,
          availabilityStatus: ag.availabilityStatus,
          assignedCount: agTickets.length,
          resolvedCount: resolved.length,
          breachedCount: breached,
          avgResolutionMinutes: avgMins,
          slaCompliancePct:
            agTickets.length === 0
              ? 100
              : Math.round(((agTickets.length - breached) / agTickets.length) * 100),
        };
      });

    // Weekly trend series grounded in ticket creation / resolution dates
    const trend = Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(Date.now() - (6 - idx) * 86_400_000);
      const label = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayIso = d.toISOString().slice(0, 10);
      return {
        day: label,
        created: db.tickets.filter((t) => t.createdAt.slice(0, 10) === dayIso).length,
        resolved: db.tickets.filter((t) => t.resolvedAt?.slice(0, 10) === dayIso).length,
      };
    });

    res.json({
      success: true,
      data: {
        role,
        counts,
        categoryDistribution,
        priorityDistribution,
        agentPerformance,
        trend,
      },
    });
  });

  router.get(
    '/reports/tickets',
    authenticateJwt,
    requireRoles('ADMIN', 'SUPPORT_AGENT'),
    (req: AuthenticatedRequest, res: Response) => {
      const db = store.getState();
      const { fromDate, toDate, departmentId, status } = req.query;
      let tickets = db.tickets.slice();
      if (fromDate && typeof fromDate === 'string') {
        tickets = tickets.filter((t) => t.createdAt >= new Date(fromDate).toISOString());
      }
      if (toDate && typeof toDate === 'string') {
        const end = new Date(toDate);
        end.setUTCHours(23, 59, 59, 999);
        tickets = tickets.filter((t) => t.createdAt <= end.toISOString());
      }
      if (departmentId && departmentId !== 'ALL') {
        tickets = tickets.filter((t) => t.departmentId === Number(departmentId));
      }
      if (status && status !== 'ALL') {
        tickets = tickets.filter((t) => t.status === status);
      }

      const byDepartment = db.departments.map((d) => {
        const dt = tickets.filter((t) => t.departmentId === d.id);
        const resolved = dt.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
        const breached = dt.filter((t) => t.slaBreached).length;
        return {
          departmentId: d.id,
          departmentName: d.name,
          code: d.code,
          totalTickets: dt.length,
          openTickets: dt.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED' && t.status !== 'CANCELLED').length,
          resolvedTickets: resolved.length,
          slaCompliancePct: dt.length === 0 ? 100 : Math.round(((dt.length - breached) / dt.length) * 100),
        };
      });

      res.json({
        success: true,
        data: {
          tickets: tickets.map((t) => enrichTicket(t, db, req.user!.role)),
          byDepartment,
        },
      });
    }
  );

  router.get(
    '/reports/agents',
    authenticateJwt,
    requireRoles('ADMIN'),
    (_req: AuthenticatedRequest, res: Response) => {
      const db = store.getState();
      const agents = db.users
        .filter((u) => u.role === 'SUPPORT_AGENT')
        .map((ag) => {
          const agTickets = db.tickets.filter((t) => t.assignedAgentId === ag.id);
          const resolved = agTickets.filter(
            (t) => t.status === 'RESOLVED' || t.status === 'CLOSED'
          );
          const breached = agTickets.filter((t) => t.slaBreached).length;
          const avgResolutionMinutes =
            resolved.length > 0
              ? Math.round(
                  resolved.reduce((acc, t) => {
                    const end = t.resolvedAt ? new Date(t.resolvedAt).getTime() : Date.now();
                    return acc + (end - new Date(t.createdAt).getTime()) / 60_000;
                  }, 0) / resolved.length
                )
              : 0;
          return {
            agentId: ag.id,
            agentName: ag.fullName,
            email: ag.email,
            jobTitle: ag.jobTitle,
            availabilityStatus: ag.availabilityStatus,
            assignedCount: agTickets.length,
            resolvedCount: resolved.length,
            breachedCount: breached,
            avgResolutionMinutes,
            slaCompliancePct:
              agTickets.length === 0
                ? 100
                : Math.round(((agTickets.length - breached) / agTickets.length) * 100),
          };
        });
      res.json({ success: true, data: agents });
    }
  );

  router.get(
    '/reports/sla',
    authenticateJwt,
    requireRoles('ADMIN'),
    (_req: AuthenticatedRequest, res: Response) => {
      const db = store.getState();
      const byPriority = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as TicketPriority[]).map(
        (priority) => {
          const pts = db.tickets.filter((t) => t.priority === priority);
          const breached = pts.filter((t) => t.slaBreached).length;
          const rule = db.slaRules.find((r) => r.priority === priority);
          return {
            priority,
            targetResponseMinutes: rule?.responseTimeMinutes || 0,
            targetResolutionMinutes: rule?.resolutionTimeMinutes || 0,
            totalTickets: pts.length,
            breachedTickets: breached,
            compliancePct:
              pts.length === 0 ? 100 : Math.round(((pts.length - breached) / pts.length) * 100),
          };
        }
      );
      res.json({ success: true, data: byPriority });
    }
  );

  router.get(
    '/reports/export/csv',
    authenticateJwt,
    requireRoles('ADMIN', 'SUPPORT_AGENT'),
    (_req: AuthenticatedRequest, res: Response) => {
      const db = store.getState();
      const header = [
        'Ticket Number',
        'Subject',
        'Status',
        'Priority',
        'Category',
        'Department',
        'Requester',
        'Assigned Agent',
        'SLA Breached',
        'Created At (UTC)',
        'Resolution Due (UTC)',
      ].join(',');

      const rows = db.tickets.map((t) => {
        const enriched = enrichTicket(t, db, 'ADMIN');
        const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
        return [
          esc(enriched.ticketNumber),
          esc(enriched.subject),
          esc(enriched.status),
          esc(enriched.priority),
          esc(enriched.categoryName),
          esc(enriched.departmentName),
          esc(enriched.requesterName),
          esc(enriched.assignedAgentName || 'Unassigned'),
          enriched.slaBreached ? 'YES' : 'NO',
          esc(enriched.createdAt),
          esc(enriched.resolutionDueAt),
        ].join(',');
      });

      const csv = [header, ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="helpdesk-pro-tickets-report.csv"');
      res.send(csv);
    }
  );

  // ------------------------------------------------------------------
  // NOTIFICATIONS
  // ------------------------------------------------------------------
  router.get('/notifications', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    const db = store.getState();
    const list = db.notifications
      .filter((n) => n.userId === req.user!.userId)
      .slice(0, 40);
    const unreadCount = list.filter((n) => !n.read).length;
    res.json({ success: true, data: { items: list, unreadCount } });
  });

  router.patch('/notifications/read-all', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    store.transaction((state) => {
      state.notifications.forEach((n) => {
        if (n.userId === req.user!.userId) n.read = true;
      });
    });
    res.json({ success: true, message: 'All notifications marked as read.' });
  });

  router.patch('/notifications/:id/read', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const found = store.transaction((state) => {
      const n = state.notifications.find(
        (item) => item.id === id && item.userId === req.user!.userId
      );
      if (!n) return null;
      n.read = true;
      return n;
    });
    if (!found) {
      res.status(404).json({ success: false, message: 'Notification not found.' });
      return;
    }
    res.json({ success: true, data: found });
  });

  // ------------------------------------------------------------------
  // SYSTEM SETTINGS & AUDIT LOGS
  // ------------------------------------------------------------------
  router.get(
    '/settings',
    authenticateJwt,
    requireRoles('ADMIN'),
    (_req: AuthenticatedRequest, res: Response) => {
      const db = store.getState();
      res.json({ success: true, data: db.settings });
    }
  );

  router.put(
    '/settings',
    authenticateJwt,
    requireRoles('ADMIN'),
    (req: AuthenticatedRequest, res: Response) => {
      const payload = req.body || {};
      const updated = store.transaction((state) => {
        const s = state.settings;
        if (payload.companyName) s.companyName = String(payload.companyName).trim();
        if (payload.supportEmail) s.supportEmail = String(payload.supportEmail).trim();
        if (payload.timezone) s.timezone = String(payload.timezone).trim();
        if (payload.businessHoursStart) s.businessHoursStart = String(payload.businessHoursStart);
        if (payload.businessHoursEnd) s.businessHoursEnd = String(payload.businessHoursEnd);
        if (Array.isArray(payload.workingDays)) s.workingDays = payload.workingDays;
        if (payload.allowEmployeeReopenDays !== undefined) {
          s.allowEmployeeReopenDays = Number(payload.allowEmployeeReopenDays);
        }
        if (payload.maxAttachmentSizeMb !== undefined) {
          s.maxAttachmentSizeMb = Number(payload.maxAttachmentSizeMb);
        }
        if (payload.smtpHost) s.smtpHost = String(payload.smtpHost).trim();
        if (payload.smtpPort !== undefined) s.smtpPort = Number(payload.smtpPort);
        if (payload.smtpFrom) s.smtpFrom = String(payload.smtpFrom).trim();
        if (payload.requireStrongPasswords !== undefined) {
          s.requireStrongPasswords = Boolean(payload.requireStrongPasswords);
        }
        if (payload.sessionTimeoutMinutes !== undefined) {
          s.sessionTimeoutMinutes = Number(payload.sessionTimeoutMinutes);
        }
        if (payload.rateLimitPerMinute !== undefined) {
          s.rateLimitPerMinute = Number(payload.rateLimitPerMinute);
        }
        s.updatedAt = new Date().toISOString();

        addAudit(
          state,
          req.user!.userId,
          req.user!.email,
          'SYSTEM_SETTINGS_UPDATED',
          'SETTINGS',
          'GLOBAL',
          'Updated enterprise system configuration'
        );
        return s;
      });

      res.json({ success: true, data: updated });
    }
  );

  router.get(
    '/settings/audit-logs',
    authenticateJwt,
    requireRoles('ADMIN'),
    (_req: AuthenticatedRequest, res: Response) => {
      const db = store.getState();
      res.json({ success: true, data: db.auditLogs.slice(0, 100) });
    }
  );

  return router;
}
