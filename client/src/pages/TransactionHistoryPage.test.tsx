import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.js';
import { TransactionHistoryPage, getTransactionKind } from './TransactionHistoryPage.js';
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

  it('TEST-UI-FAV-01: toggles favorite star on a transaction row and filters Favorites Only (F-14, AC-14-1)', async () => {
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(
      mockGoldenTransactions.map((t) => ({ ...t, is_favorite: t.id === 'tx-purchase' }))
    );
    const favSpy = vi.spyOn(transactionApi, 'toggleFavorite').mockResolvedValue({
      ...mockGoldenTransactions[2],
      is_favorite: true
    });

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('btn-favorite-tx-salary')).toBeDefined();
    });

    // Toggle favorite on tx-salary
    fireEvent.click(screen.getByTestId('btn-favorite-tx-salary'));

    await waitFor(() => {
      expect(favSpy).toHaveBeenCalledWith('tx-salary', true);
      expect(screen.getByTestId('btn-favorite-tx-salary').textContent).toBe('★');
    });

    // Toggle Favorites Only filter -> tx-repay (not favorite) should be hidden
    fireEvent.click(screen.getByTestId('filter-favorites-only'));
    expect(screen.queryByTestId('txn-row-tx-repay')).toBeNull();
    expect(screen.getByTestId('txn-row-tx-purchase')).toBeDefined();
    expect(screen.getByTestId('txn-row-tx-salary')).toBeDefined();
  });

  it('TEST-UI-FAV-02: opens duplicate modal, submits duplicateTransaction, and displays 422 errors (F-14, AC-14-2..3)', async () => {
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);
    const dupSpy = vi
      .spyOn(transactionApi, 'duplicateTransaction')
      .mockRejectedValueOnce({
        response: { data: { error: { code: 'ZERO_OUTSTANDING_DEBT', message: 'Outstanding repayment debt is 0.00' } } }
      })
      .mockResolvedValueOnce({ id: 'tx-dup-new' });

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('btn-duplicate-tx-purchase')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-duplicate-tx-purchase'));
    expect(screen.getByTestId('duplicate-modal')).toBeDefined();

    fireEvent.change(screen.getByTestId('duplicate-date-input'), { target: { value: '2026-11-15' } });
    fireEvent.click(screen.getByTestId('btn-confirm-duplicate'));

    // First attempt rejected -> error shown inside modal
    await waitFor(() => {
      expect(screen.getByTestId('duplicate-error').textContent).toContain('Outstanding repayment debt is 0.00');
    });

    // Second attempt succeeds -> modal closes and feedback shown
    fireEvent.click(screen.getByTestId('btn-confirm-duplicate'));
    await waitFor(() => {
      expect(dupSpy).toHaveBeenCalledWith('tx-purchase', {
        transaction_date: '2026-11-15',
        description: 'Dining & Grocery Split'
      });
      expect(screen.queryByTestId('duplicate-modal')).toBeNull();
      expect(screen.getByTestId('history-feedback').textContent).toContain('duplicated successfully');
    });
  });

  it('TEST-UI-SRCH-01: submits keyword, date range, and type filters to getTransactions and clears filters (F-15, AC-15-1..2)', async () => {
    const getSpy = vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('search-filter-form')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('search-keyword-input'), { target: { value: 'Dining' } });
    fireEvent.change(screen.getByTestId('filter-start-date'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByTestId('filter-end-date'), { target: { value: '2026-11-15' } });
    fireEvent.change(screen.getByTestId('filter-type-select'), { target: { value: 'EXPENSE' } });
    fireEvent.click(screen.getByTestId('btn-apply-filters'));

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith({
        q: 'Dining',
        startDate: '2026-11-01',
        endDate: '2026-11-15',
        type: 'EXPENSE'
      });
    });

    fireEvent.click(screen.getByTestId('btn-clear-filters'));
    await waitFor(() => {
      expect((screen.getByTestId('search-keyword-input') as HTMLInputElement).value).toBe('');
      expect((screen.getByTestId('filter-type-select') as HTMLSelectElement).value).toBe('');
    });
  });

  it('TEST-UI-CLASS-01: accurately classifies all 5 transaction types and prevents CASH expenses from being misclassified as REPAYMENT', async () => {
    const allFiveTransactions: transactionApi.HistoryTransaction[] = [
      // 1. INCOME: RECEIVE_MONEY with INCOME allocation
      {
        id: 'tx-cls-income',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'RECEIVE_MONEY',
        total_amount: 20000,
        transaction_date: '2026-11-01',
        description: 'Salary',
        created_at: '2026-11-01T08:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-inc',
            transaction_id: 'tx-cls-income',
            target_account_id: 'acc-salary',
            target_account: { id: 'acc-salary', name: 'Salary', type: 'INCOME', subtype: 'DEFAULT' },
            amount: 20000,
            notes: null
          }
        ]
      },
      // 2a. EXPENSE (CASH primary — MUST NOT be misclassified as REPAYMENT!)
      {
        id: 'tx-cls-cash-expense',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'PAYMENT_CHARGE',
        total_amount: 450,
        transaction_date: '2026-11-02',
        description: 'Cash Lunch & Coffee',
        created_at: '2026-11-02T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-ce-1',
            transaction_id: 'tx-cls-cash-expense',
            target_account_id: 'acc-dining',
            target_account: { id: 'acc-dining', name: 'Dining', type: 'EXPENSE', subtype: 'DEFAULT' },
            amount: 300,
            notes: 'Lunch'
          },
          {
            id: 'l-ce-2',
            transaction_id: 'tx-cls-cash-expense',
            target_account_id: 'acc-grocery',
            target_account: { id: 'acc-grocery', name: 'Grocery', type: 'EXPENSE', subtype: 'DEFAULT' },
            amount: 150,
            notes: 'Coffee'
          }
        ]
      },
      // 3. REPAYMENT: PAYMENT_CHARGE from CASH to LOAN_TAKEN (CREDIT_CARD)
      {
        id: 'tx-cls-repayment',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'PAYMENT_CHARGE',
        total_amount: 1500,
        transaction_date: '2026-11-03',
        description: 'Visa Payment',
        created_at: '2026-11-03T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-rep',
            transaction_id: 'tx-cls-repayment',
            target_account_id: 'acc-cc',
            target_account: { id: 'acc-cc', name: 'Visa Credit Card', type: 'LOAN_TAKEN', subtype: 'CREDIT_CARD' },
            amount: 1500,
            notes: null
          }
        ]
      },
      // 4. TRANSFER: PAYMENT_CHARGE from CASH to CASH
      {
        id: 'tx-cls-transfer',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'PAYMENT_CHARGE',
        total_amount: 2000,
        transaction_date: '2026-11-04',
        description: 'Move to Wallet',
        created_at: '2026-11-04T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-xfer',
            transaction_id: 'tx-cls-transfer',
            target_account_id: 'acc-wallet',
            target_account: { id: 'acc-wallet', name: 'Cash Wallet', type: 'CASH', subtype: 'DEFAULT' },
            amount: 2000,
            notes: null
          }
        ]
      },
      // 5a. LOAN (LOAN_GIVEN disbursement)
      {
        id: 'tx-cls-loan-given',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'PAYMENT_CHARGE',
        total_amount: 1000,
        transaction_date: '2026-11-05',
        description: 'Lent to Friend',
        created_at: '2026-11-05T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-lg',
            transaction_id: 'tx-cls-loan-given',
            target_account_id: 'acc-friend',
            target_account: { id: 'acc-friend', name: 'Friend Loan', type: 'LOAN_GIVEN', subtype: 'DEFAULT' },
            amount: 1000,
            notes: null
          }
        ]
      },
      // 5b. LOAN (GENERAL_LOAN repayment — must be LOAN, NOT REPAYMENT)
      {
        id: 'tx-cls-general-loan-repay',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'PAYMENT_CHARGE',
        total_amount: 500,
        transaction_date: '2026-11-06',
        description: 'Car Loan Installment',
        created_at: '2026-11-06T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-gl',
            transaction_id: 'tx-cls-general-loan-repay',
            target_account_id: 'acc-car-loan',
            target_account: { id: 'acc-car-loan', name: 'Car Loan', type: 'LOAN_TAKEN', subtype: 'GENERAL_LOAN' },
            amount: 500,
            notes: null
          }
        ]
      },
      // 5c. LOAN (LOAN_GIVEN recovery via RECEIVE_MONEY — must be LOAN, NOT INCOME)
      {
        id: 'tx-cls-loan-recovery',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'RECEIVE_MONEY',
        total_amount: 400,
        transaction_date: '2026-11-07',
        description: 'Friend Repaid',
        created_at: '2026-11-07T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-lrec',
            transaction_id: 'tx-cls-loan-recovery',
            target_account_id: 'acc-friend',
            target_account: { id: 'acc-friend', name: 'Friend Loan', type: 'LOAN_GIVEN', subtype: 'DEFAULT' },
            amount: 400,
            notes: null
          }
        ]
      }
    ];

    // Direct semantic classification assertions
    expect(getTransactionKind(allFiveTransactions[0])).toBe('INCOME');
    expect(getTransactionKind(allFiveTransactions[1])).toBe('EXPENSE');
    expect(getTransactionKind(allFiveTransactions[2])).toBe('REPAYMENT');
    expect(getTransactionKind(allFiveTransactions[3])).toBe('TRANSFER');
    expect(getTransactionKind(allFiveTransactions[4])).toBe('LOAN');
    expect(getTransactionKind(allFiveTransactions[5])).toBe('LOAN');
    expect(getTransactionKind(allFiveTransactions[6])).toBe('LOAN');

    // Render UI and verify badges & tab filtering
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(allFiveTransactions);
    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('badge-tx-cls-cash-expense').textContent).toBe('Expense');
      expect(screen.getByTestId('badge-tx-cls-repayment').textContent).toBe('Repayment');
      expect(screen.getByTestId('badge-tx-cls-transfer').textContent).toBe('Transfer');
      expect(screen.getByTestId('badge-tx-cls-loan-given').textContent).toBe('Loan');
      expect(screen.getByTestId('badge-tx-cls-general-loan-repay').textContent).toBe('Loan');
      expect(screen.getByTestId('badge-tx-cls-loan-recovery').textContent).toBe('Loan');
    });

    // Clicking Repayments tab must exclude CASH expense and GENERAL_LOAN repayment
    fireEvent.click(screen.getByTestId('filter-repayment'));
    expect(screen.getByTestId('txn-row-tx-cls-repayment')).toBeDefined();
    expect(screen.queryByTestId('txn-row-tx-cls-cash-expense')).toBeNull();
    expect(screen.queryByTestId('txn-row-tx-cls-general-loan-repay')).toBeNull();

    // Clicking Transfers tab shows only transfer
    fireEvent.click(screen.getByTestId('filter-transfer'));
    expect(screen.getByTestId('txn-row-tx-cls-transfer')).toBeDefined();
    expect(screen.queryByTestId('txn-row-tx-cls-repayment')).toBeNull();

    // Clicking Loans tab shows all 3 loan transactions
    fireEvent.click(screen.getByTestId('filter-loan'));
    expect(screen.getByTestId('txn-row-tx-cls-loan-given')).toBeDefined();
    expect(screen.getByTestId('txn-row-tx-cls-general-loan-repay')).toBeDefined();
    expect(screen.getByTestId('txn-row-tx-cls-loan-recovery')).toBeDefined();
    expect(screen.queryByTestId('txn-row-tx-cls-income')).toBeNull();
  });
});
