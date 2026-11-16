// server/src/routes/review.js
import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { chatJson, isLlmAvailable } from '../services/llmClient.js';

const router = express.Router();

router.post('/review', authenticate, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (typeof text !== 'string') {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const orgId = req.organizationId;

    // Load all brand_rules for the organization
    const rules = await query(
      `SELECT type, value FROM brand_rules WHERE organization_id = ?`,
      [orgId]
    );
    const banned = rules.filter(r => r.type === 'banned').map(r => r.value);
    const approved = rules.filter(r => r.type === 'approved_fact').map(r => r.value);

    const findings = [];
    let nextId = 1;

    // ---- BANNED WORD CHECK ----
    banned.forEach(word => {
      const pattern = new RegExp(`\\b${word.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&')}\\b`, 'gi');
      let match;
      while ((match = pattern.exec(text)) !== null) {
        findings.push({
          id: nextId++,
          category: 'terminology',
          severity: 'medium',
          start: match.index,
          matchedText: match[0],
          explanation: 'This word is banned by brand policy',
          suggestion: 'Rewrite without this term, or use an approved alternative',
          source: null,
          status: 'open',
        });
      }
    });

    // ---- CLAIM CHECK ----
    const sentences = text.split(/(?<=[.!?])\s+/);
    const claimTrigger = /%|#1|fastest|best/i;
    const systemPrompt = `You are a brand‑policy verifier. You will be given a list of approved facts and a single claim sentence. Respond with a JSON object matching schema { verdict: "supported"|"unsupported"|"contradicted", reason: string }. Only output the JSON. Approved facts:\n${approved.join('\n')}`;

    for (const sentence of sentences) {
      if (!claimTrigger.test(sentence)) continue;
      const hasApproved = approved.some(f => new RegExp(f, 'i').test(sentence));
      if (hasApproved) continue; // already covered by an approved fact

      let aiData = null;
      if (isLlmAvailable()) {
        try {
          const result = await chatJson({
            organizationId: orgId,
            category: 'review',
            system: systemPrompt,
            user: sentence,
            schema: null,
          });
          if (result && result.data && result.data.verdict) {
            aiData = result.data;
          }
        } catch (e) {
          // ignore AI errors – fallback later
        }
      }

      if (aiData) {
        findings.push({
          id: nextId++,
          category: 'claim',
          severity: 'high',
          start: text.indexOf(sentence),
          matchedText: sentence.trim(),
          explanation: aiData.reason || 'AI assessment',
          suggestion: 'Add a source or remove the claim',
          source: null,
          status: 'open',
          aiVerdict: aiData.verdict,
        });
      } else {
        // fallback rule‑only finding
        findings.push({
          id: nextId++,
          category: 'claim',
          severity: 'high',
          start: text.indexOf(sentence),
          matchedText: sentence.trim(),
          explanation: 'This claim needs an approved source',
          suggestion: 'Add a source or remove the claim',
          source: null,
          status: 'open',
        });
      }
    }

    return res.json({ findings });
  } catch (err) {
    next(err);
  }
});

export default router;
