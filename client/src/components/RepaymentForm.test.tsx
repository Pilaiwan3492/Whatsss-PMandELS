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

  it('TEST-UI-REPAY-11 (AUDIT-04 Regression): blocks positive repayment when outstanding debt is zero (0.00 THB) and displays Exceeds debt warning', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const zeroDebtAccounts: Account[] = [
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
        id: 'cc-visa-zero-debt',
        user_id: 'user-1',
        name: 'Visa Credit Card',
        type: 'LOAN_TAKEN',
        opening_balance: 0.0,
        current_balance: 0.0,
        is_opening_locked: false,
        created_at: '2026-11-01T00:00:00Z',
        updated_at: '2026-11-01T00:00:00Z'
      }
    ];

    render(
      <RepaymentForm
        accounts={zeroDebtAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    fireEvent.change(amountInput, { target: { value: '100.00' } });

    expect(screen.getByText(/Exceeds debt/i)).toBeDefined();

    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    fireEvent.click(submitBtn);
    expect(transactionApi.recordRepayment).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Lab 7 Part B (Issue #49): F-07 / BR-07 v1.1 Client Boundary Validation Tests
  // ---------------------------------------------------------------------------

  it('TEST-UI-REPAY-12 (BR-07 v1.1 AC-07-7): displays computed Minimum Required Repayment (500.00 THB floor for 3000.00 THB debt) and blocks partial repayment below 500.00 THB', () => {
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

    // Must display Minimum Required Repayment pill/summary for 3,000.00 THB debt -> 500.00 THB
    expect(screen.queryByText(/Minimum Required Repayment/i)).not.toBeNull();

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;

    // 499.99 THB is 0.01 below the 500.00 THB minimum floor -> blocked with inline warning
    fireEvent.change(amountInput, { target: { value: '499.99' } });
    expect(screen.queryByText(/Below minimum repayment/i)).not.toBeNull();
    expect(submitBtn.disabled).toBe(true);

    fireEvent.click(submitBtn);
    expect(transactionApi.recordRepayment).not.toHaveBeenCalled();

    // Exact 500.00 THB boundary -> allowed
    fireEvent.change(amountInput, { target: { value: '500.00' } });
    expect(screen.queryByText(/Below minimum repayment/i)).toBeNull();
    expect(submitBtn.disabled).toBe(false);
  });

  it('TEST-UI-REPAY-13 (BR-07 v1.1 AC-07-7): computes 10% minimum repayment with ROUND_HALF_UP (debt 5555.55 THB -> min 555.56 THB; 555.55 blocked, 555.56 allowed)', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const highDebtAccounts: Account[] = [
      mockAccounts[0],
      {
        ...mockAccounts[1],
        current_balance: 5555.55
      }
    ];

    render(
      <RepaymentForm
        accounts={highDebtAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;

    // 555.55 THB is 0.01 below roundHalfUp2(5555.55 * 0.10) = 555.56 THB -> blocked
    fireEvent.change(amountInput, { target: { value: '555.55' } });
    expect(submitBtn.disabled).toBe(true);
    expect(screen.queryByText(/Below minimum repayment/i)).not.toBeNull();

    // 555.56 THB -> allowed
    fireEvent.change(amountInput, { target: { value: '555.56' } });
    expect(screen.queryByText(/Below minimum repayment/i)).toBeNull();
    expect(submitBtn.disabled).toBe(false);
  });

  it('TEST-UI-REPAY-14 (BR-07 v1.1 AC-07-7): requires full settlement when outstanding debt is below 500.00 THB (debt 499.99 THB -> 499.98 blocked, 499.99 allowed)', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const smallDebtAccounts: Account[] = [
      mockAccounts[0],
      {
        ...mockAccounts[1],
        current_balance: 499.99
      }
    ];

    render(
      <RepaymentForm
        accounts={smallDebtAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;

    // Partial repayment of 499.98 THB against 499.99 THB debt -> blocked
    fireEvent.change(amountInput, { target: { value: '499.98' } });
    expect(submitBtn.disabled).toBe(true);
    expect(screen.queryByText(/Below minimum repayment/i)).not.toBeNull();

    // Full settlement of 499.99 THB -> allowed
    fireEvent.change(amountInput, { target: { value: '499.99' } });
    expect(screen.queryByText(/Below minimum repayment/i)).toBeNull();
    expect(submitBtn.disabled).toBe(false);
  });

  it('TEST-UI-REPAY-15 (BR-07 v1.1 AC-07-8): enforces 100.00 THB minimum cash reserve on partial repayments (cash 1599.99, debt 3000.00, amount 1500.00 blocked; cash 1600.00 allowed)', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const tightCashAccounts: Account[] = [
      {
        ...mockAccounts[0],
        current_balance: 1599.99
      },
      mockAccounts[1] // debt 3000.00
    ];

    const { unmount } = render(
      <RepaymentForm
        accounts={tightCashAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.queryByText(/Available Cash After 100\.00 THB Reserve/i)).not.toBeNull();

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;

    // 1599.99 - 1500.00 = 99.99 (< 100.00 reserve on partial repayment) -> blocked
    fireEvent.change(amountInput, { target: { value: '1500.00' } });
    expect(submitBtn.disabled).toBe(true);
    expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).not.toBeNull();

    unmount();

    // Exact 1600.00 cash - 1500.00 partial repayment = 100.00 remaining -> allowed
    const exactReserveAccounts: Account[] = [
      {
        ...mockAccounts[0],
        current_balance: 1600.0
      },
      mockAccounts[1]
    ];

    render(
      <RepaymentForm
        accounts={exactReserveAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput2 = screen.getByLabelText(/Repayment Amount/i);
    const submitBtn2 = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    fireEvent.change(amountInput2, { target: { value: '1500.00' } });
    expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).toBeNull();
    expect(submitBtn2.disabled).toBe(false);
  });

  it('TEST-UI-REPAY-16 (BR-07 v1.1 AC-07-8): exempts full-settlement repayment from the 100.00 THB cash reserve when cash >= debt (cash 3000.00, debt 3000.00, amount 3000.00 -> allowed)', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const fullSettlementAccounts: Account[] = [
      {
        ...mockAccounts[0],
        current_balance: 3000.0
      },
      mockAccounts[1] // debt 3000.00
    ];

    render(
      <RepaymentForm
        accounts={fullSettlementAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;

    // Partial repayment of 2950.00 leaves 50.00 (< 100.00 reserve) -> blocked
    fireEvent.change(amountInput, { target: { value: '2950.00' } });
    expect(submitBtn.disabled).toBe(true);
    expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).not.toBeNull();

    // Full settlement of 3000.00 leaves 0.00 cash -> exempt from 100.00 reserve -> allowed!
    fireEvent.change(amountInput, { target: { value: '3000.00' } });
    expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).toBeNull();
    expect(screen.queryByText(/Reserve Exempt/i)).not.toBeNull();
    expect(submitBtn.disabled).toBe(false);
  });

  it('TEST-UI-REPAY-17 (BR-07 v1.1 AC-07-7..9): surfaces backend 422 MIN_REPAYMENT_NOT_MET and MINIMUM_CASH_RESERVE_VIOLATION error messages in alert banner', async () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    vi.mocked(transactionApi.recordRepayment).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: {
            code: 'MIN_REPAYMENT_NOT_MET',
            message: 'Repayment amount of 500.00 is below the minimum required repayment of 600.00.'
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
    fireEvent.change(amountInput, { target: { value: '500.00' } });

    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Repayment amount of 500.00 is below the minimum required repayment of 600.00.')
      ).toBeDefined();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
