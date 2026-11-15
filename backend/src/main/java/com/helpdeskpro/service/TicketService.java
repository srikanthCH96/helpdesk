package com.helpdeskpro.service;

import com.helpdeskpro.model.*;
import com.helpdeskpro.model.Enums.*;
import com.helpdeskpro.repository.*;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TicketService {
    private static final Map<TicketStatus, Set<TicketStatus>> ALLOWED_TRANSITIONS = Map.of(
        TicketStatus.OPEN, Set.of(TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.CANCELLED),
        TicketStatus.ASSIGNED, Set.of(TicketStatus.IN_PROGRESS, TicketStatus.OPEN, TicketStatus.RESOLVED, TicketStatus.CANCELLED),
        TicketStatus.IN_PROGRESS, Set.of(TicketStatus.RESOLVED, TicketStatus.ASSIGNED, TicketStatus.CLOSED),
        TicketStatus.RESOLVED, Set.of(TicketStatus.CLOSED, TicketStatus.IN_PROGRESS, TicketStatus.OPEN),
        TicketStatus.CLOSED, Set.of(TicketStatus.OPEN),
        TicketStatus.CANCELLED, Set.of()
    );

    private final TicketRepository ticketRepository;
    private final TicketCategoryRepository categoryRepository;
    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;
    private final TicketAssignmentRepository assignmentRepository;
    private final TicketStatusHistoryRepository historyRepository;
    private final TicketCommentRepository commentRepository;
    private final AuditLogRepository auditLogRepository;
    private final SlaSchedulerService slaService;
    private final EmailNotificationService notificationService;

    public TicketService(
            TicketRepository ticketRepository,
            TicketCategoryRepository categoryRepository,
            DepartmentRepository departmentRepository,
            UserRepository userRepository,
            TicketAssignmentRepository assignmentRepository,
            TicketStatusHistoryRepository historyRepository,
            TicketCommentRepository commentRepository,
            AuditLogRepository auditLogRepository,
            SlaSchedulerService slaService,
            EmailNotificationService notificationService) {
        this.ticketRepository = ticketRepository;
        this.categoryRepository = categoryRepository;
        this.departmentRepository = departmentRepository;
        this.userRepository = userRepository;
        this.assignmentRepository = assignmentRepository;
        this.historyRepository = historyRepository;
        this.commentRepository = commentRepository;
        this.auditLogRepository = auditLogRepository;
        this.slaService = slaService;
        this.notificationService = notificationService;
    }

    @Transactional
    public Ticket createTicket(User requester, String subject, String description,
                               Long categoryId, TicketPriority priority, Long departmentId) {
        TicketCategory category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new IllegalArgumentException("Invalid category ID."));
        Department department = departmentId != null
                ? departmentRepository.findById(departmentId).orElse(requester.getDepartment())
                : requester.getDepartment();

        Instant now = Instant.now();
        var deadlines = slaService.computeDeadlines(priority, now);

        Ticket t = new Ticket();
        t.setTicketNumber("HD-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase());
        t.setSubject(subject);
        t.setDescription(description);
        t.setStatus(TicketStatus.OPEN);
        t.setPriority(priority);
        t.setCategory(category);
        t.setDepartment(department);
        t.setRequester(requester);
        t.setResponseDueAt(deadlines.responseDueAt());
        t.setResolutionDueAt(deadlines.resolutionDueAt());

        Ticket saved = ticketRepository.save(t);
        recordHistory(saved, null, TicketStatus.OPEN, requester, "Ticket submitted by requester");
        recordAudit(requester, "TICKET_CREATED", saved.getTicketNumber(), "Priority: " + priority);
        notificationService.notifyUser(requester, saved, "Ticket Created: " + saved.getTicketNumber(),
                "Your ticket \"" + saved.getSubject() + "\" has been logged.", "TICKET_CREATED");
        return saved;
    }

    @Transactional
    public Ticket assignTicket(Long ticketId, Long agentId, User actor, String notes) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found."));
        User agent = userRepository.findById(agentId)
                .orElseThrow(() -> new IllegalArgumentException("Agent not found."));
        if (!agent.isActive()) {
            throw new IllegalArgumentException("Cannot assign ticket to an inactive agent.");
        }
        if (ticket.getAssignedAgent() != null && ticket.getAssignedAgent().getId().equals(agentId)) {
            throw new IllegalStateException("Ticket is already assigned to " + agent.getFullName());
        }

        TicketStatus prev = ticket.getStatus();
        ticket.setAssignedAgent(agent);
        if (prev == TicketStatus.OPEN) {
            ticket.setStatus(TicketStatus.ASSIGNED);
            recordHistory(ticket, prev, TicketStatus.ASSIGNED, actor, "Assigned to " + agent.getFullName());
        }
        ticket.setUpdatedAt(Instant.now());
        Ticket saved = ticketRepository.save(ticket);

        TicketAssignment assign = new TicketAssignment();
        assign.setTicket(saved);
        assign.setAgent(agent);
        assign.setAssignedBy(actor);
        assign.setNotes(notes != null ? notes : "Assigned by " + actor.getFullName());
        assignmentRepository.save(assign);

        notificationService.notifyUser(agent, saved, "Assigned Ticket: " + saved.getTicketNumber(),
                "You were assigned \"" + saved.getSubject() + "\".", "TICKET_ASSIGNED");
        notificationService.notifyUser(saved.getRequester(), saved, "Agent Assigned: " + saved.getTicketNumber(),
                agent.getFullName() + " is now handling your request.", "TICKET_ASSIGNED");
        recordAudit(actor, "TICKET_ASSIGNED", saved.getTicketNumber(), "Assigned to " + agent.getEmail());
        return saved;
    }

    @Transactional
    public Ticket transitionStatus(Long ticketId, TicketStatus nextStatus, User actor, String reason) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found."));

        boolean isEmployee = actor.getRoles().stream().anyMatch(r -> r.getName() == RoleName.EMPLOYEE)
                && actor.getRoles().size() == 1;
        if (isEmployee && !ticket.getRequester().getId().equals(actor.getId())) {
            throw new AccessDeniedException("Employees cannot modify another employee's ticket.");
        }
        if (isEmployee && nextStatus != TicketStatus.CANCELLED && nextStatus != TicketStatus.CLOSED) {
            throw new AccessDeniedException("Employees may only cancel or confirm closure of their own tickets.");
        }

        Set<TicketStatus> allowed = ALLOWED_TRANSITIONS.getOrDefault(ticket.getStatus(), Set.of());
        if (!allowed.contains(nextStatus)) {
            throw new IllegalArgumentException("Invalid status transition from " + ticket.getStatus() + " to " + nextStatus);
        }

        TicketStatus prev = ticket.getStatus();
        Instant now = Instant.now();
        ticket.setStatus(nextStatus);
        ticket.setUpdatedAt(now);
        if (nextStatus == TicketStatus.IN_PROGRESS && ticket.getFirstRespondedAt() == null) {
            ticket.setFirstRespondedAt(now);
        }
        if (nextStatus == TicketStatus.RESOLVED) {
            ticket.setResolvedAt(now);
        }
        if (nextStatus == TicketStatus.CLOSED) {
            ticket.setClosedAt(now);
        }

        Ticket saved = ticketRepository.save(ticket);
        recordHistory(saved, prev, nextStatus, actor, reason != null ? reason : "Updated to " + nextStatus);
        recordAudit(actor, "TICKET_STATUS_CHANGED", saved.getTicketNumber(), prev + " -> " + nextStatus);
        notificationService.notifyUser(saved.getRequester(), saved,
                "Status Updated: " + saved.getTicketNumber(),
                "Your ticket status moved from " + prev + " to " + nextStatus + ".",
                "STATUS_CHANGED");
        return saved;
    }

    @Transactional
    public Ticket resolveTicket(Long ticketId, User actor, String resolutionSummary) {
        if (resolutionSummary == null || resolutionSummary.isBlank()) {
            throw new IllegalArgumentException("Resolution summary is required.");
        }
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found."));
        ticket.setResolutionSummary(resolutionSummary.trim());
        Ticket saved = transitionStatus(ticketId, TicketStatus.RESOLVED, actor, resolutionSummary.trim());

        TicketComment comment = new TicketComment();
        comment.setTicket(saved);
        comment.setAuthor(actor);
        comment.setInternalNote(false);
        comment.setBody("Resolution Summary: " + resolutionSummary.trim());
        commentRepository.save(comment);
        return saved;
    }

    private void recordHistory(Ticket t, TicketStatus from, TicketStatus to, User actor, String reason) {
        TicketStatusHistory h = new TicketStatusHistory();
        h.setTicket(t);
        h.setFromStatus(from);
        h.setToStatus(to);
        h.setChangedBy(actor);
        h.setReason(reason);
        historyRepository.save(h);
    }

    private void recordAudit(User actor, String action, String entityId, String details) {
        AuditLog log = new AuditLog();
        log.setActorId(actor.getId());
        log.setActorEmail(actor.getEmail());
        log.setAction(action);
        log.setEntityType("TICKET");
        log.setEntityId(entityId);
        log.setDetails(details);
        auditLogRepository.save(log);
    }
}
