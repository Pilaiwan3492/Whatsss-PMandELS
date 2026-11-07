import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';

export const MAX_OPENING_BALANCE = new Prisma.Decimal('9999999999.99');

/**
 * Validates opening balance using Decimal-aware precision and range checks.
 * In accordance with F-03, FR-05, and AC-03-2:
 * - Must be a finite number type.
 * - Must be non-negative (>= 0.00).
 * - Maximum precision allowed is 2 decimal places.
 * - Maximum value allowed is 9,999,999,999.99 (DECIMAL(12, 2)).
 * - Never silently rounds an invalid amount.
 */
export function validateOpeningBalanceDecimal(val: unknown): {
  isValid: boolean;
  decimal?: Prisma.Decimal;
  error?: string;
} {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return { isValid: false, error: 'Opening balance must be a valid finite number.' };
  }

  if (val < 0) {
    return { isValid: false, error: 'Opening balance cannot be negative.' };
  }

  try {
    const str = val.toString();
    const decimal = new Prisma.Decimal(str);

    if (decimal.decimalPlaces() > 2) {
      return { isValid: false, error: 'Opening balance allows at most 2 decimal places.' };
    }

    if (decimal.greaterThan(MAX_OPENING_BALANCE)) {
      return { isValid: false, error: 'Opening balance exceeds maximum allowed limit (9,999,999,999.99).' };
    }

    return { isValid: true, decimal };
  } catch {
    return { isValid: false, error: 'Invalid decimal value.' };
  }
}

/**
 * GET /api/accounts
 * Retrieves all accounts owned by the authenticated tenant.
 * Scoped strictly to authenticated req.user.id.
 */
export async function getAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required', details: [] }
      });
      return;
    }

    const accounts = await prisma.account.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'asc' }
    });

    res.status(200).json({
      success: true,
      data: {
        accounts: accounts.map((acc) => ({
          id: acc.id,
          user_id: acc.user_id,
          name: acc.name,
          type: acc.type,
          opening_balance: Number(acc.opening_balance),
          is_opening_locked: acc.is_opening_locked,
          created_at: acc.created_at.toISOString(),
          updated_at: acc.updated_at.toISOString()
        }))
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/accounts/:id
 * Retrieves a single account owned by the authenticated tenant.
 * Scoped strictly to authenticated req.user.id; foreign accounts return 404 to conceal resource existence (BR-01).
 */
export async function getAccountById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    const accountId = req.params.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required', details: [] }
      });
      return;
    }

    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        user_id: userId
      }
    });

    if (!account) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Account not found.',
          details: []
        }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        account: {
          id: account.id,
          user_id: account.user_id,
          name: account.name,
          type: account.type,
          opening_balance: Number(account.opening_balance),
          is_opening_locked: account.is_opening_locked,
          created_at: account.created_at.toISOString(),
          updated_at: account.updated_at.toISOString()
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/accounts/:id/opening-balance
 * Updates the opening balance of an unlocked account owned by the authenticated tenant.
 *
 * Requirements & Invariants:
 * - F-03 / AC-03-1: Valid update returns 200 OK.
 * - AC-03-2: Invalid input (negative, non-numeric, >2 decimals, out-of-range) returns 400 INVALID_OPENING_BALANCE.
 * - AC-03-3: Locked account returns 422 OPENING_BALANCE_LOCKED.
 * - BR-01: Foreign or missing account returns 404 NOT_FOUND.
 * - NFR-DATA-01: Atomic conditional update with safe race handling.
 */
export async function updateOpeningBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    const accountId = req.params.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required', details: [] }
      });
      return;
    }

    const { opening_balance } = req.body ?? {};

    // 1. Decimal validation check (AC-03-2)
    const validation = validateOpeningBalanceDecimal(opening_balance);
    if (!validation.isValid || !validation.decimal) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OPENING_BALANCE',
          message: 'Opening balance must be a non-negative numeric value with up to 2 decimal places.',
          details: []
        }
      });
      return;
    }

    // 2. Tenancy and existence check (BR-01)
    const existingAccount = await prisma.account.findFirst({
      where: {
        id: accountId,
        user_id: userId
      }
    });

    if (!existingAccount) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Account not found.',
          details: []
        }
      });
      return;
    }

    // 3. Lock check (AC-03-3)
    if (existingAccount.is_opening_locked) {
      res.status(422).json({
        success: false,
        error: {
          code: 'OPENING_BALANCE_LOCKED',
          message: 'Opening balance cannot be updated after the first transaction.',
          details: []
        }
      });
      return;
    }

    // 4. Atomic conditional update (NFR-DATA-01)
    const updateResult = await prisma.account.updateMany({
      where: {
        id: accountId,
        user_id: userId,
        is_opening_locked: false
      },
      data: {
        opening_balance: validation.decimal,
        updated_at: new Date()
      }
    });

    // 5. Safe race condition handling
    if (updateResult.count === 0) {
      // Re-query account scoped to user to determine race cause
      const rechecked = await prisma.account.findFirst({
        where: {
          id: accountId,
          user_id: userId
        }
      });

      if (!rechecked) {
        // Account was deleted concurrently
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Account not found.',
            details: []
          }
        });
        return;
      }

      if (rechecked.is_opening_locked) {
        // Account was locked concurrently by a committed transaction
        res.status(422).json({
          success: false,
          error: {
            code: 'OPENING_BALANCE_LOCKED',
            message: 'Opening balance cannot be updated after the first transaction.',
            details: []
          }
        });
        return;
      }

      res.status(422).json({
        success: false,
        error: {
          code: 'OPENING_BALANCE_LOCKED',
          message: 'Opening balance cannot be updated after the first transaction.',
          details: []
        }
      });
      return;
    }

    // 6. Fetch updated record
    const updatedAccount = await prisma.account.findFirst({
      where: {
        id: accountId,
        user_id: userId
      }
    });

    res.status(200).json({
      success: true,
      data: {
        account: {
          id: updatedAccount!.id,
          user_id: updatedAccount!.user_id,
          name: updatedAccount!.name,
          type: updatedAccount!.type,
          opening_balance: Number(updatedAccount!.opening_balance),
          is_opening_locked: updatedAccount!.is_opening_locked,
          created_at: updatedAccount!.created_at.toISOString(),
          updated_at: updatedAccount!.updated_at.toISOString()
        }
      }
    });
  } catch (err) {
    next(err);
  }
}
