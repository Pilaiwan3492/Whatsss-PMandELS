import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';

export const MAX_OPENING_BALANCE = new Prisma.Decimal('9999999999.99');

export const ALLOWED_ACCOUNT_TYPES = ['CASH', 'LOAN_TAKEN', 'LOAN_GIVEN', 'INCOME', 'EXPENSE'] as const;
export type AllowedAccountType = (typeof ALLOWED_ACCOUNT_TYPES)[number];

export const ALLOWED_ACCOUNT_SUBTYPES = ['DEFAULT', 'CREDIT_CARD', 'GENERAL_LOAN'] as const;
export type AllowedAccountSubtype = (typeof ALLOWED_ACCOUNT_SUBTYPES)[number];

/**
 * Normalizes an account name consistently across all layers (F-10, AC-10-1, AC-10-2):
 * - displayName: trims leading/trailing whitespace and collapses internal whitespace runs to a single space.
 * - normalizedName: lowercased displayName for case-insensitive uniqueness comparisons.
 */
export function normalizeAccountName(rawName: string): {
  displayName: string;
  normalizedName: string;
} {
  const displayName = rawName.trim().replace(/\s+/g, ' ');
  return {
    displayName,
    normalizedName: displayName.toLowerCase()
  };
}

/**
 * Validates opening balance using Decimal-aware precision and range checks.
 * In accordance with F-03, F-10, FR-05, FR-12, and AC-03-2:
 * - Must be a finite number type or valid decimal string without exponent notation.
 * - Must be non-negative (>= 0.00).
 * - Maximum precision allowed is 2 decimal places.
 * - Maximum value allowed is 9,999,999,999.99 (DECIMAL(12, 2)).
 * - Never silently rounds an invalid amount.
 */
