-- 007_brand_rules.sql
CREATE TABLE IF NOT EXISTS brand_rules (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  type ENUM('banned','approved_fact') NOT NULL,
  value TEXT NOT NULL,
  source VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_br_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Seed banned words for demo org (assume organization named 'Demo Org')
INSERT INTO brand_rules (organization_id, type, value, source)
SELECT o.id, 'banned', w.value, NULL FROM organizations o, (SELECT 'cheap' AS value UNION SELECT 'best ever' UNION SELECT 'guaranteed' UNION SELECT 'miracle' UNION SELECT '#1' AS value) w WHERE o.name = 'Demo Org';

-- Seed approved facts for demo org
INSERT INTO brand_rules (organization_id, type, value, source)
SELECT o.id, 'approved_fact', f.value, f.source FROM organizations o, (SELECT 'Our product has 100% satisfaction rate' AS value, 'internal study' AS source UNION SELECT 'We are the #1 market leader' AS value, 'market report' AS source UNION SELECT 'Fastest processing time of 0.5s' AS value, 'benchmark' AS source) f WHERE o.name = 'Demo Org';
