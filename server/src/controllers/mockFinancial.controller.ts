import { Request, Response } from 'express';

// In-memory mock store for security/tenancy boundary testing in Issue #1
export const testAccounts: Record<string, { id: string; userId: string; name: string }> = {
  'acc-user-a': { id: 'acc-user-a', userId: 'user-a-uuid', name: 'User A Checking' },
  'acc-user-b': { id: 'acc-user-b', userId: 'user-b-uuid', name: 'User B Checking' }
};

export function getAccountById(req: Request, res: Response): void {
  const accountId = req.params.id;
  const account = testAccounts[accountId];

  // Tenancy isolation (BR-01): conceal existence of foreign account
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
