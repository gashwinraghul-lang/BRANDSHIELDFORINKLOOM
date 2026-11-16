// server/src/index.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import config from './config.js';
import pool from './db.js';
import { runMigrations } from '../scripts/migrate.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { CSRF_COOKIE } from './lib/tokens.js';
import { isLlmAvailable, currentModelName } from './services/llmClient.js';
import { isEmailConfigured } from './utils/email.js';

import authRoutes from './routes/auth.js';
import knowledgeRoutes from './routes/knowledge.js';
import submissionRoutes from './routes/submissions.js';
import workflowRoutes from './routes/workflow.js';
import insightsRoutes from './routes/insights.js';
import auditRoutes from './routes/audit.js';
import reviewRoutes from './routes/review.js';
import settingsRoutes from './routes/settings.js';
import agentRoutes, { websiteAgentRouter } from './routes/agent.js';
import evaluationRoutes from './routes/evaluation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();

app.disable('x-powered-by');
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = req.headers['x-request-id'] || crypto.randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
  })
);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const allowed = [config.clientOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173', config.appUrl];
      return allowed.includes(origin) ? callback(null, true) : callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
app.use(cookieParser());

// Double-submit CSRF for cookie-authenticated mutations. Bearer-token and
// agent-service calls are exempt because they are not cookie based.
const CSRF_EXEMPT = new Set([
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
]);
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (CSRF_EXEMPT.has(req.path)) return next();
  if (req.path.startsWith('/api/agent')) return next();
  if (req.headers.authorization?.startsWith('Bearer ')) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF check failed. Refresh the page and try again.', code: 'CSRF_FAILED' });
  }
  return next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
});
app.use('/api', limiter);

app.get('/api/health', async (req, res) => {
  const started = Date.now();
  let database = { status: 'unknown' };
  try {
    await pool.query('SELECT 1');
    database = { status: 'connected', latencyMs: Date.now() - started };
  } catch (err) {
    database = { status: 'error', error: err.message };
  }
  res.status(database.status === 'connected' ? 200 : 503).json({
    status: database.status === 'connected' ? 'ok' : 'degraded',
    database,
    ai: {
      provider: 'groq',
      configured: isLlmAvailable(),
      model: isLlmAvailable() ? currentModelName() : null,
      fallback: 'deterministic engines',
    },
    agent: {
      configured: Boolean(config.agent.bridgeUrl || config.agent.address),
      mode: config.agent.bridgeUrl ? 'bridge' : 'offline',
    },
    email: { configured: isEmailConfigured() },
    version: '1.0.0',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', knowledgeRoutes);
app.use('/api', submissionRoutes);
app.use('/api', workflowRoutes);
app.use('/api', insightsRoutes);
app.use('/api', auditRoutes);
app.use('/api', settingsRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api', reviewRoutes);
app.use('/api', websiteAgentRouter);
app.use('/api', evaluationRoutes);

// Production build is served by Express when it exists.
const clientDist = path.resolve(here, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false }));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    await runMigrations();
    logger.info('Migrations completed');
    app.listen(config.port, () => {
      logger.info(`BrandShield API listening on http://localhost:${config.port}`);
      logger.info(`Database ${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`);
      logger.info(`AI: ${isLlmAvailable() ? `Groq (${currentModelName()})` : 'deterministic (no Groq key)'}`);
    });
  } catch (err) {
    logger.error({ err }, 'Startup failed');
    process.exit(1);
  }
}

start();

export default app;
