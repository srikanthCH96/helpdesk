import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MinusCircle,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { TicketPriority, TicketStatus } from '../types';

export const StatusLabel: React.FC<{ status: TicketStatus }> = ({ status }) => {
  const map: Record<
    TicketStatus,
    { label: string; colorClass: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    OPEN: {
      label: 'Open',
      colorClass: 'text-blue-700 bg-blue-50 border-blue-200',
      Icon: AlertCircle,
    },
    ASSIGNED: {
      label: 'Assigned',
      colorClass: 'text-indigo-700 bg-indigo-50 border-indigo-200',
      Icon: UserCheck,
    },
    IN_PROGRESS: {
      label: 'In Progress',
      colorClass: 'text-amber-700 bg-amber-50 border-amber-200',
      Icon: Clock,
    },
    RESOLVED: {
      label: 'Resolved',
      colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      Icon: CheckCircle2,
    },
    CLOSED: {
      label: 'Closed',
      colorClass: 'text-slate-700 bg-slate-100 border-slate-200',
      Icon: MinusCircle,
    },
    CANCELLED: {
      label: 'Cancelled',
      colorClass: 'text-red-700 bg-red-50 border-red-200',
      Icon: XCircle,
    },
  };

  const cfg = map[status] || map.OPEN;
  const Icon = cfg.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 ${cfg.colorClass}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{cfg.label}</span>
    </span>
  );
};

export const PriorityLabel: React.FC<{ priority: TicketPriority }> = ({ priority }) => {
  const map: Record<
    TicketPriority,
    { label: string; colorClass: string; showAlert?: boolean }
  > = {
    CRITICAL: {
      label: 'Critical',
      colorClass: 'text-red-700 bg-red-50 border-red-200',
      showAlert: true,
    },
    HIGH: {
      label: 'High',
      colorClass: 'text-amber-700 bg-amber-50 border-amber-200',
      showAlert: true,
    },
    MEDIUM: {
      label: 'Medium',
      colorClass: 'text-slate-700 bg-slate-100 border-slate-200',
    },
    LOW: {
      label: 'Low',
      colorClass: 'text-slate-600 bg-white border-slate-200',
    },
  };

  const cfg = map[priority] || map.MEDIUM;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 ${cfg.colorClass}`}
    >
      {cfg.showAlert && <AlertTriangle className="w-3 h-3 shrink-0" />}
      <span>{cfg.label}</span>
    </span>
  );
};