export function validateOpeningBalanceDecimal(
  val: unknown,
  allowString: boolean = false
): {
  isValid: boolean;
  decimal?: Prisma.Decimal;
  error?: string;
} {
  let str: string;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      return { isValid: false, error: 'Opening balance must be a valid finite number.' };
    }
    if (val < 0) {
      return { isValid: false, error: 'Opening balance cannot be negative.' };
    }
    str = val.toString();
  } else if (allowString && typeof val === 'string') {
    str = val.trim();
    if (str.length === 0) {
      return { isValid: false, error: 'Opening balance must be a valid finite number.' };
    }
  } else {
    return { isValid: false, error: 'Opening balance must be a valid finite number.' };
  }

  if (allowString && typeof val === 'string' && /[eE]/.test(str)) {
    return { isValid: false, error: 'Exponent notation is not allowed for opening balance.' };
  }

  if (allowString && typeof val === 'string' && !/^\d+(\.\d+)?$/.test(str)) {
    return { isValid: false, error: 'Opening balance must be a non-negative decimal.' };
  }

  try {
    const decimal = new Prisma.Decimal(str);

    if (decimal.isNegative()) {
      return { isValid: false, error: 'Opening balance cannot be negative.' };
    }

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
    const incomingTransferMap = new Map<string, Prisma.Decimal>();
    const loanTakenAccountIds = accounts.filter((a) => a.type === 'LOAN_TAKEN').map((a) => a.id);
    const creditChargeMap = new Map<string, Prisma.Decimal>();
    const creditRepaymentMap = new Map<string, Prisma.Decimal>();
    const loanBorrowingMap = new Map<string, Prisma.Decimal>();
    const loanGivenAccountIds = accounts.filter((a) => a.type === 'LOAN_GIVEN').map((a) => a.id);
    const loanGivenDisbursementMap = new Map<string, Prisma.Decimal>();
    const loanGivenRecoveryMap = new Map<string, Prisma.Decimal>();

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

    // Compute incoming internal cash transfers (PAYMENT_CHARGE from CASH targeting CASH) (F-11, FR-13)
    if (typeof prisma.allocationLine?.groupBy === 'function' && cashAccountIds.length > 0) {
      const transferGrouped = await prisma.allocationLine.groupBy({
        by: ['target_account_id'],
        where: {
          target_account_id: { in: cashAccountIds },
          target_account: {
            type: 'CASH',
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

      for (const row of transferGrouped) {
        if (!row.target_account_id) continue;
        const sumVal = row._sum?.amount
          ? new Prisma.Decimal(row._sum.amount.toString())
          : zero;
        incomingTransferMap.set(row.target_account_id, sumVal);
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

    // Compute cash-funded repayments targeting LOAN_TAKEN accounts (CASH -> LOAN_TAKEN) (BR-07, WP-05, F-13)
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

      // Compute general loan borrowings (RECEIVE_MONEY on CASH targeting LOAN_TAKEN) (F-13)
      const borrowGrouped = await prisma.allocationLine.groupBy({
        by: ['target_account_id'],
        where: {
          target_account_id: { in: loanTakenAccountIds },
          target_account: {
            type: 'LOAN_TAKEN',
            user_id: userId
          },
          transaction: {
            user_id: userId,
            form: 'RECEIVE_MONEY',
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

      for (const row of borrowGrouped) {
        if (!row.target_account_id) continue;
        const sumVal = row._sum?.amount
          ? new Prisma.Decimal(row._sum.amount.toString())
          : zero;
        loanBorrowingMap.set(row.target_account_id, sumVal);
      }
    }

    // Compute LOAN_GIVEN receivable balances (disbursements minus recoveries) (F-12)
    if (typeof prisma.allocationLine?.groupBy === 'function' && loanGivenAccountIds.length > 0) {
      const disburseGrouped = await prisma.allocationLine.groupBy({
        by: ['target_account_id'],
        where: {
          target_account_id: { in: loanGivenAccountIds },
          target_account: {
            type: 'LOAN_GIVEN',
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
      for (const row of disburseGrouped) {
        if (!row.target_account_id) continue;
        const sumVal = row._sum?.amount
          ? new Prisma.Decimal(row._sum.amount.toString())
          : zero;
        loanGivenDisbursementMap.set(row.target_account_id, sumVal);
      }

      const recoverGrouped = await prisma.allocationLine.groupBy({
        by: ['target_account_id'],
        where: {
          target_account_id: { in: loanGivenAccountIds },
          target_account: {
            type: 'LOAN_GIVEN',
            user_id: userId
          },
          transaction: {
            user_id: userId,
            form: 'RECEIVE_MONEY',
            primary_account: {
              type: 'CASH',
              user_id: userId
            }
          }
        },
        _sum: { amount: true }
      });
      for (const row of recoverGrouped) {
        if (!row.target_account_id) continue;
        const sumVal = row._sum?.amount
          ? new Prisma.Decimal(row._sum.amount.toString())
          : zero;
        loanGivenRecoveryMap.set(row.target_account_id, sumVal);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        accounts: accounts.map((acc: any) => {
          const openingDecimal = new Prisma.Decimal(acc.opening_balance.toString());
          let currentBalanceDecimal = openingDecimal;
          if (acc.type === 'CASH') {
            const received = receiveMap.get(acc.id) || zero;
            const incomingTransfer = incomingTransferMap.get(acc.id) || zero;
            const paid = paymentMap.get(acc.id) || zero;
            currentBalanceDecimal = openingDecimal.add(received).add(incomingTransfer).sub(paid);
          } else if (acc.type === 'LOAN_TAKEN') {
            const charges = creditChargeMap.get(acc.id) || zero;
            const borrowings = loanBorrowingMap.get(acc.id) || zero;
            const repayments = creditRepaymentMap.get(acc.id) || zero;
            currentBalanceDecimal = openingDecimal.add(charges).add(borrowings).sub(repayments);
          } else if (acc.type === 'LOAN_GIVEN') {
            const disbursed = loanGivenDisbursementMap.get(acc.id) || zero;
            const recovered = loanGivenRecoveryMap.get(acc.id) || zero;
            currentBalanceDecimal = openingDecimal.add(disbursed).sub(recovered);
          }
          const resolvedSubtype =
            acc.subtype || (acc.type === 'LOAN_TAKEN' ? 'CREDIT_CARD' : 'DEFAULT');
          return {
            id: acc.id,
            user_id: acc.user_id,
            name: acc.name,
            normalized_name:
              acc.normalized_name || normalizeAccountName(acc.name).normalizedName,
            type: acc.type,
            subtype: resolvedSubtype,
            opening_balance: Number(openingDecimal.toFixed(2)),
            current_balance: Number(currentBalanceDecimal.toFixed(2)),
            is_opening_locked: acc.is_opening_locked,
            is_archived: Boolean(acc.is_archived),
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
    const currentBalanceDecimal = await computeSingleAccountCurrentBalanceDecimal(
      userId,
      account.id,
      account.type,
      openingDecimal
    );

    const accAny = account as any;
    const resolvedSubtype =
      accAny.subtype || (account.type === 'LOAN_TAKEN' ? 'CREDIT_CARD' : 'DEFAULT');

    res.status(200).json({
      success: true,
      data: {
        account: {
          id: account.id,
          user_id: account.user_id,
          name: account.name,
          normalized_name:
            accAny.normalized_name || normalizeAccountName(account.name).normalizedName,
          type: account.type,
          subtype: resolvedSubtype,
          opening_balance: Number(openingDecimal.toFixed(2)),
          current_balance: Number(currentBalanceDecimal.toFixed(2)),
          is_opening_locked: account.is_opening_locked,
          is_archived: Boolean(accAny.is_archived),
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
 * Computes the authoritative current_balance of a single account using exact Prisma.Decimal arithmetic,
 * matching the exact formulas used in getAccounts():
 * - CASH: opening_balance + sum(RECEIVE_MONEY) + sum(incoming CASH -> CASH transfer allocations) - sum(PAYMENT_CHARGE)
 * - LOAN_TAKEN: opening_balance + sum(PAYMENT_CHARGE on LOAN_TAKEN) + sum(RECEIVE_MONEY on CASH targeting LOAN_TAKEN) - sum(PAYMENT_CHARGE on CASH targeting LOAN_TAKEN)
 * - LOAN_GIVEN: opening_balance + sum(PAYMENT_CHARGE on CASH targeting LOAN_GIVEN) - sum(RECEIVE_MONEY on CASH targeting LOAN_GIVEN)
 * - INCOME / EXPENSE: opening_balance (0.00)
 */
export async function computeSingleAccountCurrentBalanceDecimal(
  userId: string,
  accountId: string,
  accountType: string,
  openingDecimal: Prisma.Decimal
): Promise<Prisma.Decimal> {
  const zero = new Prisma.Decimal('0.00');
  let currentBalanceDecimal = openingDecimal;

  if (accountType === 'CASH' && typeof prisma.transaction?.aggregate === 'function') {
    const receiveAgg = await prisma.transaction.aggregate({
      where: {
        user_id: userId,
        primary_account_id: accountId,
        form: 'RECEIVE_MONEY'
      },
      _sum: { total_amount: true }
    });
    const paymentAgg = await prisma.transaction.aggregate({
      where: {
        user_id: userId,
        primary_account_id: accountId,
        form: 'PAYMENT_CHARGE'
      },
      _sum: { total_amount: true }
    });

    let incomingTransfer = zero;
    if (typeof prisma.allocationLine?.aggregate === 'function') {
      const transferAgg = await prisma.allocationLine.aggregate({
        where: {
          target_account_id: accountId,
          target_account: {
            type: 'CASH',
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
      if (transferAgg._sum?.amount) {
        incomingTransfer = new Prisma.Decimal(transferAgg._sum.amount.toString());
      }
    }

    const received = receiveAgg._sum?.total_amount
      ? new Prisma.Decimal(receiveAgg._sum.total_amount.toString())
      : zero;
    const paid = paymentAgg._sum?.total_amount
      ? new Prisma.Decimal(paymentAgg._sum.total_amount.toString())
      : zero;
    currentBalanceDecimal = openingDecimal.add(received).add(incomingTransfer).sub(paid);
  } else if (accountType === 'LOAN_TAKEN') {
    let charges = zero;
    let borrowings = zero;
    let repayments = zero;
    if (typeof prisma.transaction?.aggregate === 'function') {
      const chargeAgg = await prisma.transaction.aggregate({
        where: {
          user_id: userId,
          primary_account_id: accountId,
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
          target_account_id: accountId,
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

      const borrowAgg = await prisma.allocationLine.aggregate({
        where: {
          target_account_id: accountId,
          target_account: {
            type: 'LOAN_TAKEN',
            user_id: userId
          },
          transaction: {
            user_id: userId,
            form: 'RECEIVE_MONEY',
            primary_account: {
              type: 'CASH',
              user_id: userId
            }
          }
        },
        _sum: { amount: true }
      });
      if (borrowAgg._sum?.amount) {
        borrowings = new Prisma.Decimal(borrowAgg._sum.amount.toString());
      }
    }
    currentBalanceDecimal = openingDecimal.add(charges).add(borrowings).sub(repayments);
  } else if (accountType === 'LOAN_GIVEN' && typeof prisma.allocationLine?.aggregate === 'function') {
    const disburseAgg = await prisma.allocationLine.aggregate({
      where: {
        target_account_id: accountId,
        target_account: { type: 'LOAN_GIVEN', user_id: userId },
        transaction: {
          user_id: userId,
          form: 'PAYMENT_CHARGE',
          primary_account: { type: 'CASH', user_id: userId }
        }
      },
      _sum: { amount: true }
    });
    const recoverAgg = await prisma.allocationLine.aggregate({
      where: {
        target_account_id: accountId,
        target_account: { type: 'LOAN_GIVEN', user_id: userId },
        transaction: {
          user_id: userId,
          form: 'RECEIVE_MONEY',
          primary_account: { type: 'CASH', user_id: userId }
        }
      },
      _sum: { amount: true }
    });
    const disbursed = disburseAgg._sum?.amount
      ? new Prisma.Decimal(disburseAgg._sum.amount.toString())
      : zero;
    const recovered = recoverAgg._sum?.amount
      ? new Prisma.Decimal(recoverAgg._sum.amount.toString())
      : zero;
    currentBalanceDecimal = openingDecimal.add(disbursed).sub(recovered);
  }

  return currentBalanceDecimal;
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
          normalized_name:
            (updatedAccount as any)!.normalized_name ||
            normalizeAccountName(updatedAccount!.name).normalizedName,
          type: updatedAccount!.type,
          subtype:
            (updatedAccount as any)!.subtype ||
            (updatedAccount!.type === 'LOAN_TAKEN' ? 'CREDIT_CARD' : 'DEFAULT'),
          opening_balance: Number(updatedAccount!.opening_balance),
          current_balance: Number(updatedAccount!.opening_balance),
          is_opening_locked: updatedAccount!.is_opening_locked,
          is_archived: Boolean((updatedAccount as any)!.is_archived),
          created_at: updatedAccount!.created_at.toISOString(),
          updated_at: updatedAccount!.updated_at.toISOString()
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/accounts
 * Creates a custom financial account across all 5 account types (F-10, FR-12, AC-10-1, AC-10-2).
 * Enforces canonical name normalization, case-insensitive uniqueness per tenant, subtype validation,
 * and non-negative opening balance rules.
 */
export async function createAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required', details: [] }
      });
      return;
    }

    const { name, type, subtype, opening_balance } = req.body ?? {};

    // 1. Validate name
    if (typeof name !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ACCOUNT_NAME',
          message: 'Account name is required and must be between 1 and 100 characters.',
          details: []
        }
      });
      return;
    }

    const { displayName, normalizedName } = normalizeAccountName(name);
    if (displayName.length < 1 || displayName.length > 100) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ACCOUNT_NAME',
          message: 'Account name must be between 1 and 100 characters after normalization.',
          details: []
        }
      });
      return;
    }

    // 2. Validate type
    if (
      typeof type !== 'string' ||
      !ALLOWED_ACCOUNT_TYPES.includes(type as AllowedAccountType)
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ACCOUNT_TYPE',
          message: 'Account type must be one of CASH, LOAN_TAKEN, LOAN_GIVEN, INCOME, or EXPENSE.',
          details: []
        }
      });
      return;
    }

    const validType = type as AllowedAccountType;

    // 3. Validate subtype
    let resolvedSubtype: AllowedAccountSubtype;
    if (validType === 'LOAN_TAKEN') {
      if (subtype === undefined || subtype === null || subtype === '') {
        resolvedSubtype = 'GENERAL_LOAN';
      } else if (subtype === 'CREDIT_CARD' || subtype === 'GENERAL_LOAN') {
        resolvedSubtype = subtype;
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ACCOUNT_SUBTYPE',
            message: 'Subtype for LOAN_TAKEN accounts must be CREDIT_CARD or GENERAL_LOAN.',
            details: []
          }
        });
        return;
      }
    } else {
      if (subtype === undefined || subtype === null || subtype === '' || subtype === 'DEFAULT') {
        resolvedSubtype = 'DEFAULT';
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ACCOUNT_SUBTYPE',
            message: `Subtype "${String(subtype)}" is not allowed for ${validType} accounts (must be DEFAULT or omitted).`,
            details: []
          }
        });
        return;
      }
    }

    // 4. Validate opening_balance
    let openingDecimal = new Prisma.Decimal('0.00');
    if (opening_balance !== undefined && opening_balance !== null && opening_balance !== '') {
      const validation = validateOpeningBalanceDecimal(opening_balance, true);
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
      if (
        (validType === 'INCOME' || validType === 'EXPENSE') &&
        !validation.decimal.isZero()
      ) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_OPENING_BALANCE',
            message: 'Opening balance for INCOME and EXPENSE category accounts must be 0.00.',
            details: []
          }
        });
        return;
      }
      openingDecimal = validation.decimal;
    }

    // 5. Check case-insensitive / whitespace-normalized name uniqueness for this tenant (AC-10-2)
    const existingAccounts = await prisma.account.findMany({
      where: { user_id: userId }
    });
    const duplicate = existingAccounts.find((a: any) => {
      const existingNorm =
        a.normalized_name || normalizeAccountName(a.name).normalizedName;
      return existingNorm === normalizedName;
    });

    if (duplicate) {
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_ACCOUNT_NAME',
          message: `An account named "${displayName}" already exists.`,
          details: []
        }
      });
      return;
    }

    // 6. Create account and deterministically map DB unique constraint violation (P2002) to 409 DUPLICATE_ACCOUNT_NAME
    let created: any;
    try {
      created = await prisma.account.create({
        data: {
          user_id: userId,
          name: displayName,
          normalized_name: normalizedName,
          type: validType,
          subtype: resolvedSubtype,
          opening_balance: openingDecimal,
          is_opening_locked: false,
          is_archived: false
        }
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_ACCOUNT_NAME',
            message: `An account named "${displayName}" already exists.`,
            details: []
          }
        });
        return;
      }
      throw err;
    }

    const createdOpening = new Prisma.Decimal(created.opening_balance.toString());

    res.status(201).json({
      success: true,
      data: {
        account: {
          id: created.id,
          user_id: created.user_id,
          name: created.name,
          normalized_name: created.normalized_name || normalizedName,
          type: created.type,
          subtype: created.subtype || resolvedSubtype,
          opening_balance: Number(createdOpening.toFixed(2)),
          current_balance: Number(createdOpening.toFixed(2)),
          is_opening_locked: Boolean(created.is_opening_locked),
          is_archived: Boolean(created.is_archived),
          created_at:
            created.created_at instanceof Date
              ? created.created_at.toISOString()
              : String(created.created_at),
          updated_at:
            created.updated_at instanceof Date
              ? created.updated_at.toISOString()
              : String(created.updated_at)
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/accounts/:id
 * Renames an account owned by the authenticated tenant (F-10, FR-12, AC-10-2, AC-10-3).
 * Enforces tenant isolation (404 NOT_FOUND), canonical name normalization, and case-insensitive uniqueness (409 DUPLICATE_ACCOUNT_NAME).
 */
export async function updateAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const { name } = req.body ?? {};
    if (typeof name !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ACCOUNT_NAME',
          message: 'Account name is required and must be between 1 and 100 characters.',
          details: []
        }
      });
      return;
    }

    const { displayName, normalizedName } = normalizeAccountName(name);
    if (displayName.length < 1 || displayName.length > 100) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ACCOUNT_NAME',
          message: 'Account name must be between 1 and 100 characters after normalization.',
          details: []
        }
      });
      return;
    }

    // 1. Verify existence & ownership (BR-01)
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

    // 2. Check duplicate normalized name among user's OTHER accounts
    const userAccounts = await prisma.account.findMany({
      where: { user_id: userId }
    });
    const duplicate = userAccounts.find((a: any) => {
      if (a.id === accountId) return false;
      const existingNorm =
        a.normalized_name || normalizeAccountName(a.name).normalizedName;
      return existingNorm === normalizedName;
    });

    if (duplicate) {
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_ACCOUNT_NAME',
          message: `An account named "${displayName}" already exists.`,
          details: []
        }
      });
      return;
    }

    // 3. Persist normalized name update and map P2002 to 409 DUPLICATE_ACCOUNT_NAME
    let updated: any;
    try {
      if (typeof prisma.account.update === 'function') {
        updated = await prisma.account.update({
          where: { id: accountId },
          data: {
            name: displayName,
            normalized_name: normalizedName,
            updated_at: new Date()
          }
        });
      } else {
        await prisma.account.updateMany({
          where: { id: accountId, user_id: userId },
          data: {
            name: displayName,
            normalized_name: normalizedName,
            updated_at: new Date()
          } as any
        });
        updated = await prisma.account.findFirst({
          where: { id: accountId, user_id: userId }
        });
      }
    } catch (err: any) {
      if (err?.code === 'P2002') {
        res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_ACCOUNT_NAME',
            message: `An account named "${displayName}" already exists.`,
            details: []
          }
        });
        return;
      }
      throw err;
    }

    const openingDecimal = new Prisma.Decimal(updated.opening_balance.toString());
    const currentBalanceDecimal = await computeSingleAccountCurrentBalanceDecimal(
      userId,
      updated.id,
      updated.type,
      openingDecimal
    );

    res.status(200).json({
      success: true,
      data: {
        account: {
          id: updated.id,
          user_id: updated.user_id,
          name: updated.name,
          normalized_name: updated.normalized_name || normalizedName,
          type: updated.type,
          subtype:
            updated.subtype ||
            (updated.type === 'LOAN_TAKEN' ? 'CREDIT_CARD' : 'DEFAULT'),
          opening_balance: Number(openingDecimal.toFixed(2)),
          current_balance: Number(currentBalanceDecimal.toFixed(2)),
          is_opening_locked: Boolean(updated.is_opening_locked),
          is_archived: Boolean(updated.is_archived),
          created_at:
            updated.created_at instanceof Date
              ? updated.created_at.toISOString()
              : String(updated.created_at),
          updated_at:
            updated.updated_at instanceof Date
              ? updated.updated_at.toISOString()
              : String(updated.updated_at)
        }
      }
    });
  } catch (err) {
    next(err);
  }
}
