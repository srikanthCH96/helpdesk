package com.helpdeskpro.model;

import jakarta.persistence.*;
import java.time.Instant;
import com.helpdeskpro.model.Enums.TicketPriority;

@Entity
@Table(name = "sla_rules")
public class SlaRule {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, unique = true, length = 20)
    private TicketPriority priority;

    @Column(name = "response_time_minutes", nullable = false)
    private int responseTimeMinutes;

    @Column(name = "resolution_time_minutes", nullable = false)
    private int resolutionTimeMinutes;

    @Column(name = "escalation_level1_minutes", nullable = false)
    private int escalationLevel1Minutes;

    @Column(name = "escalation_level2_minutes", nullable = false)
    private int escalationLevel2Minutes;

    @Column(name = "business_hours_only", nullable = false)
    private boolean businessHoursOnly = true;

    @Column(name = "notify_before_minutes", nullable = false)
    private int notifyBeforeMinutes = 30;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public TicketPriority getPriority() { return priority; }
    public void setPriority(TicketPriority priority) { this.priority = priority; }
    public int getResponseTimeMinutes() { return responseTimeMinutes; }
    public void setResponseTimeMinutes(int responseTimeMinutes) { this.responseTimeMinutes = responseTimeMinutes; }
    public int getResolutionTimeMinutes() { return resolutionTimeMinutes; }
    public void setResolutionTimeMinutes(int resolutionTimeMinutes) { this.resolutionTimeMinutes = resolutionTimeMinutes; }
    public int getEscalationLevel1Minutes() { return escalationLevel1Minutes; }
    public void setEscalationLevel1Minutes(int escalationLevel1Minutes) { this.escalationLevel1Minutes = escalationLevel1Minutes; }
    public int getEscalationLevel2Minutes() { return escalationLevel2Minutes; }
    public void setEscalationLevel2Minutes(int escalationLevel2Minutes) { this.escalationLevel2Minutes = escalationLevel2Minutes; }
    public boolean isBusinessHoursOnly() { return businessHoursOnly; }
    public void setBusinessHoursOnly(boolean businessHoursOnly) { this.businessHoursOnly = businessHoursOnly; }
    public int getNotifyBeforeMinutes() { return notifyBeforeMinutes; }
    public void setNotifyBeforeMinutes(int notifyBeforeMinutes) { this.notifyBeforeMinutes = notifyBeforeMinutes; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
