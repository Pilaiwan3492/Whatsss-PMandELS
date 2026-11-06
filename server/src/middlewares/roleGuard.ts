import { Request, Response, NextFunction } from 'express';

export function roleGuard(req: Request, res: Response, next: NextFunction): void {
  const financialPathPrefixes = [
    '/api/accounts',
    '/api/transactions',
    '/api/reports',
    '/accounts',
    '/transactions',
    '/reports'
  ];

  const fullPath = req.originalUrl ? req.originalUrl.split('?')[0] : req.path;
  const isFinancialRoute = financialPathPrefixes.some(
    prefix => fullPath.startsWith(prefix) || req.path.startsWith(prefix)
  );

  if (isFinancialRoute && req.user?.role === 'ADMIN') {
    res.status(403).json({
      success: false,
      error: {
        code: 'ADMIN_FINANCIAL_ACCESS_FORBIDDEN',
        message: 'Admins cannot access financial endpoints'
      }
    });
    return;
  }

  next();
}
