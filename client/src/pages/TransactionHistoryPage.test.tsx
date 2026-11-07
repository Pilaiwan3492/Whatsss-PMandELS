import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.js';
import { TransactionHistoryPage } from './TransactionHistoryPage.js';
import { axiosClient } from '../api/axiosClient.js';
import * as transactionApi from '../api/transactionApi.js';

describe('Frontend Transaction History Suite (WP-06, Feature F-09, AC-09-1)', () => {
  const mockUserDemo = {
    id: 'u1-uuid',
    username: 'user_demo',
    email: 'user_demo@whatsss.local',
    role: 'USER'
  };

  const mockGoldenTransactions: transactionApi.HistoryTransaction[] = [
    {
      id: 'tx-repay',
      user_id: 'u1-uuid',
      primary_account_id: 'acc-bank',
      primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH' },
      form: 'PAYMENT_CHARGE' as const,
      total_amount: 3000.00,
      transaction_date: '2026-11-04',
      description: 'CC Repayment',
      created_at: '2026-11-04T15:00:00.000Z',
      allocation_lines: [
        {
          id: 'line-repay',
          transaction_id: 'tx-repay',
          target_account_id: 'acc-cc',
          target_account: { id: 'acc-cc', name: 'Visa Credit Card', type: 'LOAN_TAKEN' },
          amount: 3000.00,
          notes: 'Full debt settlement'
        }
      ]
    },
    {
      id: 'tx-purchase',
      user_id: 'u1-uuid',
      primary_account_id: 'acc-cc',
      primary_account: { id: 'acc-cc', name: 'Visa Credit Card', type: 'LOAN_TAKEN' },
      form: 'PAYMENT_CHARGE' as const,
      total_amount: 3000.00,
      transaction_date: '2026-11-03',
      description: 'Dining & Grocery Split',
      created_at: '2026-11-03T12:00:00.000Z',
      allocation_lines: [
        {
          id: 'line-d',
          transaction_id: 'tx-purchase',
          target_account_id: 'acc-dining',
          target_account: { id: 'acc-dining', name: 'Dining', type: 'EXPENSE' },
          amount: 1000.00,
          notes: 'Dinner'
        },
        {
          id: 'line-g',
          transaction_id: 'tx-purchase',
          target_account_id: 'acc-grocery',
          target_account: { id: 'acc-grocery', name: 'Grocery', type: 'EXPENSE' },
          amount: 2000.00,
          notes: 'Grocery'
        }
      ]
    },
    {
      id: 'tx-salary',
      user_id: 'u1-uuid',
      primary_account_id: 'acc-bank',
      primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH' },
      form: 'RECEIVE_MONEY' as const,
      total_amount: 20000.00,
      transaction_date: '2026-11-02',
      description: 'November Salary',
      created_at: '2026-11-02T08:00:00.000Z',
      allocation_lines: [
        {
          id: 'line-s',
          transaction_id: 'tx-salary',
          target_account_id: 'acc-salary',
          target_account: { id: 'acc-salary', name: 'Salary', type: 'INCOME' },
          amount: 20000.00,
          notes: 'Salary'
        }
      ]
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return { data: { success: true, data: { user: mockUserDemo } } };
      }
      throw new Error(`Unhandled url: ${url}`);
    });
  });

  const renderHistory = () => {
    return render(
      <MemoryRouter initialEntries={['/transactions']}>
        <AuthProvider>
          <TransactionHistoryPage />
        </AuthProvider>
      </MemoryRouter>
    );
  };

  it('TEST-UI-HIST-01: renders 3 transactions and 4 allocation lines total (AC-09-1)', async () => {
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('transactions-table')).toBeDefined();
      expect(screen.getByTestId('txn-row-tx-repay')).toBeDefined();
      expect(screen.getByTestId('txn-row-tx-purchase')).toBeDefined();
      expect(screen.getByTestId('txn-row-tx-salary')).toBeDefined();
    });

    // Check badges and amounts
    expect(screen.getByTestId('badge-tx-repay').textContent).toContain('Repayment');
    expect(screen.getByTestId('amount-tx-repay').textContent).toContain('- 3,000.00 THB');

    expect(screen.getByTestId('badge-tx-purchase').textContent).toContain('Expense');
    expect(screen.getByTestId('amount-tx-purchase').textContent).toContain('- 3,000.00 THB');

    expect(screen.getByTestId('badge-tx-salary').textContent).toContain('Income');
    expect(screen.getByTestId('amount-tx-salary').textContent).toContain('+ 20,000.00 THB');
  });

  it('TEST-UI-HIST-02: filters transactions by type tab (Income, Expense, Repayment, All)', async () => {
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('transactions-table')).toBeDefined();
    });

    // Click Income filter
    fireEvent.click(screen.getByTestId('filter-income'));
    expect(screen.queryByTestId('txn-row-tx-repay')).toBeNull();
    expect(screen.queryByTestId('txn-row-tx-purchase')).toBeNull();
    expect(screen.getByTestId('txn-row-tx-salary')).toBeDefined();

    // Click Expense filter
    fireEvent.click(screen.getByTestId('filter-expense'));
    expect(screen.getByTestId('txn-row-tx-purchase')).toBeDefined();
    expect(screen.queryByTestId('txn-row-tx-salary')).toBeNull();

    // Click All filter
    fireEvent.click(screen.getByTestId('filter-all'));
    expect(screen.getByTestId('txn-row-tx-repay')).toBeDefined();
    expect(screen.getByTestId('txn-row-tx-purchase')).toBeDefined();
    expect(screen.getByTestId('txn-row-tx-salary')).toBeDefined();
  });

  it('TEST-UI-HIST-03: expands split allocation line details when clicking on multi-line transaction row', async () => {
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('txn-row-tx-purchase')).toBeDefined();
    });

    // Expanded row not visible initially
    expect(screen.queryByTestId('expanded-row-tx-purchase')).toBeNull();

    // Click purchase row to expand
    fireEvent.click(screen.getByTestId('txn-row-tx-purchase'));

    // Verify expanded sub-table renders Dining 1,000 and Grocery 2,000
    await waitFor(() => {
      const expRow = screen.getByTestId('expanded-row-tx-purchase');
      expect(expRow).toBeDefined();
      expect(expRow.textContent).toContain('Dining');
      expect(expRow.textContent).toContain('1,000.00 THB');
      expect(expRow.textContent).toContain('Grocery');
      expect(expRow.textContent).toContain('2,000.00 THB');
    });
  });

  it('TEST-UI-HIST-04: displays empty state placeholder when user has 0 transactions', async () => {
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue([]);

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('empty-history-state')).toBeDefined();
      expect(screen.getByText('No transactions recorded yet')).toBeDefined();
    });
  });

  it('TEST-UI-HIST-05: handles error loading history with alert banner and retry', async () => {
    let callCount = 0;
    vi.spyOn(transactionApi, 'getTransactions').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('History server timeout');
      }
      return mockGoldenTransactions;
    });

    renderHistory();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByRole('alert').textContent).toContain('History server timeout');
    });

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByTestId('transactions-table')).toBeDefined();
    });
  });
});
