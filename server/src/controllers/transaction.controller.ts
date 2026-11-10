import { Request, Response, NextFunction } from 'express';
import { recordIncome, IncomeError } from '../services/income.service.js';
import { recordExpense, ExpenseError } from '../services/expense.service.js';
import { recordRepayment, RepaymentError } from '../services/repayment.service.js';
import { getTransactionHistory } from '../services/report.service.js';

/**
 * Transaction Controller
 * Handles financial transaction endpoints in Whatsss.
 */

/**
 * GET /api/transactions
 * Retrieves chronological transaction history for the authenticated tenant (F-09, WP-06, FR-11, AC-09-1).
 * Ordered by transaction_date DESC, created_at DESC.
 */
export async function getTransactions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    const transactions = await getTransactionHistory(userId);

    res.status(200).json({
      success: true,
      data: { transactions }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/transactions/income
 * Records an income inflow into an owned CASH account with exactly one ALLOCATION line.
 * Locks the primary CASH account's opening balance atomically upon commit.
 */
export async function createIncomeTransaction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    const result = await recordIncome(userId, req.body);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err: any) {
    if (err instanceof IncomeError) {
      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details
        }
      });
      return;
    }
    next(err);
  }
}

/**
 * POST /api/transactions/expense
 * Records an expense / purchase charged to a LOAN_TAKEN account (e.g. Credit Card)
 * with one or more ALLOCATION lines (F-05, F-06, WP-04).
 * Validates Split Sum Integrity (BR-05, BR-06) and locks opening balances atomically.
 */
export async function createExpenseTransaction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    const result = await recordExpense(userId, req.body);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err: any) {
    if (err instanceof ExpenseError) {
      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details
        }
      });
      return;
    }
    next(err);
  }
}

/**
 * POST /api/transactions/repayment
 * Records a debt settlement repayment originating from a CASH account targeting a LOAN_TAKEN account (F-07, WP-05).
 * Atomically decreases Cash balance and Credit Card debt balance while strictly excluding
 * repayment transaction from Expense summaries (BR-07, BR-08).
 */
export async function createRepaymentTransaction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    const result = await recordRepayment(userId, req.body);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err: any) {
    if (err instanceof RepaymentError) {
      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details
        }
      });
      return;
    }
    next(err);
  }
}
