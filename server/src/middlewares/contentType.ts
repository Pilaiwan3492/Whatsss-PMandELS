import { Request, Response, NextFunction } from 'express';

export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  // Bodyless endpoints are exempt (e.g. POST /api/auth/logout)
  const path = req.originalUrl ? req.originalUrl.split('?')[0] : req.path;
  if (req.method === 'POST' && (path.endsWith('/logout') || req.path.endsWith('/logout'))) {
    return next();
  }

  // Only validate mutating methods
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];

    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: 'Content-Type header is required and must be application/json'
        }
      });
      return;
    }
  }

  next();
}
