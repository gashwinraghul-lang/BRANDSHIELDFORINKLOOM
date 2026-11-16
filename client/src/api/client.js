// client/src/api/client.js
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

async function raw(path, { method = 'GET', body, form, headers = {} } = {}) {
  const finalHeaders = { ...headers, 'x-csrf-token': getCookie('bs_csrf') };
  if (body && !form) Object.assign(finalHeaders, JSON_HEADERS);
  return fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: finalHeaders,
    body: form ? body : body ? JSON.stringify(body) : undefined,
  });
}

async function parse(res) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    throw new ApiError(data.error || 'Something went wrong', res.status, data.code, data.details);
  }
  return data;
}

export async function api(path, options = {}) {
  let res = await raw(path, options);
  let data = await res.clone().json().catch(() => ({}));
  if (res.status === 401 && data.code === 'TOKEN_EXPIRED' && !options.skipRefresh) {
    const refreshed = await raw('/auth/refresh', { method: 'POST', skipRefresh: true });
    if (refreshed.ok) {
      res = await raw(path, options);
    }
  }
  return parse(res);
}

export const endpoints = {
  // auth
  me: () => api('/auth/me'),
  login: (body) => api('/auth/login', { method: 'POST', body }),
  signup: (body) => api('/auth/signup', { method: 'POST', body }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  forgotPassword: (body) => api('/auth/forgot-password', { method: 'POST', body }),
  resetPassword: (body) => api('/auth/reset-password', { method: 'POST', body }),
  verifyEmail: (token) => api(`/auth/verify-email?token=${encodeURIComponent(token)}`),
  resendVerification: () => api('/auth/resend-verification', { method: 'POST' }),
  team: () => api('/auth/team'),

  // dashboard / insights
  overview: () => api('/insights/overview'),
  workflowSummary: () => api('/workflow/summary'),
  unsourcedClaims: () => api('/insights/unsourced-claims'),
  guidelineInsights: () => api('/insights/guidelines'),
  confidentiality: () => api('/insights/confidentiality'),

  // knowledge
  guidelines: (params = '') => api(`/guidelines${params}`),
  guideline: (id) => api(`/guidelines/${id}`),
  createGuideline: (body) => api('/guidelines', { method: 'POST', body }),
  updateGuideline: (id, body) => api(`/guidelines/${id}`, { method: 'PATCH', body }),
  archiveGuideline: (id) => api(`/guidelines/${id}`, { method: 'DELETE' }),
  importGuideline: (form) => api('/guidelines/import', { method: 'POST', body: form, form: true }),
  clarity: (id) => api(`/guidelines/${id}/clarity`),
  guidelineImpact: (id) => api(`/guidelines/${id}/impact`),
  draftGuideline: (id) => api(`/guidelines/${id}/draft`, { method: 'POST' }),
  draftDecision: (id, body) => api(`/guideline-drafts/${id}/decision`, { method: 'POST', body }),
  getDraft: (id) => api(`/guideline-drafts/${id}`),

  terms: () => api('/terminology'),
  createTerm: (body) => api('/terminology', { method: 'POST', body }),
  updateTerm: (id, body) => api(`/terminology/${id}`, { method: 'PATCH', body }),
  deleteTerm: (id) => api(`/terminology/${id}`, { method: 'DELETE' }),

  facts: () => api('/facts'),
  createFact: (body) => api('/facts', { method: 'POST', body }),
  updateFact: (id, body) => api(`/facts/${id}`, { method: 'PATCH', body }),
  deleteFact: (id) => api(`/facts/${id}`, { method: 'DELETE' }),

  assets: () => api('/assets'),
  createAsset: (form) => api('/assets', { method: 'POST', body: form, form: true }),
  deleteAsset: (id) => api(`/assets/${id}`, { method: 'DELETE' }),
  importCsv: (form) => api('/knowledge/import-csv', { method: 'POST', body: form, form: true }),
  knowledgeSummary: () => api('/knowledge/summary'),

  // submissions / review
  submissions: (params = '') => api(`/submissions${params}`),
  submission: (id) => api(`/submissions/${id}`),
  createSubmission: (body) => api('/submissions', { method: 'POST', body }),
  uploadSubmission: (form) => api('/submissions/upload', { method: 'POST', body: form, form: true }),
  updateSubmission: (id, body) => api(`/submissions/${id}`, { method: 'PATCH', body }),
  deleteSubmission: (id) => api(`/submissions/${id}`, { method: 'DELETE' }),
  rerunReview: (id) => api(`/submissions/${id}/review`, { method: 'POST' }),
  decideFinding: (id, body) => api(`/findings/${id}/decision`, { method: 'POST', body }),
  rewrite: (id, body) => api(`/submissions/${id}/rewrite`, { method: 'POST', body }),
  claims: (id) => api(`/submissions/${id}/claims`),
  addFactFromClaim: (id, body) => api(`/claims/${id}/add-fact`, { method: 'POST', body }),

  // workflow
  submitForReview: (id, body = {}) => api(`/submissions/${id}/submit`, { method: 'POST', body }),
  assign: (id, userId) => api(`/submissions/${id}/assign`, { method: 'POST', body: { userId } }),
  decision: (id, body) => api(`/submissions/${id}/decision`, { method: 'POST', body }),
  comments: (id) => api(`/submissions/${id}/comments`),
  addComment: (id, body) => api(`/submissions/${id}/comments`, { method: 'POST', body }),
  deleteComment: (id) => api(`/comments/${id}`, { method: 'DELETE' }),
  viaAgent: (body) => api('/reviews/via-agent', { method: 'POST', body }),

  // audit / settings / eval
  audit: (params = '') => api(`/audit${params}`),
  settings: () => api('/settings'),
  updateOrganization: (body) => api('/settings/organization', { method: 'PATCH', body }),
  aiLog: () => api('/settings/ai-log'),
  agentCalls: () => api('/settings/agent-calls'),
  invite: (body) => api('/settings/invite', { method: 'POST', body }),
  pingAgent: () => api('/settings/agent/ping', { method: 'POST' }),
  updateRole: (id, role) => api(`/auth/team/${id}`, { method: 'PATCH', body: { role } }),
  evaluation: () => api('/evaluation/latest'),
  evalRuns: () => api('/evaluation/runs'),
};

export function auditCsvUrl() {
  return '/api/audit/export.csv';
}
