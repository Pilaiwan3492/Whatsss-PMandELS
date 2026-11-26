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

  it('TEST-UI-REPAY-15 (BR-07 v1.1 AC-07-8): enforces 100.00 THB minimum cash reserve on partial repayments and displays both Available Cash for Partial Repayment and Remaining Cash After Entered Amount (cash 1599.99, debt 3000.00, amount 1500.00 blocked; cash 1600.00 allowed)', () => {
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

    expect(screen.queryByText(/Available Cash for Partial Repayment/i)).not.toBeNull();

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;

    // 1599.99 - 1500.00 = 99.99 (< 100.00 reserve on partial repayment) -> blocked
    fireEvent.change(amountInput, { target: { value: '1500.00' } });
    expect(submitBtn.disabled).toBe(true);
    expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).not.toBeNull();
    expect(screen.queryByText(/Remaining Cash After Entered Amount/i)).not.toBeNull();

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
    expect(screen.queryByText(/Remaining Cash After Entered Amount/i)).not.toBeNull();
    expect(submitBtn2.disabled).toBe(false);
  });

  it('TEST-UI-REPAY-16 (BR-07 v1.1 AC-07-8): exempts full-settlement repayment from the 100.00 THB cash reserve when cash >= debt (3000.00 submits and calls recordRepayment), and blocks full settlement when cash < debt (2999.99)', async () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const fullSettlementResponse: transactionApi.RepaymentResponseData = {
      transaction: {
        id: 'txn-repay-full-exempt',
        primary_account_id: 'bank-checking-1',
        form: 'PAYMENT_CHARGE',
        total_amount: '3000.00',
        transaction_date: '2026-11-06',
        description: 'Credit Card Repayment',
        allocations: [
          {
            id: 'alloc-repay-full-exempt',
            target_account_id: 'cc-visa-1',
            amount: '3000.00',
            notes: 'Credit Card Repayment'
          }
        ]
      },
      updated_cash_balance: '0.00',
      updated_debt: '0.00'
    };

    vi.mocked(transactionApi.recordRepayment).mockResolvedValueOnce(fullSettlementResponse);

    const fullSettlementAccounts: Account[] = [
      {
        ...mockAccounts[0],
        current_balance: 3000.0
      },
      mockAccounts[1] // debt 3000.00
    ];

    const { unmount } = render(
      <RepaymentForm
        accounts={fullSettlementAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;

    // 1. Partial repayment of 2950.00 leaves 50.00 (< 100.00 reserve) -> blocked
    fireEvent.change(amountInput, { target: { value: '2950.00' } });
    try {
      expect(submitBtn.disabled).toBe(true);
      expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).not.toBeNull();

      // 2. Full settlement of 3000.00 leaves 0.00 cash -> exempt from 100.00 reserve -> allowed & submitted!
      fireEvent.change(amountInput, { target: { value: '3000.00' } });
      expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).toBeNull();
      expect(screen.queryByText(/Reserve Exempt/i)).not.toBeNull();
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
      expect(mockOnSuccess).toHaveBeenCalledWith(fullSettlementResponse);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      vi.mocked(transactionApi.recordRepayment).mockReset();
    }

    // 3. Full settlement when cash = 2999.99 and debt = 3000.00 -> blocked due to insufficient funds
    const insufficientFullSettlementAccounts: Account[] = [
      {
        ...mockAccounts[0],
        current_balance: 2999.99
      },
      mockAccounts[1] // debt 3000.00
    ];

    render(
      <RepaymentForm
        accounts={insufficientFullSettlementAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput2 = screen.getByLabelText(/Repayment Amount/i);
    const submitBtn2 = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    fireEvent.change(amountInput2, { target: { value: '3000.00' } });

    expect(screen.queryByText(/Exceeds bank balance/i)).not.toBeNull();
    expect(screen.queryByText(/Full Settlement Reserve Exempt/i)).toBeNull();
    expect(screen.queryByText(/Insufficient Funds for Full Settlement/i)).not.toBeNull();
    expect(submitBtn2.disabled).toBe(true);

    fireEvent.click(submitBtn2);
    expect(transactionApi.recordRepayment).not.toHaveBeenCalled();
  });

  it('TEST-UI-REPAY-17: displays MIN_REPAYMENT_NOT_MET from backend and clears error banner when user edits amount', async () => {
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

    // Editing the amount input clears the stale backend error banner so it does not mask new validation state
    fireEvent.change(amountInput, { target: { value: '600.00' } });
    expect(
      screen.queryByText('Repayment amount of 500.00 is below the minimum required repayment of 600.00.')
    ).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('TEST-UI-REPAY-18: displays MINIMUM_CASH_RESERVE_VIOLATION from backend and clears error banner when user switches source cash or target credit card account', async () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const multiAccounts: Account[] = [
      ...mockAccounts,
      {
        ...mockAccounts[0],
        id: 'bank-checking-2',
        name: 'Secondary Checking Bank',
        current_balance: 50000.0
      },
      {
        ...mockAccounts[1],
        id: 'cc-mastercard-2',
        name: 'Mastercard Credit Card',
        current_balance: 2000.0
      }
    ];

    vi.mocked(transactionApi.recordRepayment).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: {
            code: 'MINIMUM_CASH_RESERVE_VIOLATION',
            message: 'Partial repayment must leave at least 100.00 THB in the source cash account.'
          }
        }
      }
    });

    render(
      <RepaymentForm
        accounts={multiAccounts}
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
      expect(
        screen.getByText('Partial repayment must leave at least 100.00 THB in the source cash account.')
      ).toBeDefined();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();

    // 1. Switching source CASH account clears the stale error banner
    const fromSelect = screen.getByLabelText(/Pay From/i) as HTMLSelectElement;
    fireEvent.change(fromSelect, { target: { value: 'bank-checking-2' } });
    expect(
      screen.queryByText('Partial repayment must leave at least 100.00 THB in the source cash account.')
    ).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    // 2. Trigger error again, then verify switching target LOAN_TAKEN credit card account also clears the error banner
    vi.mocked(transactionApi.recordRepayment).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: {
            code: 'MINIMUM_CASH_RESERVE_VIOLATION',
            message: 'Partial repayment must leave at least 100.00 THB in the source cash account.'
          }
        }
      }
    });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(
        screen.getByText('Partial repayment must leave at least 100.00 THB in the source cash account.')
      ).toBeDefined();
    });

    const toSelect = screen.getByLabelText(/Settle Debt For/i) as HTMLSelectElement;
    fireEvent.change(toSelect, { target: { value: 'cc-mastercard-2' } });
    expect(
      screen.queryByText('Partial repayment must leave at least 100.00 THB in the source cash account.')
    ).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('TEST-UI-REPAY-19: Backend rejects repayment when the latest cash balance no longer satisfies the 100.00 THB reserve rule (stale modal balance race condition)', async () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    // User opens modal when cash is 1,600.00 THB and debt is 3,000.00 THB.
    // Another tab spends 50.00 THB (latest backend cash becomes 1,550.00 THB).
    // User enters 1,500.00 THB: UI sees 1,600 - 1,500 = 100.00 >= 100.00 and allows submit,
    // but authoritative Backend rejects with 422 MINIMUM_CASH_RESERVE_VIOLATION under row lock.
    const staleModalAccounts: Account[] = [
      {
        ...mockAccounts[0],
        current_balance: 1600.0
      },
      mockAccounts[1] // debt 3000.00
    ];

    vi.mocked(transactionApi.recordRepayment).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: {
            code: 'MINIMUM_CASH_RESERVE_VIOLATION',
            message: 'Partial repayment must leave at least 100.00 in the source cash account.'
          }
        }
      }
    });

    render(
      <RepaymentForm
        accounts={staleModalAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    fireEvent.change(amountInput, { target: { value: '1500.00' } });

    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(transactionApi.recordRepayment).toHaveBeenCalledWith(
        expect.objectContaining({
          from_account_id: 'bank-checking-1',
          to_account_id: 'cc-visa-1',
          amount: '1500.00'
        })
      );
      expect(
        screen.getByText('Partial repayment must leave at least 100.00 in the source cash account.')
      ).toBeDefined();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('TEST-UI-REPAY-20: enforces client validation precedence matching Backend when multiple rules are violated simultaneously', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    // Case 1: Amount exceeds BOTH Debt (3000.00) and Cash (200.00) -> Exceeds debt takes precedence
    const lowCashAccounts: Account[] = [
      {
        ...mockAccounts[0],
        current_balance: 200.0
      },
      mockAccounts[1] // debt 3000.00
    ];

    const { unmount } = render(
      <RepaymentForm
        accounts={lowCashAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput1 = screen.getByLabelText(/Repayment Amount/i);
    fireEvent.change(amountInput1, { target: { value: '3500.00' } });
    expect(screen.queryByText(/Exceeds debt/i)).not.toBeNull();
    expect(screen.queryByText(/Exceeds bank balance/i)).toBeNull();
    expect(screen.queryByText(/Below minimum repayment/i)).toBeNull();
    expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).toBeNull();

    // Case 2: Amount <= Debt (3000.00), but exceeds Cash (200.00) AND is below Minimum (500.00) -> Exceeds bank balance takes precedence
    fireEvent.change(amountInput1, { target: { value: '400.00' } });
    expect(screen.queryByText(/Exceeds debt/i)).toBeNull();
    expect(screen.queryByText(/Exceeds bank balance/i)).not.toBeNull();
    expect(screen.queryByText(/Below minimum repayment/i)).toBeNull();
    expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).toBeNull();

    unmount();

    // Case 3: Amount <= Debt (3000.00) and <= Cash (450.00), but violates BOTH Minimum (400 < 500) and Cash Reserve (450 - 400 = 50 < 100) -> Below minimum repayment takes precedence
    const reserveAndMinConflictAccounts: Account[] = [
      {
        ...mockAccounts[0],
        current_balance: 450.0
      },
      mockAccounts[1] // debt 3000.00
    ];

    render(
      <RepaymentForm
        accounts={reserveAndMinConflictAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput3 = screen.getByLabelText(/Repayment Amount/i);
    fireEvent.change(amountInput3, { target: { value: '400.00' } });
    expect(screen.queryByText(/Exceeds debt/i)).toBeNull();
    expect(screen.queryByText(/Exceeds bank balance/i)).toBeNull();
    expect(screen.queryByText(/Below minimum repayment/i)).not.toBeNull();
    expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).toBeNull();
  });

  it('TEST-UI-REPAY-21 (BR-07 v1.1 AC-07-9): prioritizes zero outstanding debt check before Exceeds debt, displays "No outstanding debt to repay.", and blocks submission', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const zeroDebtAccounts: Account[] = [
      {
        ...mockAccounts[0],
        current_balance: 50.0 // Even when cash is 50.00 and entered amount is 100.00, zero debt takes top precedence
      },
      {
        ...mockAccounts[1],
        current_balance: 0.0
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

    expect(screen.queryByText(/No outstanding debt to repay\./i)).not.toBeNull();
    expect(screen.queryByText(/Exceeds bank balance/i)).toBeNull();

    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    // Also verify direct form submit handler guard blocks submission and sets errorMessage
    const form = submitBtn.closest('form')!;
    fireEvent.submit(form);
    expect(screen.queryByRole('alert')?.textContent).toContain('No outstanding debt to repay.');
    expect(transactionApi.recordRepayment).not.toHaveBeenCalled();
  });

  it('TEST-UI-REPAY-22 (BR-07 v1.1 AC-07-9): displays backend HTTP 422 ZERO_OUTSTANDING_DEBT error message in alert banner without calling onSuccess or onClose', async () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    // User opens modal while debt appears to be 3000.00 THB, but debt was already settled in another session
    vi.mocked(transactionApi.recordRepayment).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: {
            code: 'ZERO_OUTSTANDING_DEBT',
            message: 'Outstanding repayment debt is 0.00; no repayment is required.'
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

    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(transactionApi.recordRepayment).toHaveBeenCalledTimes(1);
      expect(
        screen.getByText('Outstanding repayment debt is 0.00; no repayment is required.')
      ).toBeDefined();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('TEST-UI-REPAY-23: blocks submission when no source CASH account exists (and renders safely without crashing when accounts=[])', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    // Sub-check A: accounts=[] renders safely without crashing
    const { unmount } = render(
      <RepaymentForm
        accounts={[]}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const emptySubmitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    expect(emptySubmitBtn.disabled).toBe(true);
    unmount();

    // Sub-check B: Only target LOAN_TAKEN account exists (no CASH account)
    const noCashAccounts: Account[] = [mockAccounts[1]];

    render(
      <RepaymentForm
        accounts={noCashAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    fireEvent.change(amountInput, { target: { value: '500.00' } });

    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    const form = submitBtn.closest('form')!;
    fireEvent.submit(form);

    expect(screen.queryByRole('alert')?.textContent).toMatch(/Please select a valid source bank account/i);
    expect(transactionApi.recordRepayment).not.toHaveBeenCalled();
  });

  it('TEST-UI-REPAY-24: blocks submission when no target LOAN_TAKEN credit card account exists', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    // Only source CASH account exists (no LOAN_TAKEN account)
    const noCreditCardAccounts: Account[] = [mockAccounts[0]];

    render(
      <RepaymentForm
        accounts={noCreditCardAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    fireEvent.change(amountInput, { target: { value: '500.00' } });

    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    const form = submitBtn.closest('form')!;
    fireEvent.submit(form);

    expect(screen.queryByRole('alert')?.textContent).toMatch(/Please select a valid target credit card account/i);
    expect(transactionApi.recordRepayment).not.toHaveBeenCalled();
  });

  it('TEST-UI-REPAY-25: dynamically recalculates available cash, remaining cash, and reserve validation when switching source cash account', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const multiCashAccounts: Account[] = [
      {
        ...mockAccounts[0],
        id: 'bank-rich-1',
        name: 'Primary Checking Bank',
        current_balance: 30000.0 // Available for partial: 29,900.00
      },
      {
        ...mockAccounts[0],
        id: 'bank-tight-2',
        name: 'Secondary Savings Cash',
        current_balance: 1550.0 // Available for partial: 1,450.00
      },
      mockAccounts[1] // Visa Credit Card, Debt = 3,000.00
    ];

    render(
      <RepaymentForm
        accounts={multiCashAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    const fromSelect = screen.getByLabelText(/Pay From/i) as HTMLSelectElement;

    // Enter 1,500.00 THB while on Primary Checking Bank (30,000.00 THB) -> valid (remaining 28,500.00 >= 100.00)
    fireEvent.change(amountInput, { target: { value: '1500.00' } });
    expect(submitBtn.disabled).toBe(false);
    expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).toBeNull();

    // Switch source account to Secondary Savings Cash (1,550.00 THB) -> 1,550 - 1,500 = 50.00 (< 100.00 reserve) -> immediately invalid!
    fireEvent.change(fromSelect, { target: { value: 'bank-tight-2' } });
    expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).not.toBeNull();
    expect(submitBtn.disabled).toBe(true);

    // Switch back to Primary Checking Bank -> valid again
    fireEvent.change(fromSelect, { target: { value: 'bank-rich-1' } });
    expect(screen.queryByText(/Violates 100\.00 THB cash reserve/i)).toBeNull();
    expect(submitBtn.disabled).toBe(false);
  });

  it('TEST-UI-REPAY-26: dynamically recalculates outstanding debt and minimum required repayment when switching target credit card account', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    const multiCreditCardAccounts: Account[] = [
      mockAccounts[0], // Checking Bank = 30,000.00
      {
        ...mockAccounts[1],
        id: 'cc-visa-1',
        name: 'Visa Credit Card',
        current_balance: 3000.0 // Min repayment = 500.00
      },
      {
        ...mockAccounts[1],
        id: 'cc-mastercard-2',
        name: 'Mastercard Platinum',
        current_balance: 8000.0 // Min repayment = 10% = 800.00
      }
    ];

    render(
      <RepaymentForm
        accounts={multiCreditCardAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const amountInput = screen.getByLabelText(/Repayment Amount/i);
    const submitBtn = screen.getByRole('button', { name: /Confirm Repayment/i }) as HTMLButtonElement;
    const toSelect = screen.getByLabelText(/Settle Debt For/i) as HTMLSelectElement;

    // Enter 600.00 THB while on Visa Credit Card (Debt 3,000.00 -> Min 500.00) -> valid!
    fireEvent.change(amountInput, { target: { value: '600.00' } });
    expect(submitBtn.disabled).toBe(false);
    expect(screen.queryByText(/Below minimum repayment/i)).toBeNull();

    // Switch target credit card to Mastercard Platinum (Debt 8,000.00 -> Min 800.00) -> 600.00 is now below minimum 800.00!
    fireEvent.change(toSelect, { target: { value: 'cc-mastercard-2' } });
    expect(screen.queryByText(/Below minimum repayment/i)).not.toBeNull();
    expect(submitBtn.disabled).toBe(true);

    // Increase amount to 800.00 -> valid again
    fireEvent.change(amountInput, { target: { value: '800.00' } });
    expect(screen.queryByText(/Below minimum repayment/i)).toBeNull();
    expect(submitBtn.disabled).toBe(false);
  });
});
