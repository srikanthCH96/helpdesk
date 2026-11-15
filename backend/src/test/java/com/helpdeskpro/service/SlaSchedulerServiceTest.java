package com.helpdeskpro.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.helpdeskpro.model.*;
import com.helpdeskpro.model.Enums.*;
import com.helpdeskpro.repository.*;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SlaSchedulerServiceTest {

    @Mock private TicketRepository ticketRepository;
    @Mock private SlaRuleRepository slaRuleRepository;
    @Mock private TicketEscalationRepository escalationRepository;
    @Mock private UserRepository userRepository;
    @Mock private AuditLogRepository auditLogRepository;
    @Mock private EmailNotificationService notificationService;

    @InjectMocks private SlaSchedulerService slaService;

    @Test
    void computeDeadlines_usesConfiguredRuleDurations() {
        SlaRule rule = new SlaRule();
        rule.setPriority(TicketPriority.HIGH);
        rule.setResponseTimeMinutes(60);
        rule.setResolutionTimeMinutes(480);

        when(slaRuleRepository.findByPriorityAndActiveTrue(TicketPriority.HIGH)).thenReturn(Optional.of(rule));

        Instant base = Instant.parse("2026-11-15T10:00:00Z");
        var result = slaService.computeDeadlines(TicketPriority.HIGH, base);

        assertEquals(base.plus(60, ChronoUnit.MINUTES), result.responseDueAt());
        assertEquals(base.plus(480, ChronoUnit.MINUTES), result.resolutionDueAt());
    }

    @Test
    void monitorSlaBreachesAndWarnings_escalatesOverdueTickets() {
        Ticket overdue = new Ticket();
        overdue.setTicketNumber("HD-999");
        overdue.setSubject("Database Cluster Timeout");
        overdue.setPriority(TicketPriority.CRITICAL);
        overdue.setStatus(TicketStatus.IN_PROGRESS);
        overdue.setResolutionDueAt(Instant.now().minus(15, ChronoUnit.MINUTES));

        User admin = new User();
        admin.setEmail("admin@helpdeskpro.io");
        admin.setFullName("Elena Vance");

        when(userRepository.findByRolesNameAndActiveTrue(RoleName.ADMIN)).thenReturn(List.of(admin));
        when(ticketRepository.findByStatusNotInAndSlaWarningSentFalseAndResolutionDueAtBetween(any(), any(), any()))
                .thenReturn(List.of());
        when(ticketRepository.findByStatusNotInAndSlaBreachedFalseAndResolutionDueAtBefore(any(), any()))
                .thenReturn(List.of(overdue));

        slaService.monitorSlaBreachesAndWarnings();

        assertTrue(overdue.isSlaBreached());
        assertEquals(1, overdue.getEscalationLevel());
        verify(escalationRepository).save(any(TicketEscalation.class));
        verify(auditLogRepository).save(any(AuditLog.class));
    }
}
