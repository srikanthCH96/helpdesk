# HelpDesk Pro Enterprise Suite

Production-grade Enterprise IT Service Management (ITSM) suite featuring 10 unified role-based screens, complete ticket lifecycle governance, automated SLA breach & escalation processing, file attachments, CSV/PDF executive reporting, and full Java 21 Spring Boot 3.x + MySQL 8 backend source code.

## Architecture
- **AI Studio Preview Runtime (`server.ts` + `src/`)**: Express + Vite full-stack runtime on port `3000` with persistent relational storage (`data/helpdesk-db.json`), BCrypt password hashing, JWT authentication, RBAC enforcement, Multer attachment validation, automated SLA breach scheduler, and CSV/PDF exports.
- **Java 21 Spring Boot Backend (`/backend`)**: Complete Maven project with Spring Security 6, Spring Data JPA, Flyway migrations (`V1__init_schema.sql`, `V2__seed_data.sql` for 16 normalized MySQL 8 tables), AWS S3 storage adapter with local fallback, SMTP HTML email notifications, OpenAPI/Swagger, and JUnit 5 + Mockito tests.

## Demo Credentials (Preview)
Password for all seeded demo accounts: `Enterprise@2026`
- **Employee**: `employee@helpdeskpro.io`
- **Support Agent**: `agent@helpdeskpro.io`
- **Administrator**: `admin@helpdeskpro.io`

## Local Execution

### Option 1: Full-Stack Preview (Node.js + React on Port 3000)
```bash
npm install
npm run dev
```

### Option 2: Docker Compose (MySQL 8 + Java 21 Spring Boot + Nginx React)
```bash
docker compose up --build
```
- Frontend: `http://localhost`
- Java Spring Boot API: `http://localhost:8080`
- Swagger UI: `http://localhost:8080/swagger-ui.html`

### Option 3: Run Java Backend Tests Locally (Requires JDK 21 & Maven 3.9+)
```bash
cd backend
mvn test
```
