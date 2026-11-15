package com.helpdeskpro.repository;

import com.helpdeskpro.model.SlaRule;
import com.helpdeskpro.model.Enums.TicketPriority;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SlaRuleRepository extends JpaRepository<SlaRule, Long> {
    Optional<SlaRule> findByPriorityAndActiveTrue(TicketPriority priority);
}
