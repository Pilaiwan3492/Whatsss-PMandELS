import { Request, Response, NextFunction } from 'express';

/**
 * Endpoints that strictly require a non-empty JSON request payload.
 * Evaluated on normalized paths without query strings or trailing slashes.
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
 * Note: Content-Length: 0 or empty body is not considered a payload.
 */
export function requestHasBody(req: Request): boolean {
  const contentLength = req.headers['content-length'];
  if (contentLength !== undefined) {
    const parsedLength = parseInt(contentLength, 10);
    if (!isNaN(parsedLength) && parsedLength > 0) {
      return true;
    }
  }

  const transferEncoding = req.headers['transfer-encoding'];
  if (transferEncoding && transferEncoding.toLowerCase() !== 'identity') {
    return true;
  }

  return false;
}

/**
 * Content-Type validation middleware.
 *
 * Rules:
 * - Safe methods (GET, HEAD, OPTIONS): pass directly.
 * - If endpoint does NOT require a body AND request has NO body:
 *   Pass directly without rejecting regardless of Content-Type (Case A & Case D bodyless).
 * - If endpoint REQUIRES a JSON body, but request has NO body:
 *   Reject with 400 MISSING_REQUEST_BODY (Case C1).
 * - If request transmits a payload:
 *   - Missing Content-Type: reject with 400 INVALID_CONTENT_TYPE (Case B1 & C2).
 *   - Non-JSON MIME type: reject with 400 INVALID_CONTENT_TYPE (Case B2 & C3).
 *   - Exact application/json (or with parameters like charset=utf-8): pass to express.json().
 */
export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  // Safe methods (GET, HEAD, OPTIONS) do not transmit or validate mutating bodies
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    return next();
  }

  const carriesPayload = requestHasBody(req);
  const endpointRequiresJson = isJsonBodyRequired(req);

  // Case A & D (bodyless): Endpoint does not require body AND request has no body
  if (!endpointRequiresJson && !carriesPayload) {
    return next();
  }

  // Case C1: Endpoint requires JSON body, but request carries no body
  if (endpointRequiresJson && !carriesPayload) {
    res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_REQUEST_BODY',
        message: 'Request body is required and must not be empty'
      }
    });
    return;
  }

  // From here onward, the request carries a body payload (carriesPayload === true)
  const rawContentType = req.headers['content-type'];
  const hasContentType = Boolean(rawContentType && rawContentType.trim() !== '');

  // Case B1 & C2: Carries body but missing Content-Type header
  if (!hasContentType) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_CONTENT_TYPE',
        message: 'Content-Type header is required and must be application/json'
      }
    });
    return;
  }

  // Case B2 & C3: Carries body and has Content-Type -> must be exact application/json
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

  next();
}
