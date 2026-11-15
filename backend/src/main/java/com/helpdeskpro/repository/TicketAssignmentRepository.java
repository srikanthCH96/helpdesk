package com.helpdeskpro.repository;

import com.helpdeskpro.model.TicketAssignment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TicketAssignmentRepository extends JpaRepository<TicketAssignment, Long> {
    List<TicketAssignment> findByTicketIdOrderByAssignedAtDesc(Long ticketId);
}
