-- 004_audit_log.sql
-- Append-only audit trail. Details stored as JSON text for portability.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT NULL,
  user_id BIGINT NULL,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(80) NULL,
  entity_id BIGINT NULL,
  details TEXT,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_org (organization_id, created_at),
  INDEX idx_audit_user (user_id, created_at)
);
