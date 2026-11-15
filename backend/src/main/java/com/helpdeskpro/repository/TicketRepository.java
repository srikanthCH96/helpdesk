package com.helpdeskpro.repository;

import com.helpdeskpro.model.*;
import com.helpdeskpro.model.Enums.*;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface TicketRepository extends JpaRepository<Ticket, Long>, JpaSpecificationExecutor<Ticket> {
    Optional<Ticket> findByTicketNumber(String ticketNumber);
    Page<Ticket> findByRequesterId(Long requesterId, Pageable pageable);
    Page<Ticket> findByAssignedAgentIdOrAssignedAgentIsNull(Long agentId, Pageable pageable);
    List<Ticket> findByStatusNotInAndSlaBreachedFalseAndResolutionDueAtBefore(
        List<TicketStatus> excludedStatuses, Instant now);
    List<Ticket> findByStatusNotInAndSlaWarningSentFalseAndResolutionDueAtBetween(
        List<TicketStatus> excludedStatuses, Instant start, Instant end);
    long countByStatus(TicketStatus status);
    long countBySlaBreachedTrue();
}
