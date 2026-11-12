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
export async function healthHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    commitSha: config.appCommitSha
  });
}

export async function readyHandler(req: Request, res: Response): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
      commitSha: config.appCommitSha
    });
  } catch (error) {
    console.error('Readiness probe database query failed:', error);
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

// 8. Single-container frontend serving with SPA fallback for non-/api routes
const candidateDistPaths = [
  typeof __dirname !== 'undefined' ? path.resolve(__dirname, '../../client/dist') : '',
  path.resolve(process.cwd(), '../client/dist'),
  path.resolve(process.cwd(), 'client/dist')
].filter((p) => p && fs.existsSync(p));

const clientDistPath = candidateDistPaths[0];

if (clientDistPath) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// 9. Global Error Handler
app.use(errorHandler);
