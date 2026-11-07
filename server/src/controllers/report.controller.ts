import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';

/**
 * Report Controller
 * Computes financial summaries for the authenticated tenant.
 *
 * In accordance with:
 * - BR-01: Tenancy Scoping (scoped strictly to req.user.id)
 * - BR-02: Opening Balance Exclusion (opening balances are strictly omitted from income/expense calculations)
 * - BR-10: Admin exclusion (enforced via roleGuard)
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

    const accounts = await prisma.account.findMany({
      where: { user_id: userId }
    });

    const bankBalance = accounts
      .filter((a) => a.type === 'CASH')
      .reduce((sum, a) => sum + Number(a.opening_balance), 0);

    const creditDebt = accounts
      .filter((a) => a.type === 'LOAN_TAKEN')
      .reduce((sum, a) => sum + Number(a.opening_balance), 0);

    res.status(200).json({
      success: true,
      data: {
        bank_balance: bankBalance,
        credit_debt: creditDebt,
        total_income: 0,
        total_expense: 0
      }
    });
  } catch (err) {
    next(err);
  }
}
