import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { TicketStatus } from '../types';

interface Props {
  dueAt: string;
  status: TicketStatus;
  slaBreached?: boolean;
}

export const SlaCountdown: React.FC<Props> = ({ dueAt, status, slaBreached }) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (status === 'RESOLVED' || status === 'CLOSED' || status === 'CANCELLED') return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [status]);

  if (status === 'RESOLVED' || status === 'CLOSED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{slaBreached ? 'Resolved (SLA Missed)' : 'SLA Met'}</span>
      </span>
    );
  }

  if (status === 'CANCELLED') {
    return <span className="text-xs font-mono text-slate-500">Cancelled</span>;
  }

  const diffMs = new Date(dueAt).getTime() - nowMs;
  const absMins = Math.floor(Math.abs(diffMs) / 60_000);
  const hours = Math.floor(absMins / 60);
  const mins = absMins % 60;
  const formatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  if (diffMs <= 0 || slaBreached) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums font-medium text-red-700">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>Breached ({formatted} ago)</span>
      </span>
    );
  }

  const isWarning = diffMs <= 90 * 60_000;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-mono tabular-nums font-medium ${
        isWarning ? 'text-amber-700' : 'text-slate-700'
      }`}
    >
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>{formatted} left</span>
    </span>
  );
};
