package com.helpdeskpro.controller;

import com.helpdeskpro.dto.ApiResponse;
import com.helpdeskpro.model.*;
import com.helpdeskpro.model.Enums.TicketStatus;
import com.helpdeskpro.repository.*;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class AdminGovernanceController {
    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final TicketCategoryRepository categoryRepository;
    private final SlaRuleRepository slaRuleRepository;
    private final TicketRepository ticketRepository;
    private final TicketEscalationRepository escalationRepository;
    private final NotificationRepository notificationRepository;
    private final AuditLogRepository auditLogRepository;

    public AdminGovernanceController(
            UserRepository userRepository,
            DepartmentRepository departmentRepository,
            TicketCategoryRepository categoryRepository,
            SlaRuleRepository slaRuleRepository,
            TicketRepository ticketRepository,
            TicketEscalationRepository escalationRepository,
            NotificationRepository notificationRepository,
            AuditLogRepository auditLogRepository) {
        this.userRepository = userRepository;
        this.departmentRepository = departmentRepository;
        this.categoryRepository = categoryRepository;
        this.slaRuleRepository = slaRuleRepository;
        this.ticketRepository = ticketRepository;
        this.escalationRepository = escalationRepository;
        this.notificationRepository = notificationRepository;
        this.auditLogRepository = auditLogRepository;
    }

    @GetMapping("/health")
    public ResponseEntity<ApiResponse<Map<String, String>>> health() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("status", "UP", "runtime", "Java 21 Spring Boot 3")));
    }

    @GetMapping("/departments")
    public ResponseEntity<ApiResponse<List<Department>>> listDepartments() {
        return ResponseEntity.ok(ApiResponse.ok(departmentRepository.findAll()));
    }

    @GetMapping("/users")
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT_AGENT')")
    public ResponseEntity<ApiResponse<List<User>>> listUsers() {
        return ResponseEntity.ok(ApiResponse.ok(userRepository.findAll()));
    }

    @PatchMapping("/users/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<User>> toggleUserStatus(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        User u = userRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("User not found."));
        u.setActive(Boolean.TRUE.equals(body.get("active")));
        return ResponseEntity.ok(ApiResponse.ok(userRepository.save(u)));
    }

    @GetMapping("/categories")
    public ResponseEntity<ApiResponse<List<TicketCategory>>> listCategories() {
        return ResponseEntity.ok(ApiResponse.ok(categoryRepository.findAll()));
    }

    @PostMapping("/categories")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<TicketCategory>> createCategory(@RequestBody TicketCategory cat) {
        return ResponseEntity.ok(ApiResponse.ok(categoryRepository.save(cat)));
    }

    @GetMapping("/sla/rules")
    public ResponseEntity<ApiResponse<List<SlaRule>>> listSlaRules() {
        return ResponseEntity.ok(ApiResponse.ok(slaRuleRepository.findAll()));
    }

    @PutMapping("/sla/rules/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<SlaRule>> updateSlaRule(@PathVariable Long id, @RequestBody SlaRule req) {
        SlaRule rule = slaRuleRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("SLA rule not found."));
        rule.setResponseTimeMinutes(req.getResponseTimeMinutes());
        rule.setResolutionTimeMinutes(req.getResolutionTimeMinutes());
        rule.setEscalationLevel1Minutes(req.getEscalationLevel1Minutes());
        rule.setEscalationLevel2Minutes(req.getEscalationLevel2Minutes());
        rule.setBusinessHoursOnly(req.isBusinessHoursOnly());
        rule.setNotifyBeforeMinutes(req.getNotifyBeforeMinutes());
        return ResponseEntity.ok(ApiResponse.ok(slaRuleRepository.save(rule)));
    }

    @GetMapping("/sla/escalations")
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT_AGENT')")
    public ResponseEntity<ApiResponse<List<TicketEscalation>>> listEscalations() {
        return ResponseEntity.ok(ApiResponse.ok(escalationRepository.findAllByOrderByEscalatedAtDesc()));
    }

    @GetMapping("/reports/dashboard")
    public ResponseEntity<ApiResponse<Map<String, Object>>> dashboardReport() {
        long total = ticketRepository.count();
        long breached = ticketRepository.countBySlaBreachedTrue();
        double compliance = total == 0 ? 100.0 : Math.round(((total - breached) * 1000.0) / total) / 10.0;
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "totalTickets", total,
                "openTickets", ticketRepository.countByStatus(TicketStatus.OPEN),
                "inProgressTickets", ticketRepository.countByStatus(TicketStatus.IN_PROGRESS),
                "resolvedTickets", ticketRepository.countByStatus(TicketStatus.RESOLVED),
                "slaCompliancePct", compliance
        )));
    }

    @GetMapping("/notifications")
    public ResponseEntity<ApiResponse<Map<String, Object>>> listNotifications(@AuthenticationPrincipal User user) {
        var items = notificationRepository.findTop40ByUserIdOrderByCreatedAtDesc(user.getId());
        var unread = notificationRepository.countByUserIdAndReadFalse(user.getId());
        return ResponseEntity.ok(ApiResponse.ok(Map.of("items", items, "unreadCount", unread)));
    }

    @PatchMapping("/notifications/{id}/read")
    public ResponseEntity<ApiResponse<Notification>> markNotificationRead(@PathVariable Long id) {
        Notification n = notificationRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Not found."));
        n.setRead(true);
        return ResponseEntity.ok(ApiResponse.ok(notificationRepository.save(n)));
    }

    @GetMapping("/settings/audit-logs")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<AuditLog>>> listAuditLogs() {
        return ResponseEntity.ok(ApiResponse.ok(auditLogRepository.findTop100ByOrderByCreatedAtDesc()));
    }
}
