package com.helpdeskpro.service;

import com.helpdeskpro.model.*;
import com.helpdeskpro.model.Enums.*;
import com.helpdeskpro.repository.*;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SlaSchedulerService {
    private final TicketRepository ticketRepository;
    private final SlaRuleRepository slaRuleRepository;
    private final TicketEscalationRepository escalationRepository;
    private final UserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final EmailNotificationService notificationService;

    public SlaSchedulerService(
            TicketRepository ticketRepository,
            SlaRuleRepository slaRuleRepository,
            TicketEscalationRepository escalationRepository,
            UserRepository userRepository,
            AuditLogRepository auditLogRepository,
            EmailNotificationService notificationService) {
        this.ticketRepository = ticketRepository;
        this.slaRuleRepository = slaRuleRepository;
        this.escalationRepository = escalationRepository;
        this.userRepository = userRepository;
        this.auditLogRepository = auditLogRepository;
        this.notificationService = notificationService;
    }

    public record SlaDeadlines(Instant responseDueAt, Instant resolutionDueAt) {}

    public SlaDeadlines computeDeadlines(TicketPriority priority, Instant baseTime) {
        SlaRule rule = slaRuleRepository.findByPriorityAndActiveTrue(priority)
                .orElseGet(() -> {
                    SlaRule fallback = new SlaRule();
                    fallback.setResponseTimeMinutes(240);
                    fallback.setResolutionTimeMinutes(1440);
                    return fallback;
                });
        return new SlaDeadlines(
                baseTime.plus(rule.getResponseTimeMinutes(), ChronoUnit.MINUTES),
                baseTime.plus(rule.getResolutionTimeMinutes(), ChronoUnit.MINUTES));
    }

    @Scheduled(fixedDelay = 60000)
    @Transactional
    public void monitorSlaBreachesAndWarnings() {
        Instant now = Instant.now();
        List<TicketStatus> terminal = List.of(TicketStatus.RESOLVED, TicketStatus.CLOSED, TicketStatus.CANCELLED);
        List<User> admins = userRepository.findByRolesNameAndActiveTrue(RoleName.ADMIN);

        // 1. Approaching deadline alerts (within next 60m)
        List<Ticket> approaching = ticketRepository.findByStatusNotInAndSlaWarningSentFalseAndResolutionDueAtBetween(
                terminal, now, now.plus(60, ChronoUnit.MINUTES));
        for (Ticket t : approaching) {
            t.setSlaWarningSent(true);
            ticketRepository.save(t);
            if (t.getAssignedAgent() != null) {
                notificationService.notifyUser(t.getAssignedAgent(), t,
                        "SLA Approaching: " + t.getTicketNumber(),
                        "Ticket \"" + t.getSubject() + "\" is approaching its SLA resolution deadline.",
                        "SLA_WARNING");
            }
            for (User admin : admins) {
                notificationService.notifyUser(admin, t,
                        "SLA Warning: " + t.getTicketNumber(),
                        "Ticket \"" + t.getSubject() + "\" is within 60m of SLA breach.",
                        "SLA_WARNING");
            }
        }

        // 2. Breached tickets & auto-escalation
        List<Ticket> breached = ticketRepository.findByStatusNotInAndSlaBreachedFalseAndResolutionDueAtBefore(terminal, now);
        for (Ticket t : breached) {
            t.setSlaBreached(true);
            t.setEscalationLevel(t.getEscalationLevel() + 1);
            ticketRepository.save(t);

            TicketEscalation esc = new TicketEscalation();
            esc.setTicket(t);
            esc.setLevel(t.getEscalationLevel());
            esc.setReason(t.getPriority() + " ticket exceeded SLA resolution deadline.");
            if (!admins.isEmpty()) esc.setEscalatedToUser(admins.get(0));
            escalationRepository.save(esc);

            AuditLog log = new AuditLog();
            log.setActorEmail("sla-scheduler@system");
            log.setAction("SLA_BREACH_ESCALATION");
            log.setEntityType("TICKET");
            log.setEntityId(t.getTicketNumber());
            log.setDetails("Escalated to Level " + t.getEscalationLevel());
            auditLogRepository.save(log);

            if (t.getAssignedAgent() != null) {
                notificationService.notifyUser(t.getAssignedAgent(), t,
                        "SLA Breached: " + t.getTicketNumber(),
                        "Ticket \"" + t.getSubject() + "\" breached its SLA target and was escalated.",
                        "SLA_BREACH");
            }
            for (User admin : admins) {
                notificationService.notifyUser(admin, t,
                        "Escalation Alert: " + t.getTicketNumber(),
                        "Ticket \"" + t.getSubject() + "\" breached SLA and escalated to Level " + t.getEscalationLevel() + ".",
                        "TICKET_ESCALATED");
            }
        }
    }
}
