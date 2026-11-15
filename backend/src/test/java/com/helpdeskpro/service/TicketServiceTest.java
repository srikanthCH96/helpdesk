package com.helpdeskpro.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.helpdeskpro.model.*;
import com.helpdeskpro.model.Enums.*;
import com.helpdeskpro.repository.*;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

@ExtendWith(MockitoExtension.class)
class TicketServiceTest {

    @Mock private TicketRepository ticketRepository;
    @Mock private TicketCategoryRepository categoryRepository;
    @Mock private DepartmentRepository departmentRepository;
    @Mock private UserRepository userRepository;
    @Mock private TicketAssignmentRepository assignmentRepository;
    @Mock private TicketStatusHistoryRepository historyRepository;
    @Mock private TicketCommentRepository commentRepository;
    @Mock private AuditLogRepository auditLogRepository;
    @Mock private SlaSchedulerService slaService;
    @Mock private EmailNotificationService notificationService;

    @InjectMocks private TicketService ticketService;

    private User employee;
    private User otherEmployee;
    private User agent;
    private TicketCategory category;
    private Department department;

    @BeforeEach
    void setup() {
        department = new Department();
        department.setName("IT Infrastructure");

        Role empRole = new Role();
        empRole.setName(RoleName.EMPLOYEE);

        Role agentRole = new Role();
        agentRole.setName(RoleName.SUPPORT_AGENT);

        employee = new User();
        setId(employee, 1L);
        employee.setFullName("Maya Lin");
        employee.setEmail("maya@helpdeskpro.io");
        employee.setDepartment(department);
        employee.setRoles(Set.of(empRole));

        otherEmployee = new User();
        setId(otherEmployee, 2L);
        otherEmployee.setFullName("Daniel Mercer");
        otherEmployee.setEmail("daniel@helpdeskpro.io");
        otherEmployee.setDepartment(department);
        otherEmployee.setRoles(Set.of(empRole));

        agent = new User();
        setId(agent, 3L);
        agent.setFullName("Marcus Chen");
        agent.setEmail("marcus@helpdeskpro.io");
        agent.setActive(true);
        agent.setDepartment(department);
        agent.setRoles(Set.of(agentRole));

        category = new TicketCategory();
        category.setName("Access Issues");
    }

    @Test
    void createTicket_setsOpenStatusAndSlaDeadlines() {
        when(categoryRepository.findById(1L)).thenReturn(Optional.of(category));
        when(slaService.computeDeadlines(eq(TicketPriority.CRITICAL), any()))
                .thenReturn(new SlaSchedulerService.SlaDeadlines(
                        Instant.now().plusSeconds(900), Instant.now().plusSeconds(14400)));
        when(ticketRepository.save(any(Ticket.class))).thenAnswer(inv -> inv.getArgument(0));

        Ticket created = ticketService.createTicket(
                employee, "Okta MFA Error", "Hardware token fails", 1L, TicketPriority.CRITICAL, null);

        assertEquals(TicketStatus.OPEN, created.getStatus());
        assertEquals(TicketPriority.CRITICAL, created.getPriority());
        assertNotNull(created.getResponseDueAt());
        assertNotNull(created.getResolutionDueAt());
        verify(historyRepository).save(any(TicketStatusHistory.class));
        verify(notificationService).notifyUser(eq(employee), any(), anyString(), anyString(), eq("TICKET_CREATED"));
    }

    @Test
    void assignTicket_preventsDuplicateAssignment() {
        Ticket ticket = new Ticket();
        ticket.setTicketNumber("HD-1001");
        ticket.setStatus(TicketStatus.ASSIGNED);
        ticket.setAssignedAgent(agent);

        when(ticketRepository.findById(10L)).thenReturn(Optional.of(ticket));
        when(userRepository.findById(3L)).thenReturn(Optional.of(agent));

        assertThrows(IllegalStateException.class,
                () -> ticketService.assignTicket(10L, 3L, agent, "Duplicate check"));
    }

    @Test
    void transitionStatus_blocksUnauthorizedEmployeeAccess() {
        Ticket ticket = new Ticket();
        ticket.setStatus(TicketStatus.OPEN);
        ticket.setRequester(employee);

        when(ticketRepository.findById(10L)).thenReturn(Optional.of(ticket));

        assertThrows(AccessDeniedException.class,
                () -> ticketService.transitionStatus(10L, TicketStatus.CANCELLED, otherEmployee, "Unauthorized"));
    }

    @Test
    void transitionStatus_rejectsInvalidLifecycleJump() {
        Ticket ticket = new Ticket();
        ticket.setStatus(TicketStatus.OPEN);
        ticket.setRequester(employee);

        when(ticketRepository.findById(10L)).thenReturn(Optional.of(ticket));

        assertThrows(IllegalArgumentException.class,
                () -> ticketService.transitionStatus(10L, TicketStatus.CLOSED, agent, "Invalid skip"));
    }

    private static void setId(User u, Long id) {
        try {
            var field = User.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(u, id);
        } catch (Exception ignored) {}
    }
}
