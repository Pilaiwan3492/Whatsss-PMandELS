import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  // Add Vary: Origin header to prevent cache poisoning across origins
  res.setHeader('Vary', 'Origin');

  // Verify trusted origin against configured clientUrl (never allow wildcard with credentials)
  if (origin && origin === config.clientUrl) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  // Early-terminate CORS Preflight OPTIONS requests before CSRF, Auth, or business logic
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}
