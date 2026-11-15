# AWS Deployment & Production Operations Guide

## Architecture Overview
- **Frontend**: React 19 + Vite bundle served via CloudFront + S3 or Nginx on ECS Fargate.
- **Backend**: Java 21 Spring Boot 3.3 REST API running on AWS ECS Fargate behind an Application Load Balancer (HTTPS TLS 1.3).
- **Database**: Amazon RDS for MySQL 8.4 (Multi-AZ, automated snapshots, UTC timezone).
- **Object Storage**: Amazon S3 bucket (`helpdesk-pro-attachments`) with server-side AES-256 encryption and IAM task role access (never embed AWS keys in frontend code).
- **Email**: Amazon SES SMTP endpoint (`email-smtp.<region>.amazonaws.com:587`) configured via ECS Task Definition secrets in AWS Secrets Manager.

## Required Production Environment Variables
Configure the following in AWS Secrets Manager / Parameter Store before deploying:
- `MYSQL_HOST`, `MYSQL_PORT=3306`, `MYSQL_DATABASE=helpdesk_pro`, `MYSQL_USER`, `MYSQL_PASSWORD`
- `JWT_SECRET` (minimum 256-bit random key)
- `AWS_REGION`, `AWS_S3_BUCKET`
- `SMTP_ENABLED=true`, `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`
- `CORS_ALLOWED_ORIGINS=https://helpdesk.yourdomain.com`

## Health Checks & Monitoring
- Liveness / Readiness Probe: `GET /actuator/health` (Spring Boot) or `GET /api/health`
- Swagger / OpenAPI UI: `https://<api-host>/swagger-ui.html`
- Structured logs exported to Amazon CloudWatch via ECS `awslogs` driver.
