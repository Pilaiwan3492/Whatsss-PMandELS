import { Request, Response, NextFunction } from 'express';

export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  // Bodyless endpoints are exempt (e.g. POST /api/auth/logout)
  const path = req.originalUrl ? req.originalUrl.split('?')[0] : req.path;
  if (req.method === 'POST' && (path.endsWith('/logout') || req.path.endsWith('/logout'))) {
    return next();
  }

  // Only validate mutating methods
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const rawContentType = req.headers['content-type'];

    if (!rawContentType || rawContentType.trim() === '') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: 'Content-Type header is required and must be application/json'
        }
      });
      return;
    }

    // Parse exact media type before any parameter (e.g. charset=utf-8)
    const mediaType = rawContentType.split(';')[0].trim().toLowerCase();

    if (mediaType !== 'application/json') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: 'Content-Type must be application/json'
        }
      });
      return;
    }
  }

  next();
}
