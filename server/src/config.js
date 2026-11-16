// server/src/config.js
// Loads environment variables from the most likely .env locations so both
// `npm run dev --workspace server` (cwd=server) and `node server/scripts/...`
// (cwd=repo root) work without extra setup.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.resolve(here, '..', '.env'), // server/.env
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'server', '.env'),
];

for (const file of candidates) {
  dotenv.config({ path: file });
}

const accessExpiresRaw = process.env.JWT_ACCESS_EXPIRES || '900s';

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  accessExpires: /^\d+$/.test(accessExpiresRaw) ? `${accessExpiresRaw}s` : accessExpiresRaw,
  refreshDays: Number(process.env.JWT_REFRESH_DAYS || 7),
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'brandshield',
    password: process.env.MYSQL_PASSWORD || 'examplePass',
    database: process.env.MYSQL_DATABASE || 'brandshield',
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.startsWith('PLACEHOLDER')
      ? process.env.GROQ_API_KEY
      : '',
    baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    fallbackModel: process.env.GROQ_FALLBACK_MODEL || 'llama-3.1-8b-instant',
    timeoutMs: Number(process.env.GROQ_TIMEOUT_MS || 20000),
  },
  agent: {
    serviceToken: process.env.AGENT_SERVICE_TOKEN || '',
    bridgeUrl: process.env.AGENT_BRIDGE_URL || '',
    address: process.env.AGENT_ADDRESS || '',
    organizationId: process.env.AGENT_ORGANIZATION_ID ? Number(process.env.AGENT_ORGANIZATION_ID) : null,
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'BrandShield <no-reply@brandshield.ai>',
  },
  storageDir: process.env.STORAGE_DIR || path.resolve(here, '..', 'storage'),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  apiUrl: process.env.API_URL || 'http://localhost:4000',
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 300),
  metrics: {
    minSample: Number(process.env.CLARITY_MIN_SAMPLE || 8),
    clarityThreshold: Number(process.env.CLARITY_THRESHOLD || 0.35),
  },
};

export default config;
