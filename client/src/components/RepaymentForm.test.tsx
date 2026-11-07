import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RepaymentForm } from './RepaymentForm.js';
import * as transactionApi from '../api/transactionApi.js';
import { Account } from '../api/accountApi.js';

vi.mock('../api/transactionApi.js', () => ({
  recordRepayment: vi.fn()
}));

const mockAccounts: Account[] = [
  {
    id: 'bank-checking-1',
    user_id: 'user-1',
    name: 'Checking Bank',
    type: 'CASH',
    opening_balance: 10000.0,
    current_balance: 30000.0,
    is_opening_locked: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z'
  },
  {
    id: 'cc-visa-1',
    user_id: 'user-1',
    name: 'Visa Credit Card',
    type: 'LOAN_TAKEN',
    opening_balance: 0.0,
    current_balance: 3000.0,
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
    current_balance: 0.0,
    is_opening_locked: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z'
  }
];

describe('Frontend Component: RepaymentForm (WP-05, F-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TEST-UI-REPAY-01: does not render modal when isOpen is false', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const { container } = render(
      <RepaymentForm
        accounts={mockAccounts}
        isOpen={false}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('TEST-UI-REPAY-02: renders modal with source cash account and target credit card when isOpen is true', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    render(
      <RepaymentForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Credit Card Repayment')).toBeDefined();
    expect(screen.getByLabelText(/Pay From/i)).toBeDefined();
    expect(screen.getByLabelText(/Settle Debt For/i)).toBeDefined();
    expect(screen.getByLabelText(/Repayment Amount/i)).toBeDefined();
    expect(screen.getByLabelText(/Transaction Date/i)).toBeDefined();
  });

  it('TEST-UI-REPAY-03: submits valid full repayment (3,000.00 THB) and invokes recordRepayment API', async () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const mockRepaymentResponse: transactionApi.RepaymentResponseData = {
      transaction: {
        id: 'txn-repay-123',
        primary_account_id: 'bank-checking-1',
        form: 'PAYMENT_CHARGE',
        total_amount: '3000.00',
        transaction_date: '2026-11-06',
        description: 'Credit Card Repayment',
        allocations: [
          {
            id: 'alloc-repay-1',
            target_account_id: 'cc-visa-1',
            amount: '3000.00',
            notes: 'Credit Card Repayment'
          }
        ]
      },
      updated_cash_balance: '27000.00',
      updated_debt: '0.00'
    };

    vi.mocked(transactionApi.recordRepayment).mockResolvedValueOnce(mockRepaymentResponse);

    render(
      <RepaymentForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    fireEvent.change(amountInput, { target: { value: '3000.00' } });

    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(transactionApi.recordRepayment).toHaveBeenCalledTimes(1);
    });

    expect(transactionApi.recordRepayment).toHaveBeenCalledWith(
      expect.objectContaining({
        from_account_id: 'bank-checking-1',
        to_account_id: 'cc-visa-1',
        amount: '3000.00'
      })
    );

    expect(mockOnSuccess).toHaveBeenCalledWith(mockRepaymentResponse);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('TEST-UI-REPAY-04: submits partial repayment of 1500.00 THB', async () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const mockRepaymentResponse: transactionApi.RepaymentResponseData = {
      transaction: {
        id: 'txn-repay-456',
        primary_account_id: 'bank-checking-1',
        form: 'PAYMENT_CHARGE',
        total_amount: '1500.00',
        transaction_date: '2026-11-06',
        description: 'Partial Repayment',
        allocations: [
          {
            id: 'alloc-repay-2',
            target_account_id: 'cc-visa-1',
            amount: '1500.00',
            notes: 'Partial Repayment'
          }
        ]
      },
      updated_cash_balance: '28500.00',
      updated_debt: '1500.00'
    };

    vi.mocked(transactionApi.recordRepayment).mockResolvedValueOnce(mockRepaymentResponse);

    render(
      <RepaymentForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    fireEvent.change(amountInput, { target: { value: '1500.00' } });

    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(transactionApi.recordRepayment).toHaveBeenCalledTimes(1);
    });

    expect(mockOnSuccess).toHaveBeenCalledWith(mockRepaymentResponse);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('TEST-UI-REPAY-05: "Pay Full Debt" button populates the exact outstanding debt', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    render(
      <RepaymentForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const payFullBtn = screen.getByRole('button', { name: /Pay Full Debt/i });
    expect(payFullBtn).toBeDefined();

    fireEvent.click(payFullBtn);

    const amountInput = screen.getByLabelText(/Repayment Amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe('3000.00');

    // Balance preview shows 0.00 THB (Fully Settled)
    expect(screen.getByText(/Fully Settled/i)).toBeDefined();
  });

  it('TEST-UI-REPAY-06: blocks submission and displays warning when repayment exceeds debt', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    render(
      <RepaymentForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    fireEvent.change(amountInput, { target: { value: '3500.00' } });

    expect(screen.getByText(/Exceeds debt/i)).toBeDefined();

    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    fireEvent.click(submitBtn);
    expect(transactionApi.recordRepayment).not.toHaveBeenCalled();
  });

  it('TEST-UI-REPAY-07: blocks submission when repayment exceeds available bank balance', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    render(
      <RepaymentForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    // Bank balance is 30,000 THB; enter 35,000 THB
    fireEvent.change(amountInput, { target: { value: '35000.00' } });

    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(transactionApi.recordRepayment).not.toHaveBeenCalled();
  });

  it('TEST-UI-REPAY-08: blocks submission on non-positive or invalid amount format', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    render(
      <RepaymentForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;

    // Empty amount
    fireEvent.change(amountInput, { target: { value: '' } });
    expect(submitBtn.disabled).toBe(true);

    // Zero amount
    fireEvent.change(amountInput, { target: { value: '0' } });
    expect(submitBtn.disabled).toBe(true);

    // Invalid text
    fireEvent.change(amountInput, { target: { value: '1000abc' } });
    expect(submitBtn.disabled).toBe(true);

    // Exponent notation
    fireEvent.change(amountInput, { target: { value: '1e3' } });
    expect(submitBtn.disabled).toBe(true);

    expect(transactionApi.recordRepayment).not.toHaveBeenCalled();
  });

  it('TEST-UI-REPAY-09: displays error banner when backend returns rejection', async () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    vi.mocked(transactionApi.recordRepayment).mockRejectedValueOnce({
      response: {
        data: {
          error: {
            code: 'REPAYMENT_EXCEEDS_DEBT',
            message: 'Repayment amount exceeds outstanding debt.'
          }
        }
      }
    });

    render(
      <RepaymentForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    fireEvent.change(amountInput, { target: { value: '3000.00' } });

    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Repayment amount exceeds outstanding debt.')).toBeDefined();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('TEST-UI-REPAY-10: closes modal when Cancel button is clicked', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    render(
      <RepaymentForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
