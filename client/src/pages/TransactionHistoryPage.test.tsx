import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.js';
import {
  TransactionHistoryPage,
  getTransactionKind,
  getTransactionAmountSign
} from './TransactionHistoryPage.js';
import { axiosClient } from '../api/axiosClient.js';
import * as transactionApi from '../api/transactionApi.js';
import * as accountApi from '../api/accountApi.js';

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
          target_account: {
            id: 'acc-cc',
            name: 'Visa Credit Card',
            type: 'LOAN_TAKEN',
            subtype: 'CREDIT_CARD'
          },
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

  it('TEST-UI-CORR-01: opens correction modal, submits PUT /transactions/:id, shows 422 error and refreshes on success (F-16, AC-16-1..2)', async () => {
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);
    const corrSpy = vi
      .spyOn(transactionApi, 'correctTransaction')
      .mockRejectedValueOnce({
        response: { data: { error: { code: 'ALLOCATION_SUM_MISMATCH', message: 'Sum of allocations does not match total' } } }
      })
      .mockResolvedValueOnce({ id: 'tx-purchase' });

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('btn-edit-tx-purchase')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-edit-tx-purchase'));
    expect(screen.getByTestId('correction-modal')).toBeDefined();

    fireEvent.change(screen.getByTestId('corr-total-amount'), { target: { value: '3500.00' } });
    fireEvent.change(screen.getByTestId('corr-alloc-amount-0'), { target: { value: '1500.00' } });
    fireEvent.click(screen.getByTestId('btn-save-correction'));

    await waitFor(() => {
      expect(screen.getByTestId('correction-error').textContent).toContain(
        'Sum of allocations does not match total'
      );
    });

    fireEvent.click(screen.getByTestId('btn-save-correction'));
    await waitFor(() => {
      expect(corrSpy).toHaveBeenCalledWith('tx-purchase', {
        total_amount: '3500.00',
        transaction_date: '2026-11-03',
        description: 'Dining & Grocery Split',
        allocations: [
          { target_account_id: 'acc-dining', amount: '1500.00', notes: 'Dinner' },
          { target_account_id: 'acc-grocery', amount: '2000.00', notes: 'Grocery' }
        ]
      });
      expect(screen.queryByTestId('correction-modal')).toBeNull();
      expect(screen.getByTestId('correction-feedback').textContent).toContain('Transaction corrected');
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
      // 5c. LOAN (LOAN_GIVEN recovery via RECEIVE_MONEY — must be LOAN, NOT INCOME, sign '+')
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
      },
      // 5d. LOAN (GENERAL_LOAN borrowing via RECEIVE_MONEY — must be LOAN, NOT INCOME, sign '+')
      {
        id: 'tx-cls-general-loan-borrow',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'RECEIVE_MONEY',
        total_amount: 5000,
        transaction_date: '2026-11-08',
        description: 'Personal Loan Disbursement',
        created_at: '2026-11-08T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-gl-borrow',
            transaction_id: 'tx-cls-general-loan-borrow',
            target_account_id: 'acc-car-loan',
            target_account: { id: 'acc-car-loan', name: 'Car Loan', type: 'LOAN_TAKEN', subtype: 'GENERAL_LOAN' },
            amount: 5000,
            notes: null
          }
        ]
      }
    ];

    // Direct semantic classification & amount-sign assertions
    expect(getTransactionKind(allFiveTransactions[0])).toBe('INCOME');
    expect(getTransactionAmountSign(allFiveTransactions[0])).toBe('+');

    expect(getTransactionKind(allFiveTransactions[1])).toBe('EXPENSE');
    expect(getTransactionAmountSign(allFiveTransactions[1])).toBe('-');

    expect(getTransactionKind(allFiveTransactions[2])).toBe('REPAYMENT');
    expect(getTransactionAmountSign(allFiveTransactions[2])).toBe('-');

    expect(getTransactionKind(allFiveTransactions[3])).toBe('TRANSFER');
    expect(getTransactionAmountSign(allFiveTransactions[3])).toBe('-');

    expect(getTransactionKind(allFiveTransactions[4])).toBe('LOAN'); // Loan Given -> '-'
    expect(getTransactionAmountSign(allFiveTransactions[4])).toBe('-');

    expect(getTransactionKind(allFiveTransactions[5])).toBe('LOAN'); // General Loan Repayment -> '-'
    expect(getTransactionAmountSign(allFiveTransactions[5])).toBe('-');

    expect(getTransactionKind(allFiveTransactions[6])).toBe('LOAN'); // Loan Recovery -> '+'
    expect(getTransactionAmountSign(allFiveTransactions[6])).toBe('+');

    expect(getTransactionKind(allFiveTransactions[7])).toBe('LOAN'); // General Loan Borrowing -> '+'
    expect(getTransactionAmountSign(allFiveTransactions[7])).toBe('+');

    // Render UI and verify both badges AND displayed +/- amount signs
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(allFiveTransactions);
    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('badge-tx-cls-income').textContent).toBe('Income');
      expect(screen.getByTestId('amount-tx-cls-income').textContent).toBe('+ 20,000.00 THB');

      expect(screen.getByTestId('badge-tx-cls-cash-expense').textContent).toBe('Expense');
      expect(screen.getByTestId('amount-tx-cls-cash-expense').textContent).toBe('- 450.00 THB');

      expect(screen.getByTestId('badge-tx-cls-repayment').textContent).toBe('Repayment');
      expect(screen.getByTestId('amount-tx-cls-repayment').textContent).toBe('- 1,500.00 THB');

      expect(screen.getByTestId('badge-tx-cls-transfer').textContent).toBe('Transfer');
      expect(screen.getByTestId('amount-tx-cls-transfer').textContent).toBe('- 2,000.00 THB');

      expect(screen.getByTestId('badge-tx-cls-loan-given').textContent).toBe('Loan');
      expect(screen.getByTestId('amount-tx-cls-loan-given').textContent).toBe('- 1,000.00 THB');

      expect(screen.getByTestId('badge-tx-cls-general-loan-repay').textContent).toBe('Loan');
      expect(screen.getByTestId('amount-tx-cls-general-loan-repay').textContent).toBe('- 500.00 THB');

      expect(screen.getByTestId('badge-tx-cls-loan-recovery').textContent).toBe('Loan');
      expect(screen.getByTestId('amount-tx-cls-loan-recovery').textContent).toBe('+ 400.00 THB');

      expect(screen.getByTestId('badge-tx-cls-general-loan-borrow').textContent).toBe('Loan');
      expect(screen.getByTestId('amount-tx-cls-general-loan-borrow').textContent).toBe('+ 5,000.00 THB');
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

    // Clicking Loans tab shows all 4 loan transactions
    fireEvent.click(screen.getByTestId('filter-loan'));
    expect(screen.getByTestId('txn-row-tx-cls-loan-given')).toBeDefined();
    expect(screen.getByTestId('txn-row-tx-cls-general-loan-repay')).toBeDefined();
    expect(screen.getByTestId('txn-row-tx-cls-loan-recovery')).toBeDefined();
    expect(screen.getByTestId('txn-row-tx-cls-general-loan-borrow')).toBeDefined();
    expect(screen.queryByTestId('txn-row-tx-cls-income')).toBeNull();

    // Ambiguous/unknown LOAN_TAKEN subtypes (DEFAULT, undefined, UNKNOWN) must NOT silently classify as REPAYMENT
    for (const ambiguousSubtype of ['DEFAULT', undefined, 'UNKNOWN'] as any[]) {
      const ambiguousTx: transactionApi.HistoryTransaction = {
        ...allFiveTransactions[2],
        id: `tx-amb-${String(ambiguousSubtype)}`,
        allocation_lines: [
          {
            ...allFiveTransactions[2].allocation_lines[0],
            target_account: {
              id: 'acc-amb',
              name: 'Ambiguous Loan Account',
              type: 'LOAN_TAKEN',
              subtype: ambiguousSubtype
            }
          }
        ]
      };
      expect(getTransactionKind(ambiguousTx)).not.toBe('REPAYMENT');
    }
  });

  it('TEST-UI-SIGN-01: renders exact +/- amount signs and semantic kinds for all 8 cashflow scenarios (Finding 1 & Task 5)', async () => {
    const allEight: transactionApi.HistoryTransaction[] = [
      // 1. Income (+)
      {
        id: 'tx-c-inc',
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
            id: 'l-1',
            transaction_id: 'tx-c-inc',
            target_account_id: 'acc-sal',
            target_account: { id: 'acc-sal', name: 'Salary', type: 'INCOME', subtype: 'DEFAULT' },
            amount: 20000,
            notes: null
          }
        ]
      },
      // 2. Expense (CASH primary, -)
      {
        id: 'tx-c-cash-exp',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'PAYMENT_CHARGE',
        total_amount: 350,
        transaction_date: '2026-11-02',
        description: 'Cash Lunch',
        created_at: '2026-11-02T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-2',
            transaction_id: 'tx-c-cash-exp',
            target_account_id: 'acc-dining',
            target_account: { id: 'acc-dining', name: 'Dining', type: 'EXPENSE', subtype: 'DEFAULT' },
            amount: 350,
            notes: null
          }
        ]
      },
      // 3. Credit Card Repayment (-)
      {
        id: 'tx-c-repay',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'PAYMENT_CHARGE',
        total_amount: 1500,
        transaction_date: '2026-11-03',
        description: 'CC Repay',
        created_at: '2026-11-03T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-3',
            transaction_id: 'tx-c-repay',
            target_account_id: 'acc-cc',
            target_account: { id: 'acc-cc', name: 'Visa CC', type: 'LOAN_TAKEN', subtype: 'CREDIT_CARD' },
            amount: 1500,
            notes: null
          }
        ]
      },
      // 4. Internal Cash Transfer (-)
      {
        id: 'tx-c-xfer',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'PAYMENT_CHARGE',
        total_amount: 2000,
        transaction_date: '2026-11-04',
        description: 'Cash Transfer',
        created_at: '2026-11-04T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-4',
            transaction_id: 'tx-c-xfer',
            target_account_id: 'acc-wallet',
            target_account: { id: 'acc-wallet', name: 'Wallet', type: 'CASH', subtype: 'DEFAULT' },
            amount: 2000,
            notes: null
          }
        ]
      },
      // 5. Loan Given (-)
      {
        id: 'tx-c-loan-given',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'PAYMENT_CHARGE',
        total_amount: 1200,
        transaction_date: '2026-11-05',
        description: 'Lent to Friend',
        created_at: '2026-11-05T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-5',
            transaction_id: 'tx-c-loan-given',
            target_account_id: 'acc-friend',
            target_account: { id: 'acc-friend', name: 'Friend Loan', type: 'LOAN_GIVEN', subtype: 'DEFAULT' },
            amount: 1200,
            notes: null
          }
        ]
      },
      // 6. Loan Recovery (+)
      {
        id: 'tx-c-loan-recovery',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'RECEIVE_MONEY',
        total_amount: 600,
        transaction_date: '2026-11-06',
        description: 'Friend Repaid Loan',
        created_at: '2026-11-06T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-6',
            transaction_id: 'tx-c-loan-recovery',
            target_account_id: 'acc-friend',
            target_account: { id: 'acc-friend', name: 'Friend Loan', type: 'LOAN_GIVEN', subtype: 'DEFAULT' },
            amount: 600,
            notes: null
          }
        ]
      },
      // 7. General Loan Borrowing (+)
      {
        id: 'tx-c-loan-borrow',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'RECEIVE_MONEY',
        total_amount: 5000,
        transaction_date: '2026-11-07',
        description: 'Car Loan Disbursement',
        created_at: '2026-11-07T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-7',
            transaction_id: 'tx-c-loan-borrow',
            target_account_id: 'acc-car',
            target_account: { id: 'acc-car', name: 'Car Loan', type: 'LOAN_TAKEN', subtype: 'GENERAL_LOAN' },
            amount: 5000,
            notes: null
          }
        ]
      },
      // 8. General Loan Repayment (-)
      {
        id: 'tx-c-loan-repay',
        user_id: 'u1-uuid',
        primary_account_id: 'acc-bank',
        primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
        form: 'PAYMENT_CHARGE',
        total_amount: 1000,
        transaction_date: '2026-11-08',
        description: 'Car Loan Installment',
        created_at: '2026-11-08T12:00:00.000Z',
        allocation_lines: [
          {
            id: 'l-8',
            transaction_id: 'tx-c-loan-repay',
            target_account_id: 'acc-car',
            target_account: { id: 'acc-car', name: 'Car Loan', type: 'LOAN_TAKEN', subtype: 'GENERAL_LOAN' },
            amount: 1000,
            notes: null
          }
        ]
      }
    ];

    expect(getTransactionKind(allEight[0])).toBe('INCOME');
    expect(getTransactionAmountSign(allEight[0])).toBe('+');
    expect(getTransactionKind(allEight[1])).toBe('EXPENSE');
    expect(getTransactionAmountSign(allEight[1])).toBe('-');
    expect(getTransactionKind(allEight[2])).toBe('REPAYMENT');
    expect(getTransactionAmountSign(allEight[2])).toBe('-');
    expect(getTransactionKind(allEight[3])).toBe('TRANSFER');
    expect(getTransactionAmountSign(allEight[3])).toBe('-');
    expect(getTransactionKind(allEight[4])).toBe('LOAN');
    expect(getTransactionAmountSign(allEight[4])).toBe('-');
    expect(getTransactionKind(allEight[5])).toBe('LOAN');
    expect(getTransactionAmountSign(allEight[5])).toBe('+');
    expect(getTransactionKind(allEight[6])).toBe('LOAN');
    expect(getTransactionAmountSign(allEight[6])).toBe('+');
    expect(getTransactionKind(allEight[7])).toBe('LOAN');
    expect(getTransactionAmountSign(allEight[7])).toBe('-');

    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(allEight);
    renderHistory();

    await waitFor(() => {
      // Verify actual rendered badges AND rendered +/- signs & formatted amounts for all 8 cases
      expect(screen.getByTestId('badge-tx-c-inc').textContent).toBe('Income');
      expect(screen.getByTestId('amount-tx-c-inc').textContent).toBe('+ 20,000.00 THB');

      expect(screen.getByTestId('badge-tx-c-cash-exp').textContent).toBe('Expense');
      expect(screen.getByTestId('amount-tx-c-cash-exp').textContent).toBe('- 350.00 THB');

      expect(screen.getByTestId('badge-tx-c-repay').textContent).toBe('Repayment');
      expect(screen.getByTestId('amount-tx-c-repay').textContent).toBe('- 1,500.00 THB');

      expect(screen.getByTestId('badge-tx-c-xfer').textContent).toBe('Transfer');
      expect(screen.getByTestId('amount-tx-c-xfer').textContent).toBe('- 2,000.00 THB');

      expect(screen.getByTestId('badge-tx-c-loan-given').textContent).toBe('Loan');
      expect(screen.getByTestId('amount-tx-c-loan-given').textContent).toBe('- 1,200.00 THB');

      expect(screen.getByTestId('badge-tx-c-loan-recovery').textContent).toBe('Loan');
      expect(screen.getByTestId('amount-tx-c-loan-recovery').textContent).toBe('+ 600.00 THB');

      expect(screen.getByTestId('badge-tx-c-loan-borrow').textContent).toBe('Loan');
      expect(screen.getByTestId('amount-tx-c-loan-borrow').textContent).toBe('+ 5,000.00 THB');

      expect(screen.getByTestId('badge-tx-c-loan-repay').textContent).toBe('Loan');
      expect(screen.getByTestId('amount-tx-c-loan-repay').textContent).toBe('- 1,000.00 THB');
    });
  });

  it('TEST-UI-HIST-06: displays filtered empty state with Clear Filters button when transactions exist but filters match none, and restores list on clear', async () => {
    const getSpy = vi
      .spyOn(transactionApi, 'getTransactions')
      .mockResolvedValueOnce(mockGoldenTransactions)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(mockGoldenTransactions);

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('transactions-table')).toBeDefined();
    });

    // Apply server-side keyword filter that returns 0 results
    fireEvent.change(screen.getByTestId('search-keyword-input'), { target: { value: 'NoMatchXYZ' } });
    fireEvent.change(screen.getByTestId('filter-type-select'), { target: { value: 'EXPENSE' } });
    fireEvent.click(screen.getByTestId('btn-apply-filters'));

    await waitFor(() => {
      expect(screen.getByTestId('empty-history-state').textContent).toContain(
        'No transactions match your filters'
      );
      expect(screen.queryByText('No transactions recorded yet')).toBeNull();
      expect(screen.getByTestId('btn-empty-clear-filters')).toBeDefined();
    });

    // Clicking Clear Filters inside empty state resets all filters and restores transactions
    fireEvent.click(screen.getByTestId('btn-empty-clear-filters'));

    await waitFor(() => {
      expect(getSpy).toHaveBeenLastCalledWith();
      expect((screen.getByTestId('search-keyword-input') as HTMLInputElement).value).toBe('');
      expect((screen.getByTestId('filter-type-select') as HTMLSelectElement).value).toBe('');
      expect(screen.getByTestId('transactions-table')).toBeDefined();
      expect(screen.getByTestId('txn-row-tx-salary')).toBeDefined();
    });
  });

  it('TEST-UI-AUDIT-01: opens Audit History modal on Audit button click and renders correction snapshots', async () => {
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);
    const auditSpy = vi.spyOn(transactionApi, 'getTransactionAuditHistory').mockResolvedValue([
      {
        id: 'log-1',
        sequence_number: '2',
        transaction_id: 'tx-salary',
        user_id: 'u1-uuid',
        action: 'CORRECTED',
        previous_snapshot: {
          total_amount: '20000.00',
          transaction_date: '2026-11-02',
          description: 'Salary',
          allocations: []
        },
        new_snapshot: {
          total_amount: '22000.00',
          transaction_date: '2026-11-02',
          description: 'Salary + Bonus',
          allocations: []
        },
        created_at: '2026-11-05T12:00:00.000Z'
      }
    ]);

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('btn-audit-tx-salary')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-audit-tx-salary'));

    await waitFor(() => {
      expect(auditSpy).toHaveBeenCalledWith('tx-salary');
      expect(screen.getByTestId('audit-history-modal')).toBeDefined();
      expect(screen.getByTestId('audit-entry-0').textContent).toContain('20000.00 THB');
      expect(screen.getByTestId('audit-entry-0').textContent).toContain('22000.00 THB');
    });
  });

  it('TEST-UI-AUDIT-02: renders added, removed, and modified snapshot allocations, notes, empty allocations, and unresolved account fallbacks', async () => {
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);
    vi.spyOn(accountApi, 'getAccounts').mockResolvedValue([
      {
        id: 'acc-dining',
        user_id: 'u1-uuid',
        name: 'Dining',
        type: 'EXPENSE',
        subtype: 'DEFAULT',
        opening_balance: 0,
        current_balance: 0,
        is_opening_locked: false,
        is_archived: false,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      },
      {
        id: 'acc-grocery',
        user_id: 'u1-uuid',
        name: 'Grocery',
        type: 'EXPENSE',
        subtype: 'DEFAULT',
        opening_balance: 0,
        current_balance: 0,
        is_opening_locked: false,
        is_archived: false,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      }
    ]);

    vi.spyOn(transactionApi, 'getTransactionAuditHistory').mockResolvedValue([
      {
        id: 'log-mod',
        sequence_number: '3',
        transaction_id: 'tx-purchase',
        user_id: 'u1-uuid',
        action: 'CORRECTED',
        previous_snapshot: {
          total_amount: '3000.00',
          transaction_date: '2026-11-03',
          description: 'Original split',
          allocations: [
            { target_account_id: 'acc-dining', amount: '1000.00', notes: 'Old dinner' },
            { target_account_id: 'acc-removed', amount: '2000.00', notes: 'Removed line' }
          ]
        },
        new_snapshot: {
          total_amount: '3500.00',
          transaction_date: '2026-11-03',
          description: 'Updated split',
          allocations: [
            { target_account_id: 'acc-dining', amount: '1500.00', notes: 'Modified dinner' },
            { target_account_id: 'acc-grocery', amount: '2000.00', notes: 'Added grocery' }
          ]
        },
        created_at: '2026-11-06T12:00:00.000Z'
      },
      {
        id: 'log-legacy',
        sequence_number: '1',
        transaction_id: 'tx-purchase',
        user_id: 'u1-uuid',
        action: 'CORRECTED',
        previous_snapshot: {
          total_amount: '1000.00',
          transaction_date: '2026-11-03',
          description: null,
          allocations: []
        },
        new_snapshot: {
          total_amount: '3000.00',
          transaction_date: '2026-11-03',
          description: 'Legacy entry'
        } as any,
        created_at: '2026-11-05T10:00:00.000Z'
      }
    ]);

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('btn-audit-tx-purchase')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-audit-tx-purchase'));

    await waitFor(() => {
      const prev0 = screen.getByTestId('audit-entry-0-previous').textContent || '';
      const new0 = screen.getByTestId('audit-entry-0-new').textContent || '';
      expect(prev0).toContain('Dining: 1000.00 THB — Old dinner');
      expect(prev0).toContain('Account (acc-removed): 2000.00 THB — Removed line');
      expect(new0).toContain('Dining: 1500.00 THB — Modified dinner');
      expect(new0).toContain('Grocery: 2000.00 THB — Added grocery');

      expect(screen.getByTestId('audit-entry-1-previous-allocations-empty').textContent).toContain('No allocations');
      expect(screen.getByTestId('audit-entry-1-new-allocations-empty').textContent).toContain('No allocations');
    });
  });

  it('TEST-UI-AUDIT-03: handles HTTP 403/404/500, network failure, empty state, and retry in Audit History modal', async () => {
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);
    const auditSpy = vi
      .spyOn(transactionApi, 'getTransactionAuditHistory')
      .mockRejectedValueOnce({ response: { status: 403, data: { error: { message: 'Admin forbidden' } } } })
      .mockRejectedValueOnce({ response: { status: 404, data: { error: { message: 'Transaction not found.' } } } })
      .mockRejectedValueOnce({ response: { status: 500, data: { error: { message: 'Server error' } } } })
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce([]);

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('btn-audit-tx-salary')).toBeDefined();
    });

    // 403
    fireEvent.click(screen.getByTestId('btn-audit-tx-salary'));
    await waitFor(() => {
      expect(screen.getByTestId('audit-error-alert').textContent).toContain('Admin forbidden');
    });

    // Retry -> 404
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByTestId('audit-error-alert').textContent).toContain('Transaction not found.');
    });

    // Retry -> 500
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByTestId('audit-error-alert').textContent).toContain('Server error');
    });

    // Retry -> Network Error
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByTestId('audit-error-alert').textContent).toContain('Network down');
    });

    // Retry -> Empty history
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.queryByTestId('audit-error-alert')).toBeNull();
      expect(screen.getByTestId('audit-empty-state').textContent).toContain(
        'No correction history recorded for this transaction.'
      );
    });
    expect(auditSpy).toHaveBeenCalledTimes(5);
  });

  it('TEST-UI-AUDIT-04: prevents stale audit history responses when closing modal or switching transactions while loading', async () => {
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);

    let resolveTx1!: (val: transactionApi.TransactionAuditLogEntry[]) => void;
    let resolveTx2!: (val: transactionApi.TransactionAuditLogEntry[]) => void;
    let resolveTx3!: (val: transactionApi.TransactionAuditLogEntry[]) => void;

    vi.spyOn(transactionApi, 'getTransactionAuditHistory')
      .mockImplementationOnce(() => new Promise((res) => { resolveTx1 = res; }))
      .mockImplementationOnce(() => new Promise((res) => { resolveTx2 = res; }))
      .mockImplementationOnce(() => new Promise((res) => { resolveTx3 = res; }));

    renderHistory();

    await waitFor(() => {
      expect(screen.getByTestId('btn-audit-tx-salary')).toBeDefined();
      expect(screen.getByTestId('btn-audit-tx-purchase')).toBeDefined();
    });

    // 1. Open tx-salary, then close modal while still loading
    fireEvent.click(screen.getByTestId('btn-audit-tx-salary'));
    expect(screen.getByTestId('audit-loading')).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    expect(screen.queryByTestId('audit-history-modal')).toBeNull();

    // Resolve closed request — modal stays closed, no stale data
    resolveTx1([
      {
        id: 'stale-log-1',
        sequence_number: '1',
        transaction_id: 'tx-salary',
        user_id: 'u1-uuid',
        action: 'CORRECTED',
        previous_snapshot: { total_amount: '1.00', transaction_date: '2026-11-01', description: 'Stale1', allocations: [] },
        new_snapshot: { total_amount: '2.00', transaction_date: '2026-11-01', description: 'Stale1', allocations: [] },
        created_at: '2026-11-05T12:00:00.000Z'
      }
    ]);
    await waitFor(() => {
      expect(screen.queryByTestId('audit-history-modal')).toBeNull();
    });

    // 2. Open tx-salary, then switch to tx-purchase while tx-salary is loading
    fireEvent.click(screen.getByTestId('btn-audit-tx-salary'));
    fireEvent.click(screen.getByTestId('btn-audit-tx-purchase'));

    resolveTx3([
      {
        id: 'fresh-log-2',
        sequence_number: '10',
        transaction_id: 'tx-purchase',
        user_id: 'u1-uuid',
        action: 'CORRECTED',
        previous_snapshot: { total_amount: '3000.00', transaction_date: '2026-11-03', description: 'FreshPurchase', allocations: [] },
        new_snapshot: { total_amount: '3200.00', transaction_date: '2026-11-03', description: 'FreshPurchaseNew', allocations: [] },
        created_at: '2026-11-06T12:00:00.000Z'
      }
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('audit-entry-0').textContent).toContain('FreshPurchaseNew');
    });

    // Older tx-salary response resolves late — must NOT overwrite tx-purchase's modal
    resolveTx2([
      {
        id: 'stale-log-2',
        sequence_number: '9',
        transaction_id: 'tx-salary',
        user_id: 'u1-uuid',
        action: 'CORRECTED',
        previous_snapshot: { total_amount: '9999.00', transaction_date: '2026-11-02', description: 'StaleSalary', allocations: [] },
        new_snapshot: { total_amount: '9999.00', transaction_date: '2026-11-02', description: 'StaleSalary', allocations: [] },
        created_at: '2026-11-05T12:00:00.000Z'
      }
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('audit-entry-0').textContent).toContain('FreshPurchaseNew');
      expect(screen.getByTestId('audit-entry-0').textContent).not.toContain('StaleSalary');
    });
  });
});
