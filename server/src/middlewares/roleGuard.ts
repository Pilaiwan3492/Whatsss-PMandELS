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
  const pathsToCheck = [fullPath, req.path];
  const isFinancialRoute = pathsToCheck.some(path =>
    financialPathPrefixes.some(prefix => {
      const normalizedPrefix = prefix.replace(/\/+$/, '');
      const normalizedPath = path.replace(/\/+$/, '');
      return (
        normalizedPath === normalizedPrefix ||
        normalizedPath.startsWith(`${normalizedPrefix}/`)
      );
    })
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
