import { store } from './store.ts';
import { TicketPriority } from './types.ts';

export function computeSlaDeadlines(priority: TicketPriority, createdAtIso?: string) {
  const db = store.getState();
  const rule =
    db.slaRules.find((r) => r.priority === priority && r.active) ||
    db.slaRules.find((r) => r.priority === 'MEDIUM') || {
      responseTimeMinutes: 240,
      resolutionTimeMinutes: 1440,
      notifyBeforeMinutes: 60,
    };

  const baseMs = createdAtIso ? new Date(createdAtIso).getTime() : Date.now();
  const responseDueAt = new Date(baseMs + rule.responseTimeMinutes * 60_000).toISOString();
  const resolutionDueAt = new Date(baseMs + rule.resolutionTimeMinutes * 60_000).toISOString();
  return { responseDueAt, resolutionDueAt };
}

export function runSlaMonitorCycle(): {
  warningsTriggered: number;
  breachesDetected: number;
  escalationsCreated: number;
} {
  let warningsTriggered = 0;
  let breachesDetected = 0;
  let escalationsCreated = 0;

  store.transaction((db) => {
    const nowMs = Date.now();
    const admins = db.users.filter((u) => u.role === 'ADMIN' && u.active);

    for (const ticket of db.tickets) {
      if (
        ticket.status === 'RESOLVED' ||
        ticket.status === 'CLOSED' ||
        ticket.status === 'CANCELLED'
      ) {
        continue;
      }

      const rule = db.slaRules.find((r) => r.priority === ticket.priority && r.active);
      const notifyBeforeMs = (rule?.notifyBeforeMinutes ?? 60) * 60_000;
      const resolutionDueMs = new Date(ticket.resolutionDueAt).getTime();
      const remainingMs = resolutionDueMs - nowMs;

      // Approaching SLA deadline warning
      if (remainingMs > 0 && remainingMs <= notifyBeforeMs && !ticket.slaWarningSent) {
        ticket.slaWarningSent = true;
        ticket.updatedAt = new Date().toISOString();
        warningsTriggered += 1;

        const targetUserIds = new Set<number>();
        if (ticket.assignedAgentId) targetUserIds.add(ticket.assignedAgentId);
        admins.forEach((a) => targetUserIds.add(a.id));

        for (const uid of targetUserIds) {
          db.counters.notification += 1;
          db.notifications.unshift({
            id: db.counters.notification,
            userId: uid,
            ticketId: ticket.id,
            title: `SLA Deadline Approaching: ${ticket.ticketNumber}`,
            message: `Ticket "${ticket.subject}" is within ${Math.max(1, Math.round(remainingMs / 60_000))}m of its SLA deadline.`,
            eventType: 'SLA_WARNING',
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
      }

      // SLA Breach detection & Escalation
      if (remainingMs <= 0 && !ticket.slaBreached) {
        ticket.slaBreached = true;
        ticket.escalationLevel = Math.max(1, ticket.escalationLevel + 1);
        ticket.updatedAt = new Date().toISOString();
        breachesDetected += 1;
        escalationsCreated += 1;

        const leadAdmin = admins[0] || null;
        db.counters.escalation += 1;
        db.escalations.unshift({
          id: db.counters.escalation,
          ticketId: ticket.id,
          level: ticket.escalationLevel,
          reason: `${ticket.priority} ticket exceeded resolution SLA deadline.`,
          escalatedToUserId: leadAdmin ? leadAdmin.id : null,
          escalatedAt: new Date().toISOString(),
        });

        const notifyTargets = new Set<number>();
        if (ticket.assignedAgentId) notifyTargets.add(ticket.assignedAgentId);
        admins.forEach((a) => notifyTargets.add(a.id));

        for (const uid of notifyTargets) {
          db.counters.notification += 1;
          db.notifications.unshift({
            id: db.counters.notification,
            userId: uid,
            ticketId: ticket.id,
            title: `SLA Breached & Escalated: ${ticket.ticketNumber}`,
            message: `Ticket "${ticket.subject}" breached SLA and was escalated to Level ${ticket.escalationLevel}.`,
            eventType: 'SLA_BREACH',
            read: false,
            createdAt: new Date().toISOString(),
          });
        }

        db.counters.auditLog += 1;
        db.auditLogs.unshift({
          id: db.counters.auditLog,
          actorId: null,
          actorEmail: 'sla-scheduler@system',
          action: 'SLA_BREACH_ESCALATION',
          entityType: 'TICKET',
          entityId: ticket.ticketNumber,
          details: `Automated SLA breach escalation (Level ${ticket.escalationLevel})`,
          ipAddress: '127.0.0.1',
          createdAt: new Date().toISOString(),
        });
      }
    }
  });

  return { warningsTriggered, breachesDetected, escalationsCreated };
}
