# HelpDesk Pro Enterprise Suite — Database Entity-Relationship Diagram

All 16 normalized MySQL 8 tables are provisioned via Flyway (`backend/src/main/resources/db/migration/V1__init_schema.sql`) using UTC timestamps (`TIMESTAMP(3)`).

```mermaid
erDiagram
    DEPARTMENTS ||--o{ USERS : employs
    DEPARTMENTS ||--o{ TICKETS : owns
    USERS }o--o{ ROLES : has
    TICKET_CATEGORIES ||--o{ TICKETS : classifies
    USERS ||--o{ TICKETS : submits
    USERS ||--o{ TICKETS : assigned_to
    SLA_RULES ||--o{ TICKETS : governs_priority
    TICKETS ||--o{ TICKET_COMMENTS : has
    TICKETS ||--o{ TICKET_ATTACHMENTS : stores
    TICKETS ||--o{ TICKET_ASSIGNMENTS : tracks
    TICKETS ||--o{ TICKET_STATUS_HISTORY : audits
    TICKETS ||--o{ TICKET_ESCALATIONS : triggers
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ PASSWORD_RESET_TOKENS : requests

    DEPARTMENTS {
        bigint id PK
        varchar name
        varchar code UK
        varchar manager_name
    }
    USERS {
        bigint id PK
        varchar full_name
        varchar email UK
        varchar password_hash
        bigint department_id FK
        boolean active
        varchar availability_status
        int max_concurrent_tickets
    }
    ROLES {
        bigint id PK
        varchar name UK
    }
    TICKETS {
        bigint id PK
        varchar ticket_number UK
        varchar subject
        text description
        varchar status
        varchar priority
        bigint category_id FK
        bigint department_id FK
        bigint requester_id FK
        bigint assigned_agent_id FK
        timestamp response_due_at
        timestamp resolution_due_at
        boolean sla_breached
        int escalation_level
    }
    SLA_RULES {
        bigint id PK
        varchar priority UK
        int response_time_minutes
        int resolution_time_minutes
        int escalation_level1_minutes
        int escalation_level2_minutes
    }
```
