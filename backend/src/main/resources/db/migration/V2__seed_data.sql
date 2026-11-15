INSERT INTO roles (name, description) VALUES
  ('EMPLOYEE', 'Standard enterprise requester able to create and track own tickets'),
  ('SUPPORT_AGENT', 'IT support engineer able to triage, comment internally, and resolve assigned tickets'),
  ('ADMIN', 'IT Operations administrator with full user, SLA, category, and system governance');

INSERT INTO departments (name, code, manager_name, description) VALUES
  ('IT Infrastructure & Cloud', 'IT-INFRA', 'Elena Vance', 'Core networking, VPN, cloud platforms, and identity systems.'),
  ('Workplace Engineering', 'IT-DESK', 'Marcus Chen', 'End-user hardware, OS provisioning, and peripherals.'),
  ('Finance & Operations', 'FIN-OPS', 'Priya Nair', 'ERP workflows, payroll systems, and financial tooling.'),
  ('Product & Engineering', 'PROD-ENG', 'David Park', 'Software engineering teams and CI/CD access.');

INSERT INTO ticket_categories (name, description, default_priority, active) VALUES
  ('Hardware', 'Laptops, docking stations, monitors, and peripherals.', 'MEDIUM', TRUE),
  ('Software', 'Enterprise SaaS licensing, OS updates, and application crashes.', 'MEDIUM', TRUE),
  ('Network', 'Corporate Wi-Fi, VPN tunnels, and DNS routing.', 'HIGH', TRUE),
  ('Email', 'Exchange mailboxes, distribution lists, and delivery.', 'MEDIUM', TRUE),
  ('Access Issues', 'SSO Okta MFA resets, IAM permissions, and repository access.', 'HIGH', TRUE),
  ('Other', 'General IT requests and cross-functional service inquiries.', 'LOW', TRUE);

INSERT INTO sla_rules (name, priority, response_time_minutes, resolution_time_minutes, escalation_level1_minutes, escalation_level2_minutes, business_hours_only, notify_before_minutes, active) VALUES
  ('Critical Severity (P1)', 'CRITICAL', 15, 240, 120, 210, FALSE, 30, TRUE),
  ('High Severity (P2)', 'HIGH', 60, 480, 300, 420, TRUE, 60, TRUE),
  ('Medium Severity (P3)', 'MEDIUM', 240, 1440, 960, 1320, TRUE, 120, TRUE),
  ('Low Severity (P4)', 'LOW', 480, 2880, 2160, 2640, TRUE, 240, TRUE);

INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('company.name', 'HelpDesk Pro Enterprise'),
  ('company.support_email', 'it-service@helpdeskpro.io'),
  ('calendar.business_hours_start', '08:00'),
  ('calendar.business_hours_end', '18:00'),
  ('calendar.working_days', 'MON,TUE,WED,THU,FRI'),
  ('security.allow_reopen_days', '14'),
  ('upload.max_mb', '10');
