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
 * Dynamically computes current_balance for CASH accounts using exact Decimal arithmetic.
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

    const zero = new Prisma.Decimal('0.00');
    const cashAccountIds = accounts.filter((a) => a.type === 'CASH').map((a) => a.id);

    const receiveMap = new Map<string, Prisma.Decimal>();
    const paymentMap = new Map<string, Prisma.Decimal>();
    const loanTakenAccountIds = accounts.filter((a) => a.type === 'LOAN_TAKEN').map((a) => a.id);
    const creditChargeMap = new Map<string, Prisma.Decimal>();
    const creditRepaymentMap = new Map<string, Prisma.Decimal>();

    if (typeof prisma.transaction?.groupBy === 'function' && cashAccountIds.length > 0) {
      const grouped = await prisma.transaction.groupBy({
        by: ['primary_account_id', 'form'],
        where: {
          user_id: userId,
          primary_account_id: { in: cashAccountIds }
        },
        _sum: {
          total_amount: true
        }
      });

      for (const row of grouped) {
        if (!row.primary_account_id) continue;
        const sumVal = row._sum?.total_amount
          ? new Prisma.Decimal(row._sum.total_amount.toString())
          : zero;
        if (row.form === 'RECEIVE_MONEY') {
          receiveMap.set(row.primary_account_id, sumVal);
        } else if (row.form === 'PAYMENT_CHARGE') {
          paymentMap.set(row.primary_account_id, sumVal);
        }
      }
    }

    // Compute credit charges for LOAN_TAKEN accounts (PAYMENT_CHARGE on LOAN_TAKEN primary accounts) (BR-04)
    if (typeof prisma.transaction?.groupBy === 'function' && loanTakenAccountIds.length > 0) {
      const chargeGrouped = await prisma.transaction.groupBy({
        by: ['primary_account_id'],
        where: {
          user_id: userId,
          primary_account_id: { in: loanTakenAccountIds },
          form: 'PAYMENT_CHARGE'
        },
        _sum: {
          total_amount: true
        }
      });

      for (const row of chargeGrouped) {
        if (!row.primary_account_id) continue;
        const sumVal = row._sum?.total_amount
          ? new Prisma.Decimal(row._sum.total_amount.toString())
          : zero;
        creditChargeMap.set(row.primary_account_id, sumVal);
      }
    }

    // Compute cash-funded repayments targeting LOAN_TAKEN accounts (CASH -> LOAN_TAKEN) (BR-07, WP-05)
    if (typeof prisma.allocationLine?.groupBy === 'function' && loanTakenAccountIds.length > 0) {
      const repayGrouped = await prisma.allocationLine.groupBy({
        by: ['target_account_id'],
        where: {
          target_account_id: { in: loanTakenAccountIds },
          target_account: {
            type: 'LOAN_TAKEN',
            user_id: userId
          },
          transaction: {
            user_id: userId,
            form: 'PAYMENT_CHARGE',
            primary_account: {
              type: 'CASH',
              user_id: userId
            }
          }
        },
        _sum: {
          amount: true
        }
      });

      for (const row of repayGrouped) {
        if (!row.target_account_id) continue;
        const sumVal = row._sum?.amount
          ? new Prisma.Decimal(row._sum.amount.toString())
          : zero;
        creditRepaymentMap.set(row.target_account_id, sumVal);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        accounts: accounts.map((acc) => {
          const openingDecimal = new Prisma.Decimal(acc.opening_balance.toString());
          let currentBalanceDecimal = openingDecimal;
          if (acc.type === 'CASH') {
            const received = receiveMap.get(acc.id) || zero;
            const paid = paymentMap.get(acc.id) || zero;
            currentBalanceDecimal = openingDecimal.add(received).sub(paid);
          } else if (acc.type === 'LOAN_TAKEN') {
            const charges = creditChargeMap.get(acc.id) || zero;
            const repayments = creditRepaymentMap.get(acc.id) || zero;
            currentBalanceDecimal = openingDecimal.add(charges).sub(repayments);
          }
          return {
            id: acc.id,
            user_id: acc.user_id,
            name: acc.name,
            type: acc.type,
            opening_balance: Number(openingDecimal.toFixed(2)),
            current_balance: Number(currentBalanceDecimal.toFixed(2)),
            is_opening_locked: acc.is_opening_locked,
            created_at: acc.created_at.toISOString(),
            updated_at: acc.updated_at.toISOString()
          };
        })
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

    const zero = new Prisma.Decimal('0.00');
    const openingDecimal = new Prisma.Decimal(account.opening_balance.toString());
    let currentBalanceDecimal = openingDecimal;

    if (account.type === 'CASH' && typeof prisma.transaction?.aggregate === 'function') {
      const receiveAgg = await prisma.transaction.aggregate({
        where: {
          user_id: userId,
          primary_account_id: account.id,
          form: 'RECEIVE_MONEY'
        },
        _sum: { total_amount: true }
      });
      const paymentAgg = await prisma.transaction.aggregate({
        where: {
          user_id: userId,
          primary_account_id: account.id,
          form: 'PAYMENT_CHARGE'
        },
        _sum: { total_amount: true }
      });

      const received = receiveAgg._sum?.total_amount
        ? new Prisma.Decimal(receiveAgg._sum.total_amount.toString())
        : zero;
      const paid = paymentAgg._sum?.total_amount
        ? new Prisma.Decimal(paymentAgg._sum.total_amount.toString())
        : zero;
      currentBalanceDecimal = openingDecimal.add(received).sub(paid);
    } else if (account.type === 'LOAN_TAKEN') {
      let charges = zero;
      let repayments = zero;
      if (typeof prisma.transaction?.aggregate === 'function') {
        const chargeAgg = await prisma.transaction.aggregate({
          where: {
            user_id: userId,
            primary_account_id: account.id,
            form: 'PAYMENT_CHARGE'
          },
          _sum: { total_amount: true }
        });
        if (chargeAgg._sum?.total_amount) {
          charges = new Prisma.Decimal(chargeAgg._sum.total_amount.toString());
        }
      }
      if (typeof prisma.allocationLine?.aggregate === 'function') {
        const repaymentAgg = await prisma.allocationLine.aggregate({
          where: {
            target_account_id: account.id,
            target_account: {
              type: 'LOAN_TAKEN',
              user_id: userId
            },
            transaction: {
              user_id: userId,
              form: 'PAYMENT_CHARGE',
              primary_account: {
                type: 'CASH',
                user_id: userId
              }
            }
          },
          _sum: { amount: true }
        });
        if (repaymentAgg._sum?.amount) {
          repayments = new Prisma.Decimal(repaymentAgg._sum.amount.toString());
        }
      }
      currentBalanceDecimal = openingDecimal.add(charges).sub(repayments);
    }

    res.status(200).json({
      success: true,
      data: {
        account: {
          id: account.id,
          user_id: account.user_id,
          name: account.name,
          type: account.type,
          opening_balance: Number(openingDecimal.toFixed(2)),
          current_balance: Number(currentBalanceDecimal.toFixed(2)),
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

      // Account still exists and is unlocked, but updateMany affected 0 rows (unexpected update conflict)
      res.status(409).json({
        success: false,
        error: {
          code: 'CONCURRENT_UPDATE_CONFLICT',
          message: 'Account update conflicted with a concurrent operation. Please retry.',
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
          current_balance: Number(updatedAccount!.opening_balance),
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
