import { Request, Response, NextFunction } from 'express';

/**
 * Endpoints that strictly require a JSON request payload.
 * Evaluated without query strings and normalized to lower-case path.
 */
const JSON_BODY_REQUIRED_ENDPOINTS = [
  '/api/auth/login',
  '/login'
];

/**
 * Normalizes request path by stripping query parameters and trailing slashes.
 */
export function normalizeRequestPath(req: Request): string {
  const rawPath = req.originalUrl || req.path || '';
  return rawPath.split('?')[0].replace(/\/+$/, '').toLowerCase();
}

/**
 * Determines whether the given route strictly requires a JSON request body.
 */
export function isJsonBodyRequired(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH'].includes(method)) {
    return false;
  }

  const normalizedPath = normalizeRequestPath(req);
  return JSON_BODY_REQUIRED_ENDPOINTS.some(
    endpoint => normalizedPath === endpoint || normalizedPath.endsWith(endpoint)
  );
}

/**
 * Determines whether the incoming request transmits a message body payload.
 */
export function requestHasBody(req: Request): boolean {
  const contentLength = req.headers['content-length'];
  if (contentLength !== undefined) {
    const parsedLength = parseInt(contentLength, 10);
    if (!isNaN(parsedLength) && parsedLength > 0) {
      return true;
    }
  }

  if (req.headers['transfer-encoding']) {
    return true;
  }

  return false;
}

/**
 * Content-Type validation middleware.
 * Enforces exact 'application/json' media type on endpoints and requests that require or contain
 * JSON bodies, while permitting bodyless mutating endpoints (e.g. POST /api/auth/logout) to proceed.
 */
export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  // Safe methods (GET, HEAD, OPTIONS) do not transmit or validate mutating bodies
  if (!['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
    return next();
  }

  const normalizedPath = normalizeRequestPath(req);

  // Bodyless endpoints are explicitly exempt from body requirements (e.g. POST /api/auth/logout)
  if (normalizedPath.endsWith('/logout')) {
    return next();
  }

  const rawContentType = req.headers['content-type'];
  const hasContentType = Boolean(rawContentType && rawContentType.trim() !== '');
  const endpointRequiresJson = isJsonBodyRequired(req);
  const carriesPayload = requestHasBody(req);

  // Case A & C: If a Content-Type is provided, it must strictly be application/json
  if (hasContentType) {
    const mediaType = rawContentType!.split(';')[0].trim().toLowerCase();
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

  // Case A & C: Missing Content-Type when the endpoint requires a JSON body or carries a payload
  if (endpointRequiresJson || carriesPayload) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_CONTENT_TYPE',
        message: 'Content-Type header is required and must be application/json'
      }
    });
    return;
  }

  // Case B: Endpoint does not require a body and request transmits no body -> proceed
  next();
}
