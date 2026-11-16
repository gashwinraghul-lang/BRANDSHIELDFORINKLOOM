-- 006_full_schema.sql
-- BrandShield.ai complete schema: brand knowledge base, review workflow,
-- claims evidence, image checks, closed-loop guideline improvement,
-- AI/agent observability and evaluation.

-- ---------------------------------------------------------------------------
-- Users and organisations
-- ---------------------------------------------------------------------------
ALTER TABLE organizations ADD COLUMN slug VARCHAR(120) NULL;
ALTER TABLE organizations ADD COLUMN brand_tone VARCHAR(255) NULL;
ALTER TABLE organizations ADD COLUMN branding_json JSON NULL;
ALTER TABLE organizations ADD COLUMN created_by BIGINT NULL;
CREATE UNIQUE INDEX uq_org_slug ON organizations (slug);

ALTER TABLE users ADD COLUMN name VARCHAR(160) NULL;
ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL;
ALTER TABLE users ADD COLUMN status ENUM('active','invited','suspended') NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL;
ALTER TABLE users ADD COLUMN created_by BIGINT NULL;
CREATE INDEX idx_users_org ON users (organization_id);

-- ---------------------------------------------------------------------------
-- Brand knowledge base
-- ---------------------------------------------------------------------------
ALTER TABLE guidelines ADD COLUMN description TEXT NULL;
ALTER TABLE guidelines ADD COLUMN category VARCHAR(80) NOT NULL DEFAULT 'general';
ALTER TABLE guidelines ADD COLUMN status ENUM('active','archived') NOT NULL DEFAULT 'active';
ALTER TABLE guidelines ADD COLUMN created_by BIGINT NULL;
ALTER TABLE guidelines ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS guideline_versions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  guideline_id BIGINT NOT NULL,
  version INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  change_note VARCHAR(500) NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_guideline_version (guideline_id, version),
  INDEX idx_gv_guideline (guideline_id),
  CONSTRAINT fk_gv_guideline FOREIGN KEY (guideline_id) REFERENCES guidelines(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS terminology_terms (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  term VARCHAR(180) NOT NULL,
  preferred_term VARCHAR(180) NULL,
  definition TEXT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'general',
  severity ENUM('info','suggestion','warning','error') NOT NULL DEFAULT 'warning',
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_terms_org (organization_id),
  CONSTRAINT fk_terms_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS approved_facts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  statement TEXT NOT NULL,
  source VARCHAR(500) NULL,
  owner VARCHAR(200) NULL,
  expires_at DATE NULL,
  confidentiality ENUM('public','internal','restricted') NOT NULL DEFAULT 'internal',
  tags VARCHAR(500) NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_facts_org (organization_id),
  INDEX idx_facts_expiry (expires_at),
  CONSTRAINT fk_facts_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS brand_assets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  name VARCHAR(200) NOT NULL,
  type ENUM('logo','palette','font','image') NOT NULL,
  file_path VARCHAR(500) NULL,
  mime_type VARCHAR(120) NULL,
  hex_values VARCHAR(500) NULL,
  font_family VARCHAR(200) NULL,
  confidentiality ENUM('public','internal','restricted') NOT NULL DEFAULT 'internal',
  metadata JSON NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assets_org (organization_id),
  CONSTRAINT fk_assets_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Submissions, revisions, findings
-- ---------------------------------------------------------------------------
ALTER TABLE submissions ADD COLUMN content MEDIUMTEXT NULL;
ALTER TABLE submissions ADD COLUMN content_type ENUM('text','document','image') NOT NULL DEFAULT 'text';
ALTER TABLE submissions ADD COLUMN source_file VARCHAR(500) NULL;
ALTER TABLE submissions ADD COLUMN confidentiality ENUM('public','internal','restricted') NOT NULL DEFAULT 'internal';
ALTER TABLE submissions ADD COLUMN assigned_to BIGINT NULL;
ALTER TABLE submissions ADD COLUMN current_revision INT NOT NULL DEFAULT 1;
ALTER TABLE submissions ADD COLUMN engine VARCHAR(120) NULL;
ALTER TABLE submissions ADD COLUMN processing_status ENUM('queued','processing','complete','failed') NOT NULL DEFAULT 'queued';
ALTER TABLE submissions ADD COLUMN processing_error TEXT NULL;
ALTER TABLE submissions ADD COLUMN submitted_at DATETIME NULL;
ALTER TABLE submissions ADD COLUMN decided_at DATETIME NULL;
ALTER TABLE submissions ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
CREATE INDEX idx_submissions_org_status ON submissions (organization_id, status);
CREATE INDEX idx_submissions_assigned ON submissions (assigned_to);

CREATE TABLE IF NOT EXISTS submission_revisions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT NOT NULL,
  version INT NOT NULL,
  content MEDIUMTEXT NULL,
  content_type ENUM('text','document','image') NOT NULL DEFAULT 'text',
  file_path VARCHAR(500) NULL,
  note VARCHAR(500) NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_revision (submission_id, version),
  CONSTRAINT fk_revision_submission FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

ALTER TABLE findings ADD COLUMN title VARCHAR(255) NULL;
ALTER TABLE findings ADD COLUMN finding_type VARCHAR(80) NULL;
ALTER TABLE findings ADD COLUMN evidence JSON NULL;
ALTER TABLE findings ADD COLUMN region JSON NULL;
ALTER TABLE findings ADD COLUMN guideline_id BIGINT NULL;
ALTER TABLE findings ADD COLUMN guideline_version_id BIGINT NULL;
ALTER TABLE findings ADD COLUMN fact_id BIGINT NULL;
ALTER TABLE findings ADD COLUMN asset_id BIGINT NULL;
ALTER TABLE findings ADD COLUMN reviewer_reason TEXT NULL;
ALTER TABLE findings ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
CREATE INDEX idx_findings_submission ON findings (submission_id);
CREATE INDEX idx_findings_category ON findings (category, severity);

CREATE TABLE IF NOT EXISTS finding_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  finding_id BIGINT NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  actor_id BIGINT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NULL,
  reason TEXT NULL,
  details JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fe_finding (finding_id),
  CONSTRAINT fk_fe_finding FOREIGN KEY (finding_id) REFERENCES findings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT NOT NULL,
  parent_id BIGINT NULL,
  user_id BIGINT NOT NULL,
  body TEXT NOT NULL,
  mentions JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_comments_submission (submission_id),
  CONSTRAINT fk_comments_submission FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS approvals (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT NOT NULL,
  reviewer_id BIGINT NOT NULL,
  decision ENUM('approved','changes_requested','rejected') NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_approvals_submission (submission_id),
  CONSTRAINT fk_approvals_submission FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_approvals_user FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Claims evidence
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claim_verdicts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT NOT NULL,
  finding_id BIGINT NULL,
  claim_text TEXT NOT NULL,
  verdict ENUM('supported','contradicted','outdated','unsupported') NOT NULL,
  matched_fact_id BIGINT NULL,
  similarity FLOAT NULL,
  engine VARCHAR(120) NULL,
  source VARCHAR(500) NULL,
  owner VARCHAR(200) NULL,
  expires_at DATE NULL,
  detail TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_claims_submission (submission_id),
  CONSTRAINT fk_claims_submission FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Closed-loop guideline improvement
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guideline_metrics_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  guideline_id BIGINT NOT NULL,
  version INT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  triggers INT NOT NULL DEFAULT 0,
  overrides INT NOT NULL DEFAULT 0,
  rejections INT NOT NULL DEFAULT 0,
  sample_size INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gms_guideline (guideline_id, version),
  CONSTRAINT fk_gms_guideline FOREIGN KEY (guideline_id) REFERENCES guidelines(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guideline_drafts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  guideline_id BIGINT NOT NULL,
  base_version INT NOT NULL,
  content MEDIUMTEXT NOT NULL,
  examples JSON NULL,
  rationale JSON NULL,
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_by BIGINT NULL,
  reviewed_by BIGINT NULL,
  review_note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gd_guideline (guideline_id),
  CONSTRAINT fk_gd_guideline FOREIGN KEY (guideline_id) REFERENCES guidelines(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Observability and evaluation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_call_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT NULL,
  category VARCHAR(80) NOT NULL,
  service VARCHAR(80) NOT NULL,
  model VARCHAR(120) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ok',
  detail VARCHAR(255) NULL,
  duration_ms INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_org (organization_id, created_at)
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(40) NOT NULL,
  engine VARCHAR(80) NOT NULL,
  accuracy FLOAT NULL,
  details JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_eval_kind (kind, created_at)
);

CREATE TABLE IF NOT EXISTS agent_calls (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'agentverse',
  ok TINYINT(1) NOT NULL DEFAULT 0,
  duration_ms INT NULL,
  detail VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_agent_calls (organization_id, created_at)
);
