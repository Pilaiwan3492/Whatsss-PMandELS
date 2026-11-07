import { Request, Response, NextFunction } from 'express';
import { recordIncome, IncomeError } from '../services/income.service.js';
import { recordExpense, ExpenseError } from '../services/expense.service.js';

/**
 * Transaction Controller
 * Handles financial transaction endpoints in Whatsss.
 */

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
