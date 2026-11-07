import { Request, Response, NextFunction } from 'express';
import { getFinancialSummary } from '../services/report.service.js';

/**
 * Report Controller
 * Computes real-time financial summaries for the authenticated tenant.
 *
 * In accordance with:
 * - BR-01: Tenancy Scoping (scoped strictly to req.user.id)
 * - BR-02: Opening Balance Exclusion (opening balances are strictly omitted from income/expense summaries)
 * - BR-03: Income increases cash balance & income summary
 * - BR-04: Credit Card purchase increases credit debt & expense summary
 * - BR-07: Repayment reduces cash balance and credit card debt
 * - BR-08: Debt repayment excluded from expense summary
 * - BR-10: Admin exclusion (enforced via roleGuard)
 * - NFR-DATA-01: Decimal arithmetic preservation (uses Prisma.Decimal to prevent floating-point inaccuracies)
 * - AC-08-1: Returns Bank 27000.00, Debt 0.00, Income 20000.00, Expense 3000.00, Dining 1000.00, Grocery 2000.00
 */
export async function getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          details: []
        }
      });
      return;
    }

    const summary = await getFinancialSummary(userId);

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (err) {
    next(err);
  }
}
