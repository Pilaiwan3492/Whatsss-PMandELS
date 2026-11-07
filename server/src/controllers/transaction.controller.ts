import { Request, Response, NextFunction } from 'express';
import { recordIncome, IncomeError } from '../services/income.service.js';

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
