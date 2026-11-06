import { Request, Response, NextFunction } from 'express';

/**
 * Endpoints that strictly require a JSON request payload.
 * As additional domain entities are added in future work packages (WP-02..06),
 * mutating endpoints requiring payloads are registered here or automatically
 * detected via incoming payload presence.
 */
const JSON_BODY_ENDPOINTS = [
  '/api/auth/login',
  '/login'
];

export function isJsonBodyRequired(path: string): boolean {
  return JSON_BODY_ENDPOINTS.some(endpoint => path.endsWith(endpoint) || path === endpoint);
}

export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  // Safe methods do not mutate data
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const path = req.originalUrl ? req.originalUrl.split('?')[0] : req.path;

  // Bodyless endpoints are explicitly exempt (e.g. POST /api/auth/logout)
  if (path.endsWith('/logout')) {
    return next();
  }

  const rawContentType = req.headers['content-type'];
  const contentLength = req.headers['content-length'];
  const hasBody = (contentLength && parseInt(contentLength, 10) > 0) || Boolean(req.headers['transfer-encoding']);
  const requiresJson = isJsonBodyRequired(path) || hasBody;

  // If a Content-Type is provided, it must be exact application/json
  if (rawContentType && rawContentType.trim() !== '') {
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
    return next();
  }

  // If no Content-Type was sent, reject only if endpoint requires a JSON body or carries payload
  if (requiresJson) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_CONTENT_TYPE',
        message: 'Content-Type header is required and must be application/json'
      }
    });
    return;
  }

  // Bodyless mutating request to an endpoint not requiring a body proceeds
  next();
}
