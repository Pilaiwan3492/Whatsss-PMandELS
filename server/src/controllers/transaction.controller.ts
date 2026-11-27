import { Request, Response, NextFunction } from 'express';
import { recordIncome, IncomeError } from '../services/income.service.js';
import { recordExpense, ExpenseError } from '../services/expense.service.js';
import { recordRepayment, RepaymentError } from '../services/repayment.service.js';
import { recordTransfer, TransferError } from '../services/transfer.service.js';
import { correctTransaction, CorrectionError } from '../services/correction.service.js';
import { queryTransactions, TransactionQueryError } from '../services/transactionQuery.service.js';
import {
  toggleTransactionFavorite,
  duplicateTransaction,
  FavoriteDuplicateError
} from '../services/favoriteDuplicate.service.js';
import {
  recordLoanGiven,
  recordLoanRecovery,
  recordLoanBorrowing,
  recordLoanRepayment,
  LoanError
} from '../services/loan.service.js';

/**
 * Transaction Controller
 * Handles financial transaction endpoints in Whatsss.
 */

/**
 * GET /api/transactions
 * Retrieves chronological transaction history for the authenticated tenant with optional
 * search & multi-criteria filtering (F-09, F-15, FR-11, FR-18, AC-09-1, AC-15-1..3).
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

    const transactions = await queryTransactions(userId, req.query as any);

    res.status(200).json({
      success: true,
      data: { transactions }
    });
  } catch (err: any) {
    if (err instanceof TransactionQueryError) {
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

/**
 * POST /api/transactions/transfer
 * Records an internal cash transfer between two CASH accounts owned by the authenticated user (F-11, WP-08, FR-13).
 * Atomically decreases source CASH balance and increases destination CASH balance while excluding
 * the transfer from Income and Expense summaries (BR-02).
 */
export async function createTransferTransaction(
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

    const result = await recordTransfer(userId, req.body);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err: any) {
    if (err instanceof TransferError) {
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
 * PATCH /api/transactions/:id/favorite
 * Toggles favorite status on a user-owned transaction (F-14, WP-10, FR-16, AC-14-1).
 */
export async function toggleFavoriteTransaction(
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

    const result = await toggleTransactionFavorite(userId, req.params.id, req.body);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err: any) {
    if (err instanceof FavoriteDuplicateError) {
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
 * POST /api/transactions/:id/duplicate
 * Duplicates an existing user-owned transaction with live domain re-validation (F-14, WP-10, FR-17, AC-14-2..3).
 */
export async function duplicateTransactionHandler(
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

    const result = await duplicateTransaction(userId, req.params.id, req.body || {});

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err: any) {
    if (err instanceof FavoriteDuplicateError) {
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
 * POST /api/transactions/loan-given
 * Disburses funds from an owned CASH account to an owned LOAN_GIVEN account (F-12, WP-09, FR-14, BR-08).
 */
export async function createLoanGivenTransaction(
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

    const result = await recordLoanGiven(userId, req.body);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err: any) {
    if (err instanceof LoanError) {
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
 * POST /api/transactions/loan-recovery
 * Recovers loan principal from an owned LOAN_GIVEN account into an owned CASH account (F-12, WP-09, FR-14, BR-08).
 */
export async function createLoanRecoveryTransaction(
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

    const result = await recordLoanRecovery(userId, req.body);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err: any) {
    if (err instanceof LoanError) {
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
 * POST /api/transactions/loan-borrowing
 * Records money borrowed from an owned general LOAN_TAKEN account (subtype GENERAL_LOAN) into a CASH account (F-13, WP-09, FR-15, BR-08).
 */
export async function createLoanBorrowingTransaction(
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

    const result = await recordLoanBorrowing(userId, req.body);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err: any) {
    if (err instanceof LoanError) {
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
 * POST /api/transactions/loan-repayment
 * Repays general loan principal from an owned CASH account to an owned general LOAN_TAKEN account (subtype GENERAL_LOAN) (F-13, WP-09, FR-15, BR-08).
 */
export async function createLoanRepaymentTransaction(
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

    const result = await recordLoanRepayment(userId, req.body);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err: any) {
    if (err instanceof LoanError) {
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
 * PUT /api/transactions/:id & PATCH /api/transactions/:id
 * Atomically corrects a user-owned transaction and records an immutable TransactionAuditLog (F-16, WP-11, FR-19).
 */
export async function correctTransactionHandler(
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

    const result = await correctTransaction(userId, req.params.id, req.body);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err: any) {
    if (err instanceof CorrectionError) {
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
