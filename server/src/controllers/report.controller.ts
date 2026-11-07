import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';

/**
 * Report Controller
 * Computes financial summaries for the authenticated tenant.
 *
 * In accordance with:
 * - BR-01: Tenancy Scoping (scoped strictly to req.user.id)
 * - BR-02: Opening Balance Exclusion (opening balances are strictly omitted from income/expense calculations)
 * - BR-10: Admin exclusion (enforced via roleGuard)
 * - NFR-DATA-01: Decimal arithmetic preservation (uses Prisma.Decimal to prevent floating-point inaccuracies)
 *
 * ARCHITECTURE & SCOPE BOUNDARY NOTE (WP-02 vs WP-03 / WP-04):
 * - In WP-02, the system manages financial accounts and their opening balances.
 * - bank_balance aggregates CASH accounts' opening_balance using exact Decimal addition.
 * - credit_debt aggregates LOAN_TAKEN accounts' opening_balance using exact Decimal addition.
 * - Crucially, opening_balance on ANY account (including INCOME accounts like Salary and
 *   EXPENSE accounts like Dining or Grocery) must NEVER contribute to total_income or total_expense (BR-02).
 * - Financial transactions (income in WP-03, expenses in WP-04) do not exist yet in WP-02;
 *   therefore total_income and total_expense remain strictly 0.00 in this release.
 * - When WP-03 and WP-04 implement transaction records, transaction totals will be calculated
 *   from those transaction/allocation tables, and must NEVER incorporate Account.opening_balance.
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

    const zero = new Prisma.Decimal('0.00');

    // Perform exact arbitrary-precision Decimal addition to prevent floating-point IEEE 754 precision errors
    const bankBalanceDecimal = accounts
      .filter((a) => a.type === 'CASH')
      .reduce((sum, a) => sum.add(new Prisma.Decimal(a.opening_balance.toString())), zero);

    const creditDebtDecimal = accounts
      .filter((a) => a.type === 'LOAN_TAKEN')
      .reduce((sum, a) => sum.add(new Prisma.Decimal(a.opening_balance.toString())), zero);

    res.status(200).json({
      success: true,
      data: {
        bank_balance: Number(bankBalanceDecimal.toFixed(2)),
        credit_debt: Number(creditDebtDecimal.toFixed(2)),
        total_income: 0,
        total_expense: 0
      }
    });
  } catch (err) {
    next(err);
  }
}
