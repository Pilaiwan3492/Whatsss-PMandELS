import { Request, Response, NextFunction } from 'express';

export function tenantGuard(req: Request, res: Response, next: NextFunction): void {
  // If request targets a specific resource by ID
  const resourceOwnerId = (req as any).resourceOwnerId;

  if (resourceOwnerId && req.user && resourceOwnerId !== req.user.id) {
    res.status(404).json({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Resource not found'
      }
    });
    return;
  }

  next();
}
