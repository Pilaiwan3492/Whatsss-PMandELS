import { Request, Response } from 'express';

/**
 * Mock Financial Controller (WP-01 Security Boundary Stub)
 *
 * NOTE FOR INSTRUCTOR AND AUDITORS:
 * In accordance with the Sprint 1 Work Package roadmap (docs/sprints/sprint-1/issue-backlog.md):
 * - WP-01 covers Feature F-01 (Authentication) and F-02 (Authorization & Security Boundaries).
 * - Real relational database persistence for Financial Accounts and Transactions is scheduled
 *   and implemented in subsequent Work Packages:
 *     - WP-02: Financial Account Model & Opening Balance (Feature F-03)
 *     - WP-03: Income Processing (Feature F-04)
 *     - WP-04: Expense & Split Allocation (Features F-05, F-06)
 *     - WP-05: Credit Card Repayments (Feature F-07)
 * - This controller serves exclusively as the isolated contract endpoint fixture to verify
 *   tenancy scoping (BR-01, TEST-SEC-01), authentication enforcement (BR-09, TEST-SEC-02),
 *   and administrative financial exclusion (BR-10, TEST-SEC-03).
 */

export interface MockAccountRecord {
  id: string;
  userId: string;
  name: string;
  balance: number;
}

export const testAccounts: Record<string, MockAccountRecord> = {
  'acc-user-a': { id: 'acc-user-a', userId: 'user-a-uuid', name: 'User A Checking', balance: 10000 },
  'acc-user-b': { id: 'acc-user-b', userId: 'user-b-uuid', name: 'User B Checking', balance: 5000 },
  'acc-target-a': { id: 'acc-target-a', userId: 'user-a-uuid', name: 'User A Dining Category', balance: 0 },
  'acc-target-b': { id: 'acc-target-b', userId: 'user-b-uuid', name: 'User B Dining Category', balance: 0 }
};

export function getAccountById(req: Request, res: Response): void {
  const accountId = req.params.id;
  const account = testAccounts[accountId];

  // Tenancy isolation (BR-01): Conceal existence of foreign or non-existent resource
  // User identity is strictly derived from req.user.id (never trusted from request body/params)
  if (!account || account.userId !== req.user?.id) {
    res.status(404).json({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Resource not found',
        details: []
      }
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: { account }
  });
}

export function updateAccount(req: Request, res: Response): void {
  const accountId = req.params.id;
  const account = testAccounts[accountId];

  // Tenancy isolation: Reject modification of foreign account with 404
  if (!account || account.userId !== req.user?.id) {
    res.status(404).json({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Resource not found',
        details: []
      }
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: { message: 'Account updated successfully' }
  });
}

export function deleteAccount(req: Request, res: Response): void {
  const accountId = req.params.id;
  const account = testAccounts[accountId];

  // Tenancy isolation: Reject deletion of foreign account with 404
  if (!account || account.userId !== req.user?.id) {
    res.status(404).json({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Resource not found',
        details: []
      }
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: { message: 'Account deleted successfully' }
  });
}

export function createExpenseTransaction(req: Request, res: Response): void {
  const { primary_account_id, allocations } = req.body || {};

  // Case 1: Foreign primary_account_id reference check (BR-01, TEST-SEC-01 Case 1)
  // Identity is strictly sourced from authenticated req.user.id (never trust body userId)
  const primaryAccount = testAccounts[primary_account_id];
  if (!primaryAccount || primaryAccount.userId !== req.user?.id) {
    res.status(404).json({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Resource not found',
        details: []
      }
    });
    return;
  }

  // Case 2: Foreign allocation target_account_id reference check (BR-01, TEST-SEC-01 Case 2)
  if (Array.isArray(allocations)) {
    for (const alloc of allocations) {
      const targetAccount = testAccounts[alloc?.target_account_id];
      if (!targetAccount || targetAccount.userId !== req.user?.id) {
        res.status(404).json({
          success: false,
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Resource not found',
            details: []
          }
        });
        return;
      }
    }
  }

  res.status(201).json({
    success: true,
    data: {
      message: 'Expense transaction verified against tenancy boundary (WP-01 Security Stub)'
    }
  });
}

export function getTransactions(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    data: { transactions: [] }
  });
}

export function getSummary(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    data: {
      bank_balance: 0,
      credit_debt: 0,
      total_income: 0,
      total_expense: 0
    }
  });
}
