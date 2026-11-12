# Database design

Schema source: [`prisma/schema.prisma`](../prisma/schema.prisma) · Seed: [`prisma/seed.ts`](../prisma/seed.ts)

## ER diagram

```mermaid
erDiagram
    ROLE {
        string id PK
        string code UK "administrator|training_officer|department_supervisor|employee"
        string name
        string permissions "JSON array of permission strings"
    }
    USER {
        string id PK
        string email UK
        string passwordHash "scrypt:salt:hash"
        string roleId FK
        string employeeId FK UK "optional link to employee record"
        string status "active|disabled"
        datetime lastLoginAt
    }
    DEPARTMENT {
        string id PK
        string code UK
        string name UK
    }
    PRODUCTION_AREA {
        string id PK
        string code UK
        string departmentId FK
    }
    JOB_ROLE {
        string id PK
        string code UK
        string title
        string grade "Worker|Staff|Officer|Manager"
        string departmentId FK
    }
    EMPLOYEE {
        string id PK
        string employeeCode UK "SE-1001…"
        string name
        string departmentId FK
        string productionAreaId FK "nullable"
        string jobRoleId FK
        string designation
        datetime joiningDate
        string status "active|probation|on_leave|notice_period|separated"
        string supervisorName "denormalised display field"
        string shift
        string category "Permanent|Contract|Trainee"
    }
    COMPETENCY {
        string id PK
        string code UK "C-001…"
        string name
        string category
        string departmentId FK "nullable = plant-wide"
        int baselineLevel
        string assessmentCriteria
        int assessmentFrequencyMonths
        int validityMonths
        bool safetyCritical
        bool mandatory
        bool active
    }
    ROLE_COMPETENCY {
        string id PK
        string jobRoleId FK
        string competencyId FK
        int requiredLevel "1..4"
    }
    ASSESSMENT {
        string id PK
        string employeeId FK
        string competencyId FK
        int level "1..4"
        string assessedBy
        datetime assessedAt
        string notes
    }
    TRAINING_PROGRAM {
        string id PK
        string code UK "TP-01…"
        string title
        string category
        string competencyId FK "nullable target competency"
        float durationHours
        string deliveryMode
    }
    TRAINING_SESSION {
        string id PK
        string code UK "TS-YYYY-nnn"
        string programId FK
        string title
        datetime scheduledDate
        string startTime
        float durationHours
        string location
        string trainer
        int capacity
        string status "scheduled|in_progress|completed|cancelled"
        string targetDepartmentId FK "nullable = plant-wide"
    }
    ENROLLMENT {
        string id PK
        string sessionId FK
        string employeeId FK
        string status "enrolled|completed|dropped"
    }
    ATTENDANCE_RECORD {
        string id PK
        string sessionId FK
        string employeeId FK
        string status "present|absent|excused"
        bool qualified "separate from attendance"
        string remarks
    }
    QUALIFICATION {
        string id PK
        string employeeId FK
        string competencyId FK
        datetime issuedAt
        datetime expiresAt
        string certificateRef
    }
    NOTIFICATION {
        string id PK
        string userId FK "nullable → role broadcast"
        string audienceRole
        string type
        string severity
        string title
        string message
        datetime readAt
    }
    AUDIT_LOG {
        string id PK
        string userId
        string userName
        string roleCode
        string action "login|create|update|delete|export|import…"
        string entity
        string entityId
        string details
        string ip
        datetime createdAt
    }
    SETTING {
        string id PK
        string key UK "tna_rules|alert_thresholds"
        string value "JSON"
        string updatedBy
    }

    ROLE ||--o{ USER : grants
    EMPLOYEE ||--o| USER : "linked account"
    DEPARTMENT ||--o{ PRODUCTION_AREA : has
    DEPARTMENT ||--o{ JOB_ROLE : defines
    JOB_ROLE ||--o{ ROLE_COMPETENCY : requires
    COMPETENCY ||--o{ ROLE_COMPETENCY : "required at level"
    EMPLOYEE ||--o{ ASSESSMENT : "assessment history"
    COMPETENCY ||--o{ ASSESSMENT : measures
    EMPLOYEE ||--o{ QUALIFICATION : holds
    COMPETENCY ||--o{ QUALIFICATION : certifies
    COMPETENCY ||--o{ TRAINING_PROGRAM : "targeted by"
    TRAINING_PROGRAM ||--o{ TRAINING_SESSION : schedules
    TRAINING_SESSION ||--o{ ENROLLMENT : enrols
    EMPLOYEE ||--o{ ENROLLMENT : attends
    TRAINING_SESSION ||--o{ ATTENDANCE_RECORD : records
    EMPLOYEE ||--o{ ATTENDANCE_RECORD : participates
    USER ||--o{ NOTIFICATION : receives
```

## Design decisions

| Decision | Rationale |
|---|---|
| **Assessment history kept, "current" = latest** | Full auditability of competency evolution; no destructive updates |
| `UNIQUE(employeeId, competencyId)` on Qualification | One live qualification per pair — renewals upsert |
| `UNIQUE(sessionId, employeeId)` on Enrollment/Attendance | Database-level duplicate protection for enrolment and attendance |
| Arrays stored as JSON strings (Role.permissions, Setting.value) | SQLite has no array type; keeps schema portable to PostgreSQL |
| Supervisor denormalised as `supervisorName` | Display-only field per spec; avoids deep self-joins on directory views |
| `separated` status instead of hard deletes | Referential integrity for assessment/qualification history |
| Indexes on all FK columns + `expiresAt`, `assessedAt`, `createdAt` | Feed the expiry buckets, TNA recency checks and audit pagination |

## Migrations & seeding

```bash
bun run db:push     # sync schema (sandbox / first run)
bun run db:migrate  # create a migration (PostgreSQL workflow)
bun run db:seed     # deterministic synthetic dataset (wipes & re-creates)
```

The seed uses a fixed PRNG seed (20240614) — every run produces byte-identical data, making screenshots and demos reproducible.
