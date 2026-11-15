package com.helpdeskpro.repository;

import com.helpdeskpro.model.TicketStatusHistory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TicketStatusHistoryRepository extends JpaRepository<TicketStatusHistory, Long> {
    List<TicketStatusHistory> findByTicketIdOrderByChangedAtAsc(Long ticketId);
}
