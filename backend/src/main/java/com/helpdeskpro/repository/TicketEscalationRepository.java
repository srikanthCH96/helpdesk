package com.helpdeskpro.repository;

import com.helpdeskpro.model.*;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TicketEscalationRepository extends JpaRepository<TicketEscalation, Long> {
    List<TicketEscalation> findAllByOrderByEscalatedAtDesc();
}
