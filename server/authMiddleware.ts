import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { RoleName } from './types.ts';
import { store } from './store.ts';

const JWT_SECRET =
  process.env.JWT_SECRET || 'helpdesk-pro-dev-secret-key-change-in-production-2026';

export interface AuthPayload {
  userId: number;
  email: string;
  role: RoleName;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

export function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function signRefreshToken(payload: AuthPayload): string {
  return jwt.sign({ ...payload, tokenType: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

export function authenticateJwt(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;

  if (!rawToken) {
    res.status(401).json({ success: false, message: 'Authentication token is required' });
    return;
  }

  try {
    const decoded = verifyToken(rawToken);
    const db = store.getState();
    const user = db.users.find((u) => u.id === decoded.userId);
    if (!user || !user.active) {
      res.status(401).json({ success: false, message: 'User account is inactive or not found' });
      return;
    }
    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
  }
}

export function requireRoles(...allowedRoles: RoleName[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Access denied: insufficient role permissions for this operation',
      });
      return;
    }
    next();
  };
}

// Simple in-memory sliding window rate limiter for sensitive auth endpoints
const rateBuckets = new Map<string, number[]>();

export function rateLimitAuth(maxAttempts = 30, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const timestamps = (rateBuckets.get(ip) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= maxAttempts) {
      res.status(429).json({
        success: false,
        message: 'Too many authentication attempts. Please wait a minute and try again.',
      });
      return;
    }
    timestamps.push(now);
    rateBuckets.set(ip, timestamps);
    next();
  };
}
