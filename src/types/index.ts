export type RoleName = 'EMPLOYEE' | 'SUPPORT_AGENT' | 'ADMIN';

export type TicketStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'
  | 'CANCELLED';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface User {
  id: number;
  fullName: string;
  email: string;
  role: RoleName;
  departmentId: number;
  departmentName: string;
  jobTitle: string;
  phone: string;
  avatarUrl: string | null;
  active: boolean;
  availabilityStatus: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
  maxConcurrentTickets: number;
  activeAssignedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  managerName: string;
  description: string;
  memberCount?: number;
  openTicketCount?: number;
}

export interface TicketCategory {
  id: number;
  name: string;
  description: string;
  defaultPriority: TicketPriority;
  active: boolean;
}

export interface SlaRule {
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
}

export interface TicketComment {
  id: number;
  ticketId: number;
  authorId: number;
  authorName: string;
  authorRole: RoleName;
  body: string;
  internalNote: boolean;
  createdAt: string;
}

export interface TicketAttachment {
  id: number;
  ticketId: number;
  uploadedById: number;
  uploadedByName: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  downloadUrl: string;
  createdAt: string;
}

export interface TicketStatusHistory {
  id: number;
  ticketId: number;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  changedById: number;
  changedByName: string;
  reason: string;
  changedAt: string;
}

export interface TicketAssignment {
  id: number;
  ticketId: number;
  agentId: number;
  agentName: string;
  assignedById: number;
  assignedByName: string;
  notes: string;
  assignedAt: string;
}

export interface TicketEscalation {
  id: number;
  ticketId: number;
  level: number;
  reason: string;
  escalatedToUserId: number | null;
  escalatedAt: string;
  ticketNumber?: string;
  ticketSubject?: string;
  ticketPriority?: TicketPriority;
  escalatedToName?: string;
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  categoryId: number;
  categoryName: string;
  departmentId: number;
  departmentName: string;
  requesterId: number;
  requesterName: string;
  requesterEmail: string;
  requesterJobTitle: string;
  assignedAgentId: number | null;
  assignedAgentName: string | null;
  assignedAgentEmail: string | null;
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
  comments: TicketComment[];
  attachments: TicketAttachment[];
  statusHistory: TicketStatusHistory[];
  assignments: TicketAssignment[];
  escalations: TicketEscalation[];
}

export interface NotificationItem {
  id: number;
  userId: number;
  ticketId: number | null;
  title: string;
  message: string;
  eventType: string;
  read: boolean;
  createdAt: string;
}

export interface AuditLogItem {
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

export interface SystemSettings {
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
