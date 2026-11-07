import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';

export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  // Safe methods are exempt
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;

  let requestOrigin: string | null = null;

  if (originHeader) {
    if (originHeader === 'null') {
      res.status(403).json({
        success: false,
        error: {
          code: 'CSRF_ORIGIN_REJECTED',
          message: 'Cross-site request origin rejected'
        }
      });
      return;
    }
    requestOrigin = originHeader;
  } else if (refererHeader) {
    try {
      const parsedReferer = new URL(refererHeader);
      requestOrigin = parsedReferer.origin;
    } catch {
      res.status(403).json({
        success: false,
        error: {
          code: 'CSRF_ORIGIN_REJECTED',
          message: 'Cross-site request origin rejected'
        }
      });
      return;
    }
  }

  // Strict match against clientUrl
  if (!requestOrigin || requestOrigin !== config.clientUrl) {
    res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_ORIGIN_REJECTED',
        message: 'Cross-site request origin rejected'
      }
    });
    return;
  }

  next();
}
