// server/src/lib/observability.js
import { execute } from '../db.js';

export async function logAudit({
  organizationId = null,
  userId = null,
  action,
  entityType = null,
  entityId = null,
  details = null,
  ip = null,
}) {
  try {
    await execute(
      `INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?,?,?,?,?,?,?)`,
      [
        organizationId,
        userId,
        action,
        entityType,
        entityId,
        details === null ? null : JSON.stringify(details),
        ip,
      ]
    );
  } catch (err) {
    // Auditing must never take the request down, but it should be visible.
    console.error('audit_log write failed:', err.message);
  }
}

export async function logAiCall({
  organizationId = null,
  category,
  service,
  model = null,
  status = 'ok',
  detail = null,
  durationMs = null,
}) {
  try {
    await execute(
      `INSERT INTO ai_call_log (organization_id, category, service, model, status, detail, duration_ms)
       VALUES (?,?,?,?,?,?,?)`,
      [organizationId, category, service, model, status, detail, durationMs]
    );
  } catch (err) {
    console.error('ai_call_log write failed:', err.message);
  }
}

export async function logAgentCall({
  organizationId = null,
  source = 'agentverse',
  ok = true,
  durationMs = null,
  detail = null,
}) {
  try {
    await execute(
      `INSERT INTO agent_calls (organization_id, source, ok, duration_ms, detail)
       VALUES (?,?,?,?,?)`,
      [organizationId, source, ok ? 1 : 0, durationMs, detail]
    );
  } catch (err) {
    console.error('agent_calls write failed:', err.message);
  }
}
