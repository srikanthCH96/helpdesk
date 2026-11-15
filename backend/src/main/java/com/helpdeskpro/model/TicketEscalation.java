package com.helpdeskpro.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "ticket_escalations")
public class TicketEscalation {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ticket_id", nullable = false)
    private Ticket ticket;

    @Column(nullable = false)
    private int level;

    @Column(nullable = false, length = 500)
    private String reason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "escalated_to_user_id")
    private User escalatedToUser;

    @Column(name = "escalated_at", nullable = false, updatable = false)
    private Instant escalatedAt = Instant.now();

    public Long getId() { return id; }
    public Ticket getTicket() { return ticket; }
    public void setTicket(Ticket ticket) { this.ticket = ticket; }
    public int getLevel() { return level; }
    public void setLevel(int level) { this.level = level; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public User getEscalatedToUser() { return escalatedToUser; }
    public void setEscalatedToUser(User escalatedToUser) { this.escalatedToUser = escalatedToUser; }
    public Instant getEscalatedAt() { return escalatedAt; }
}
