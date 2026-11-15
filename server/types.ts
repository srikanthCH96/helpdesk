export type RoleName = 'EMPLOYEE' | 'SUPPORT_AGENT' | 'ADMIN';

export type TicketStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'
  | 'CANCELLED';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DepartmentRecord {
  id: number;
  name: string;
  code: string;
  managerName: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: number;
  fullName: string;
  email: string;
  passwordHash: string;
  role: RoleName;
  departmentId: number;
  jobTitle: string;
  phone: string;
  avatarUrl?: string;
  active: boolean;
  availabilityStatus: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
  maxConcurrentTickets: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketCategoryRecord {
  id: number;
  name: string;
  description: string;
  defaultPriority: TicketPriority;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SlaRuleRecord {
  id: number;
  name: string;
  priority: TicketPriority;
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
  escalationLevel1Minutes: number;
  escalationLevel2Minutes: number;
  businessHoursOnly: boolean;
  notifyBeforeMinutes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketRecord {
  id: number;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  categoryId: number;
  departmentId: number;
  requesterId: number;
  assignedAgentId: number | null;
  responseDueAt: string;
  resolutionDueAt: string;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaBreached: boolean;
  slaWarningSent: boolean;
  escalationLevel: number;
  resolutionSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketCommentRecord {
  id: number;
  ticketId: number;
  authorId: number;
  body: string;
  internalNote: boolean;
  createdAt: string;
}

export interface TicketAttachmentRecord {
  id: number;
  ticketId: number;
  uploadedById: number;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: 'LOCAL_DEV_ADAPTER' | 'AWS_S3';
  createdAt: string;
}

export interface TicketAssignmentRecord {
  id: number;
  ticketId: number;
  agentId: number;
  assignedById: number;
  notes: string;
  assignedAt: string;
}

export interface TicketStatusHistoryRecord {
  id: number;
  ticketId: number;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  changedById: number;
  reason: string;
  changedAt: string;
}

export interface TicketEscalationRecord {
  id: number;
  ticketId: number;
  level: number;
  reason: string;
  escalatedToUserId: number | null;
  escalatedAt: string;
}

export interface NotificationRecord {
  id: number;
  userId: number;
  ticketId: number | null;
  title: string;
  message: string;
  eventType: string;
  read: boolean;
  createdAt: string;
}

export interface AuditLogRecord {
  id: number;
  actorId: number | null;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

export interface PasswordResetTokenRecord {
  id: number;
  userId: number;
  token: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export interface SystemSettingsRecord {
  companyName: string;
  supportEmail: string;
  timezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  workingDays: string[];
  allowEmployeeReopenDays: number;
  maxAttachmentSizeMb: number;
  smtpConfigured: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpFrom: string;
  s3Configured: boolean;
  s3Bucket: string;
  s3Region: string;
  requireStrongPasswords: boolean;
  sessionTimeoutMinutes: number;
  rateLimitPerMinute: number;
  updatedAt: string;
}

export interface DatabaseSchema {
  departments: DepartmentRecord[];
  users: UserRecord[];
  categories: TicketCategoryRecord[];
  slaRules: SlaRuleRecord[];
  tickets: TicketRecord[];
  comments: TicketCommentRecord[];
  attachments: TicketAttachmentRecord[];
  assignments: TicketAssignmentRecord[];
  statusHistory: TicketStatusHistoryRecord[];
  escalations: TicketEscalationRecord[];
  notifications: NotificationRecord[];
  auditLogs: AuditLogRecord[];
  passwordResetTokens: PasswordResetTokenRecord[];
  settings: SystemSettingsRecord;
  counters: {
    department: number;
    user: number;
    category: number;
    slaRule: number;
    ticket: number;
    comment: number;
    attachment: number;
    assignment: number;
    statusHistory: number;
    escalation: number;
    notification: number;
    auditLog: number;
    passwordResetToken: number;
  };
}
