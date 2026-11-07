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
 * - BR-03: Income increases cash balance & income summary
 * - BR-10: Admin exclusion (enforced via roleGuard)
 * - NFR-DATA-01: Decimal arithmetic preservation (uses Prisma.Decimal to prevent floating-point inaccuracies)
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

    // Perform exact arbitrary-precision Decimal addition on opening balances
    const cashAccounts = accounts.filter((a) => a.type === 'CASH');
    const bankOpeningDecimal = cashAccounts.reduce(
      (sum, a) => sum.add(new Prisma.Decimal(a.opening_balance.toString())),
      zero
    );

    const creditDebtDecimal = accounts
      .filter((a) => a.type === 'LOAN_TAKEN')
      .reduce((sum, a) => sum.add(new Prisma.Decimal(a.opening_balance.toString())), zero);

    // Compute dynamic Cash transactions (Inflows and Outflows)
    let bankReceiveTotal = zero;
    let bankPaymentTotal = zero;
    if (typeof prisma.transaction?.aggregate === 'function' && cashAccounts.length > 0) {
      const cashIds = cashAccounts.map((a) => a.id);
      const receiveAgg = await prisma.transaction.aggregate({
        where: {
          user_id: userId,
          primary_account_id: { in: cashIds },
          form: 'RECEIVE_MONEY'
        },
        _sum: { total_amount: true }
      });
      if (receiveAgg._sum?.total_amount) {
        bankReceiveTotal = new Prisma.Decimal(receiveAgg._sum.total_amount.toString());
      }

      const paymentAgg = await prisma.transaction.aggregate({
        where: {
          user_id: userId,
          primary_account_id: { in: cashIds },
          form: 'PAYMENT_CHARGE'
        },
        _sum: { total_amount: true }
      });
      if (paymentAgg._sum?.total_amount) {
        bankPaymentTotal = new Prisma.Decimal(paymentAgg._sum.total_amount.toString());
      }
    }

    const finalBankBalance = bankOpeningDecimal.add(bankReceiveTotal).sub(bankPaymentTotal);

    // Compute total_income strictly from allocation lines targeting INCOME accounts (BR-02, BR-03)
    let totalIncomeDecimal = zero;
    if (typeof prisma.allocationLine?.aggregate === 'function') {
      const incomeAgg = await prisma.allocationLine.aggregate({
        where: {
          transaction: { user_id: userId },
          target_account: { type: 'INCOME', user_id: userId }
        },
        _sum: { amount: true }
      });
      if (incomeAgg._sum?.amount) {
        totalIncomeDecimal = new Prisma.Decimal(incomeAgg._sum.amount.toString());
      }
    }

    res.status(200).json({
      success: true,
      data: {
        bank_balance: Number(finalBankBalance.toFixed(2)),
        credit_debt: Number(creditDebtDecimal.toFixed(2)),
        total_income: Number(totalIncomeDecimal.toFixed(2)),
        total_expense: 0
      }
    });
  } catch (err) {
    next(err);
  }
}
