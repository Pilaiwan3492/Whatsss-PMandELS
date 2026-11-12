import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { corsMiddleware } from './middlewares/cors.js';
import { csrfGuard } from './middlewares/csrfGuard.js';
import { requireJsonContentType } from './middlewares/contentType.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { config } from './config/env.js';
import { prisma } from './prisma.js';
import authRoutes from './routes/auth.routes.js';
import accountRoutes from './routes/account.routes.js';
import transactionRoutes from './routes/transaction.routes.js';
import financialRoutes from './routes/financial.routes.js';

export const app = express();

// Trust proxy for Cloud Run HTTPS reverse proxy
app.set('trust proxy', 1);

// 1. CORS Middleware
app.use(corsMiddleware);

// 2. CSRF Validation Middleware
app.use(csrfGuard);

// 3. Content-Type check for mutating JSON requests
app.use(requireJsonContentType);

// 4. JSON body parser
app.use(express.json());

// 5. Cookie Parser
app.use(cookieParser());

// 6. Cloud-Ready Health & Readiness Probes (Point 6)
export function sanitizeLogMessage(message: string): string {
  let sanitized = message
    // Redact user:password in URI connection strings (e.g. postgresql://user:pass@host)
    .replace(/:\/\/([^@\s]+)@/g, '://***:***@')
    // Redact query parameter credentials (e.g. ?password=xyz, &secret=xyz, &token=xyz, &access_token=xyz, &refresh_token=xyz)
    .replace(/([?&](?:password|pwd|secret|key|token|access_token|refresh_token)=)[^&\s]+/gi, '$1***')
    // Redact key-value credentials in prose/logs (e.g. password=xyz, password: xyz)
    .replace(/(password(?:_hash)?\s*[:=]\s*)[^\s;&,]+/gi, '$1***')
    // Redact tokens and secret keys in prose/logs (e.g. access_token=xyz, refreshToken: xyz)
    .replace(/((?:access_token|refreshToken|refresh_token|api_key|secret_key)\s*[:=]\s*)[^\s;&,]+/gi, '$1***')
    // Redact Authorization Bearer headers/tokens (e.g. Bearer eyJhbGciOi...)
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[REDACTED_TOKEN]')
    // Redact Authorization headers
    .replace(/((?:authorization)\s*[:=]\s*(?:Bearer\s+)?)[^\s;&,]+/gi, '$1[REDACTED_AUTH]')
    // Redact Cookie headers
    .replace(/((?:cookie)\s*[:=]\s*)[^\r\n;&]+/gi, '$1[REDACTED_COOKIE]');

  // Explicitly redact known configured secrets from environment if present
  if (config.jwtSecret && config.jwtSecret.length >= 10) {
    sanitized = sanitized.replaceAll(config.jwtSecret, '[REDACTED_SECRET]');
  }
  if (process.env.SEED_ADMIN_PASSWORD && process.env.SEED_ADMIN_PASSWORD.length >= 8) {
    sanitized = sanitized.replaceAll(process.env.SEED_ADMIN_PASSWORD, '[REDACTED_PASSWORD]');
  }
  if (process.env.SEED_DEMO_PASSWORD && process.env.SEED_DEMO_PASSWORD.length >= 8) {
    sanitized = sanitized.replaceAll(process.env.SEED_DEMO_PASSWORD, '[REDACTED_PASSWORD]');
  }

  return sanitized;
}

export async function healthHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    commitSha: config.appCommitSha
  });
}

export async function readyHandler(req: Request, res: Response): Promise<void> {
  try {
    // Database probe with a 3-second timeout to prevent connection hangs
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('Database probe query timed out after 3000ms')), 3000);
    });

    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        timeoutPromise
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    res.status(200).json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
      commitSha: config.appCommitSha
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : 'DatabaseError';
    console.error(`Readiness probe database query failed [${errorName}]: ${sanitizeLogMessage(rawMessage)}`);
    res.status(503).json({
      status: 'not_ready',
      database: 'disconnected',
      error: 'Database connection unavailable',
      timestamp: new Date().toISOString(),
      commitSha: config.appCommitSha
    });
  }
}

app.get('/api/health', healthHandler);
app.get('/api/ready', readyHandler);

// 7. Domain API Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api', financialRoutes);

// 8. API 404 Catch-All Handler (Ensures unmatched /api routes return structured JSON 404, never index.html)
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `API endpoint not found: ${req.method} ${req.originalUrl}`
    }
  });
});

// 9. Single-container frontend serving with SPA fallback for non-/api routes
const candidateDistPaths = [
  typeof __dirname !== 'undefined' ? path.resolve(__dirname, '../../client/dist') : '',
  path.resolve(process.cwd(), '../client/dist'),
  path.resolve(process.cwd(), 'client/dist')
].filter((p) => p && fs.existsSync(p));

const clientDistPath = candidateDistPaths[0];

if (clientDistPath) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// 10. Global Error Handler
app.use(errorHandler);
