import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IncomeForm } from './IncomeForm.js';
import * as transactionApi from '../api/transactionApi.js';
import { Account } from '../api/accountApi.js';

vi.mock('../api/transactionApi.js', () => ({
  recordIncome: vi.fn()
}));

const mockAccounts: Account[] = [
  {
    id: 'cash-checking-1',
    user_id: 'user-1',
    name: 'Checking Bank',
    type: 'CASH',
    opening_balance: 10000.0,
    current_balance: 10000.0,
    is_opening_locked: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z'
  },
  {
    id: 'cash-savings-2',
    user_id: 'user-1',
    name: 'Savings Bank',
    type: 'CASH',
    opening_balance: 5000.0,
    current_balance: 5000.0,
    is_opening_locked: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z'
  },
  {
    id: 'income-salary-1',
    user_id: 'user-1',
    name: 'Salary',
    type: 'INCOME',
    opening_balance: 0.0,
    is_opening_locked: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z'
  },
  {
    id: 'income-bonus-2',
    user_id: 'user-1',
    name: 'Bonus',
    type: 'INCOME',
    opening_balance: 0.0,
    is_opening_locked: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z'
  },
  {
    id: 'expense-dining-1',
    user_id: 'user-1',
    name: 'Dining',
    type: 'EXPENSE',
    opening_balance: 0.0,
    is_opening_locked: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z'
  }
];

describe('IncomeForm Component (TEST-UI-INC)', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <IncomeForm
        accounts={mockAccounts}
        isOpen={false}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with correct default account selections and today date', () => {
    render(
      <IncomeForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText('Record Income Transaction')).toBeDefined();

    const cashSelect = screen.getByLabelText(/Destination Cash Account/i) as HTMLSelectElement;
    expect(cashSelect.value).toBe('cash-checking-1');

    const incomeSelect = screen.getByLabelText(/Income Category/i) as HTMLSelectElement;
    expect(incomeSelect.value).toBe('income-salary-1');

    const dateInput = screen.getByLabelText(/Transaction Date/i) as HTMLInputElement;
    const now = new Date();
    const expectedToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(dateInput.value).toBe(expectedToday);
  });

  it('validates amount: rejects non-positive amount', async () => {
    render(
      <IncomeForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Amount \(THB\)/i);
    fireEvent.change(amountInput, { target: { value: '0' } });

    const submitBtn = screen.getByRole('button', { name: 'Record Income' });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText(/Transaction amount must be strictly greater than 0\.00\./i)
    ).toBeDefined();
    expect(transactionApi.recordIncome).not.toHaveBeenCalled();
  });

  it('validates amount: rejects more than 2 decimal places', async () => {
    render(
      <IncomeForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Amount \(THB\)/i);
    fireEvent.change(amountInput, { target: { value: '100.123' } });

    const submitBtn = screen.getByRole('button', { name: 'Record Income' });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText(/Transaction amount allows at most 2 decimal places\./i)
    ).toBeDefined();
    expect(transactionApi.recordIncome).not.toHaveBeenCalled();
  });

  it('validates amount: rejects exceeding maximum limit', async () => {
    render(
      <IncomeForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Amount \(THB\)/i);
    fireEvent.change(amountInput, { target: { value: '10000000000.00' } });

    const submitBtn = screen.getByRole('button', { name: 'Record Income' });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText(/Transaction amount exceeds maximum allowed limit/i)
    ).toBeDefined();
    expect(transactionApi.recordIncome).not.toHaveBeenCalled();
  });

  it('validates amount: rejects exponent notation', async () => {
    render(
      <IncomeForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Amount \(THB\)/i);
    fireEvent.change(amountInput, { target: { value: '1e3' } });

    const submitBtn = screen.getByRole('button', { name: 'Record Income' });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText(/Exponent notation is not allowed for transaction amounts\./i)
    ).toBeDefined();
    expect(transactionApi.recordIncome).not.toHaveBeenCalled();
  });

  it('submits valid income transaction, calls onSuccess callback, and closes modal', async () => {
    const mockResponse: transactionApi.IncomeResponseData = {
      transaction: {
        id: 'txn-123',
        primary_account_id: 'cash-checking-1',
        form: 'RECEIVE_MONEY',
        total_amount: '20000.00',
        transaction_date: '2026-11-06',
        description: 'Monthly Salary',
        allocations: [
          {
            id: 'alloc-1',
            target_account_id: 'income-salary-1',
            amount: '20000.00',
            notes: 'Monthly Salary'
          }
        ]
      },
      updated_balance: {
        account_id: 'cash-checking-1',
        current_balance: '30000.00'
      }
    };

    vi.mocked(transactionApi.recordIncome).mockResolvedValueOnce(mockResponse);

    render(
      <IncomeForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText(/Amount \(THB\)/i), {
      target: { value: '20000.00' }
    });
    fireEvent.change(screen.getByLabelText(/Transaction Date/i), {
      target: { value: '2026-11-06' }
    });
    fireEvent.change(screen.getByLabelText(/Description \(Optional\)/i), {
      target: { value: 'Monthly Salary' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Record Income' }));

    await waitFor(() => {
      expect(transactionApi.recordIncome).toHaveBeenCalledWith({
        primary_account_id: 'cash-checking-1',
        income_account_id: 'income-salary-1',
        total_amount: '20000.00',
        transaction_date: '2026-11-06',
        description: 'Monthly Salary'
      });
      expect(onSuccess).toHaveBeenCalledWith(mockResponse);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('displays API error alert when submission fails', async () => {
    vi.mocked(transactionApi.recordIncome).mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: 'Database transaction failed'
          }
        }
      }
    });

    render(
      <IncomeForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText(/Amount \(THB\)/i), {
      target: { value: '500.00' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record Income' }));

    await waitFor(() => {
      expect(screen.getByText('Database transaction failed')).toBeDefined();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
