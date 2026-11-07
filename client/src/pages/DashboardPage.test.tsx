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
});
