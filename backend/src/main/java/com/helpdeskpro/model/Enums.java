package com.helpdeskpro.model;

public final class Enums {
    private Enums() {}

    public enum RoleName {
        EMPLOYEE,
        SUPPORT_AGENT,
        ADMIN
    }

    public enum TicketStatus {
        OPEN,
        ASSIGNED,
        IN_PROGRESS,
        RESOLVED,
        CLOSED,
        CANCELLED
    }

    public enum TicketPriority {
        LOW,
        MEDIUM,
        HIGH,
        CRITICAL
    }

    public enum AvailabilityStatus {
        AVAILABLE,
        BUSY,
        OFFLINE
    }
}
