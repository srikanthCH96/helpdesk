package com.helpdeskpro.model;

import jakarta.persistence.*;
import java.time.Instant;
import com.helpdeskpro.model.Enums.TicketStatus;

@Entity
@Table(name = "ticket_status_history")
public class TicketStatusHistory {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ticket_id", nullable = false)
    private Ticket ticket;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 24)
    private TicketStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, length = 24)
    private TicketStatus toStatus;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "changed_by_id", nullable = false)
    private User changedBy;

    @Column(length = 500)
    private String reason;

    @Column(name = "changed_at", nullable = false, updatable = false)
    private Instant changedAt = Instant.now();

    public Long getId() { return id; }
    public Ticket getTicket() { return ticket; }
    public void setTicket(Ticket ticket) { this.ticket = ticket; }
    public TicketStatus getFromStatus() { return fromStatus; }
    public void setFromStatus(TicketStatus fromStatus) { this.fromStatus = fromStatus; }
    public TicketStatus getToStatus() { return toStatus; }
    public void setToStatus(TicketStatus toStatus) { this.toStatus = toStatus; }
    public User getChangedBy() { return changedBy; }
    public void setChangedBy(User changedBy) { this.changedBy = changedBy; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Instant getChangedAt() { return changedAt; }
}
