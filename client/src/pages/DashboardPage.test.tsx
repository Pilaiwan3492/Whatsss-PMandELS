import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.js';
import { DashboardPage } from './DashboardPage.js';
import { axiosClient } from '../api/axiosClient.js';
import * as reportApi from '../api/reportApi.js';
import * as transactionApi from '../api/transactionApi.js';

describe('Frontend Dashboard & Financial Summary Suite (WP-06, Features F-08, F-09)', () => {
  const mockUserDemo = {
    id: 'u1-uuid',
    username: 'user_demo',
    email: 'user_demo@whatsss.local',
    role: 'USER'
  };

  const mockGoldenSummary: reportApi.FinancialSummaryData = {
    bank_balance: 27000.00,
    credit_debt: 0.00,
    total_income: 20000.00,
    total_expense: 3000.00,
    category_breakdown: {
      Dining: 1000.00,
      Grocery: 2000.00
    },
    categories: [
      { name: 'Dining', amount: 1000.00 },
      { name: 'Grocery', amount: 2000.00 }
    ]
  };

  const mockGoldenTransactions: transactionApi.HistoryTransaction[] = [
    {
      id: 'tx-repay',
      user_id: 'u1-uuid',
      primary_account_id: 'acc-bank',
      primary_account: { id: 'acc-bank', name: 'Checking Bank', type: 'CASH' },
      form: 'PAYMENT_CHARGE',
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
          notes: null
        }
      ]
    },
    {
      id: 'tx-purchase',
      user_id: 'u1-uuid',
      primary_account_id: 'acc-cc',
      primary_account: { id: 'acc-cc', name: 'Visa Credit Card', type: 'LOAN_TAKEN' },
      form: 'PAYMENT_CHARGE',
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
      form: 'RECEIVE_MONEY',
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

    vi.spyOn(reportApi, 'getCategorySpendingReport').mockResolvedValue(null as any);
  });

  const renderDashboard = () => {
    return render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <DashboardPage />
        </AuthProvider>
      </MemoryRouter>
    );
  };

  it('TEST-UI-DASH-01: renders 4 financial summary cards matching Golden Journey state (AC-08-1)', async () => {
    vi.spyOn(reportApi, 'getFinancialSummary').mockResolvedValue(mockGoldenSummary);
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);

    renderDashboard();

    // Verify 4 summary cards render exact values
    await waitFor(() => {
      expect(screen.getByTestId('metric-bank-balance').textContent).toContain('27,000.00 THB');
      expect(screen.getByTestId('metric-credit-debt').textContent).toContain('0.00 THB');
      expect(screen.getByTestId('metric-total-income').textContent).toContain('20,000.00 THB');
      expect(screen.getByTestId('metric-total-expense').textContent).toContain('3,000.00 THB');
    });
  });

  it('TEST-UI-DASH-02: renders expense category breakdown section with Dining and Grocery proportions', async () => {
    vi.spyOn(reportApi, 'getFinancialSummary').mockResolvedValue(mockGoldenSummary);
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);

    renderDashboard();

    await waitFor(() => {
      const diningRow = screen.getByTestId('category-row-Dining');
      expect(diningRow).toBeDefined();
      expect(diningRow.textContent).toContain('1,000.00 THB (33%)');

      const groceryRow = screen.getByTestId('category-row-Grocery');
      expect(groceryRow).toBeDefined();
      expect(groceryRow.textContent).toContain('2,000.00 THB (67%)');
    });
  });

  it('TEST-UI-DASH-03: renders recent transactions table with type badges', async () => {
    vi.spyOn(reportApi, 'getFinancialSummary').mockResolvedValue(mockGoldenSummary);
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Recent Transactions')).toBeDefined();
      expect(screen.getByText('CC Repayment')).toBeDefined();
      expect(screen.getByText('Dining & Grocery Split')).toBeDefined();
      expect(screen.getByText('November Salary')).toBeDefined();
    });
  });

  it('TEST-UI-DASH-04: provides quick action links to record transactions and view history', async () => {
    vi.spyOn(reportApi, 'getFinancialSummary').mockResolvedValue(mockGoldenSummary);
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('metric-bank-balance')).toBeDefined();
    });

    expect(screen.getByRole('link', { name: /\+ Record Income/i }).getAttribute('href')).toBe('/accounts');
    expect(screen.getByRole('link', { name: /- Record Expense/i }).getAttribute('href')).toBe('/accounts');
    expect(screen.getByRole('link', { name: /Pay Debt/i }).getAttribute('href')).toBe('/accounts');
    expect(screen.getByRole('link', { name: /Transfer Cash/i }).getAttribute('href')).toBe('/accounts');
    expect(screen.getByRole('link', { name: /^History$/i }).getAttribute('href')).toBe('/transactions');
  });

  it('TEST-UI-DASH-05: handles error loading summary gracefully with alert and retry', async () => {
    let callCount = 0;
    vi.spyOn(reportApi, 'getFinancialSummary').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Network connection failed');
      }
      return mockGoldenSummary;
    });
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue([]);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByRole('alert').textContent).toContain('Network connection failed');
    });

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByTestId('metric-bank-balance').textContent).toContain('27,000.00 THB');
    });
  });

  it('TEST-UI-DASH-06: handles history error gracefully with retry while financial summary renders normally', async () => {
    vi.spyOn(reportApi, 'getFinancialSummary').mockResolvedValue(mockGoldenSummary);

    let historyCalls = 0;
    vi.spyOn(transactionApi, 'getTransactions').mockImplementation(async () => {
      historyCalls++;
      if (historyCalls === 1) {
        throw new Error('Database connection failed');
      }
      return mockGoldenTransactions;
    });

    renderDashboard();

    // Summary must still render normally even when history API fails
    await waitFor(() => {
      expect(screen.getByTestId('metric-bank-balance').textContent).toContain('27,000.00 THB');
      expect(screen.getByTestId('metric-credit-debt').textContent).toContain('0.00 THB');
      expect(screen.getByTestId('history-error-container')).toBeDefined();
      expect(screen.getByText('Unable to load recent transactions.')).toBeDefined();
    });

    // Ensure it does NOT show "No transactions recorded yet" when it failed with an error
    expect(screen.queryByTestId('history-empty')).toBeNull();

    // Click retry on history error container
    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryBtn);

    // After retry succeeds, transactions table should be displayed
    await waitFor(() => {
      expect(screen.getByText('CC Repayment')).toBeDefined();
      expect(screen.queryByTestId('history-error-container')).toBeNull();
    });
  });

  it('TEST-UI-DASH-07: renders empty state placeholder when zero transactions are recorded', async () => {
    vi.spyOn(reportApi, 'getFinancialSummary').mockResolvedValue(mockGoldenSummary);
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue([]);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('metric-bank-balance')).toBeDefined();
      expect(screen.getByTestId('history-empty')).toBeDefined();
      expect(screen.getByText('No transactions recorded yet.')).toBeDefined();
    });
  });

  it('TEST-UI-REP-CAT-01: renders period-filtered category spending report with percentages and handles invalid range errors', async () => {
    vi.spyOn(reportApi, 'getFinancialSummary').mockResolvedValue(mockGoldenSummary);
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);
    const catSpy = vi
      .spyOn(reportApi, 'getCategorySpendingReport')
      .mockResolvedValueOnce({
        period: { start_date: null, end_date: null },
        total_expense: '3000.00',
        categories: [
          {
            category_id: 'cat-grocery',
            category_name: 'Grocery',
            total_amount: '2000.00',
            percentage: '66.67',
            transaction_count: 1
          },
          {
            category_id: 'cat-dining',
            category_name: 'Dining',
            total_amount: '1000.00',
            percentage: '33.33',
            transaction_count: 1
          }
        ]
      })
      .mockResolvedValueOnce({
        period: { start_date: '2026-11-01', end_date: '2026-11-02' },
        total_expense: '1000.00',
        categories: [
          {
            category_id: 'cat-dining',
            category_name: 'Dining',
            total_amount: '1000.00',
            percentage: '100.00',
            transaction_count: 1
          }
        ]
      });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('category-report-total').textContent).toContain('3,000.00 THB');
      expect(screen.getByTestId('category-row-Grocery').textContent).toContain('66.67%');
      expect(screen.getByTestId('category-row-Dining').textContent).toContain('33.33%');
    });

    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2026-11-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(catSpy).toHaveBeenLastCalledWith({ startDate: '2026-11-01', endDate: '2026-11-02' });
      expect(screen.getByTestId('category-report-total').textContent).toContain('1,000.00 THB');
      expect(screen.getByTestId('category-row-Dining').textContent).toContain('100.00%');
    });
  });

  it('TEST-UI-REP-CAT-02: displays HTTP 400, 403, 500, network failure errors, empty state, and recovers on retry', async () => {
    vi.spyOn(reportApi, 'getFinancialSummary').mockResolvedValue(mockGoldenSummary);
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);

    const catSpy = vi
      .spyOn(reportApi, 'getCategorySpendingReport')
      // 1. Initial load: empty state
      .mockResolvedValueOnce({
        period: { start_date: null, end_date: null },
        total_expense: '0.00',
        categories: []
      })
      // 2. HTTP 400 INVALID_DATE_RANGE
      .mockRejectedValueOnce({
        response: { status: 400, data: { error: { code: 'INVALID_DATE_RANGE', message: 'startDate must be <= endDate' } } }
      })
      // 3. HTTP 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN
      .mockRejectedValueOnce({
        response: { status: 403, data: { error: { code: 'ADMIN_FINANCIAL_ACCESS_FORBIDDEN', message: 'Admin cannot access financial reports' } } }
      })
      // 4. HTTP 500
      .mockRejectedValueOnce({
        response: { status: 500, data: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } } }
      })
      // 5. Network failure (no response)
      .mockRejectedValueOnce(new Error('Network Error'))
      // 6. Retry / Apply succeeds
      .mockResolvedValueOnce({
        period: { start_date: '2026-11-01', end_date: '2026-11-10' },
        total_expense: '1500.00',
        categories: [
          {
            category_id: 'cat-dining',
            category_name: 'Dining',
            total_amount: '1500.00',
            percentage: '100.00',
            transaction_count: 2
          }
        ]
      });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('category-breakdown-section').textContent).toContain('No expense allocations recorded for this period.');
    });

    // HTTP 400
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => {
      expect(screen.getByTestId('category-report-error').textContent).toContain('startDate must be <= endDate');
    });

    // HTTP 403
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => {
      expect(screen.getByTestId('category-report-error').textContent).toContain('Admin cannot access financial reports');
    });

    // HTTP 500
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => {
      expect(screen.getByTestId('category-report-error').textContent).toContain('Internal server error');
    });

    // Network Error
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => {
      expect(screen.getByTestId('category-report-error').textContent).toContain('Network Error');
    });

    // Retry succeeds and clears error
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => {
      expect(screen.queryByTestId('category-report-error')).toBeNull();
      expect(screen.getByTestId('category-row-Dining').textContent).toContain('1,500.00 THB (100.00%)');
    });
    expect(catSpy).toHaveBeenCalledTimes(6);
  });

  it('TEST-UI-REP-CAT-03: prevents stale category report response from overwriting newer date-range results and handles unmount safely', async () => {
    vi.spyOn(reportApi, 'getFinancialSummary').mockResolvedValue(mockGoldenSummary);
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);

    let resolveFirst!: (val: reportApi.CategorySpendingReportData) => void;
    let resolveSecond!: (val: reportApi.CategorySpendingReportData) => void;

    const firstPromise = new Promise<reportApi.CategorySpendingReportData>((res) => {
      resolveFirst = res;
    });
    const secondPromise = new Promise<reportApi.CategorySpendingReportData>((res) => {
      resolveSecond = res;
    });

    vi.spyOn(reportApi, 'getCategorySpendingReport')
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    const { unmount } = renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('metric-bank-balance')).toBeDefined();
    });

    // Trigger newer request before older request resolves
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2026-11-05' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2026-11-06' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    // Newer request resolves first
    resolveSecond({
      period: { start_date: '2026-11-05', end_date: '2026-11-06' },
      total_expense: '500.00',
      categories: [
        {
          category_id: 'cat-coffee',
          category_name: 'Coffee',
          total_amount: '500.00',
          percentage: '100.00',
          transaction_count: 1
        }
      ]
    });

    await waitFor(() => {
      expect(screen.getByTestId('category-row-Coffee').textContent).toContain('500.00 THB');
    });

    // Older request resolves AFTER newer request — must be ignored
    resolveFirst({
      period: { start_date: null, end_date: null },
      total_expense: '9999.00',
      categories: [
        {
          category_id: 'cat-stale',
          category_name: 'StaleCategory',
          total_amount: '9999.00',
          percentage: '100.00',
          transaction_count: 9
        }
      ]
    });

    await waitFor(() => {
      expect(screen.getByTestId('category-row-Coffee')).toBeDefined();
      expect(screen.queryByTestId('category-row-StaleCategory')).toBeNull();
      expect(screen.getByTestId('category-report-total').textContent).toContain('500.00 THB');
    });

    // Unmount cleanly without errors
    unmount();
  });

  it('TEST-UI-REP-CAT-04: clears stale category report and hides unfiltered summary fallback when a date-filter request fails, then recovers on retry', async () => {
    vi.spyOn(reportApi, 'getFinancialSummary').mockResolvedValue(mockGoldenSummary);
    vi.spyOn(transactionApi, 'getTransactions').mockResolvedValue(mockGoldenTransactions);

    vi.spyOn(reportApi, 'getCategorySpendingReport')
      // 1. Initial successful report
      .mockResolvedValueOnce({
        period: { start_date: null, end_date: null },
        total_expense: '3000.00',
        categories: [
          {
            category_id: 'cat-grocery',
            category_name: 'Grocery',
            total_amount: '2000.00',
            percentage: '66.67',
            transaction_count: 1
          },
          {
            category_id: 'cat-dining',
            category_name: 'Dining',
            total_amount: '1000.00',
            percentage: '33.33',
            transaction_count: 1
          }
        ]
      })
      // 2. Different date range fails
      .mockRejectedValueOnce({
        response: { status: 500, data: { error: { message: 'Failed to load period report' } } }
      })
      // 3. Retry succeeds with new period data
      .mockResolvedValueOnce({
        period: { start_date: '2026-11-10', end_date: '2026-11-15' },
        total_expense: '450.00',
        categories: [
          {
            category_id: 'cat-transport',
            category_name: 'Transport',
            total_amount: '450.00',
            percentage: '100.00',
            transaction_count: 1
          }
        ]
      });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('category-report-total').textContent).toContain('3,000.00 THB');
      expect(screen.getByTestId('category-row-Grocery')).toBeDefined();
      expect(screen.getByTestId('category-row-Dining')).toBeDefined();
    });

    // Apply a different date range that fails
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2026-11-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(screen.getByTestId('category-report-error').textContent).toContain('Failed to load period report');
    });

    // Old report and unfiltered summary.categories fallback must NOT be displayed
    expect(screen.queryByTestId('category-report-total')).toBeNull();
    expect(screen.queryByTestId('category-row-Grocery')).toBeNull();
    expect(screen.queryByTestId('category-row-Dining')).toBeNull();

    // Retry successfully and verify new report appears
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(screen.queryByTestId('category-report-error')).toBeNull();
      expect(screen.getByTestId('category-report-total').textContent).toContain('450.00 THB');
      expect(screen.getByTestId('category-row-Transport').textContent).toContain('450.00 THB (100.00%)');
    });
  });
});
