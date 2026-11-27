import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoanForm } from './LoanForm.js';
import { Account } from '../api/accountApi.js';
import * as transactionApi from '../api/transactionApi.js';

vi.mock('../api/transactionApi.js', () => ({
  recordLoanGiven: vi.fn(),
  recordLoanRecovery: vi.fn(),
  recordLoanBorrowing: vi.fn(),
  recordLoanRepayment: vi.fn()
}));

const MOCK_ACCOUNTS: Account[] = [
  {
    id: 'acc-cash-1',
    user_id: 'user-a-uuid',
    name: 'Checking Bank',
    type: 'CASH',
    subtype: 'DEFAULT',
    opening_balance: 10000.00,
    current_balance: 10000.00,
    is_opening_locked: false,
    is_archived: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z'
  },
  {
    id: 'acc-loan-given-1',
    user_id: 'user-a-uuid',
    name: 'Friend Loan',
    type: 'LOAN_GIVEN',
    subtype: 'DEFAULT',
    opening_balance: 0.00,
    current_balance: 2500.00,
    is_opening_locked: true,
    is_archived: false,
    created_at: '2026-11-01T00:01:00Z',
    updated_at: '2026-11-01T00:01:00Z'
  },
  {
    id: 'acc-general-loan-1',
    user_id: 'user-a-uuid',
    name: 'Personal Loan',
    type: 'LOAN_TAKEN',
    subtype: 'GENERAL_LOAN',
    opening_balance: 0.00,
    current_balance: 4000.00,
    is_opening_locked: true,
    is_archived: false,
    created_at: '2026-11-01T00:02:00Z',
    updated_at: '2026-11-01T00:02:00Z'
  },
  {
    id: 'acc-cc-1',
    user_id: 'user-a-uuid',
    name: 'Visa Credit Card',
    type: 'LOAN_TAKEN',
    subtype: 'CREDIT_CARD',
    opening_balance: 0.00,
    current_balance: 3000.00,
    is_opening_locked: true,
    is_archived: false,
    created_at: '2026-11-01T00:03:00Z',
    updated_at: '2026-11-01T00:03:00Z'
  }
];

describe('LoanForm Component (WP-09: F-12 Loan Given/Recovery & F-13 General Loan Borrowing/Repayment)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TEST-LOAN-GIVEN-01 (UI): submits Disburse Loan Given (CASH -> LOAN_GIVEN) and triggers onSuccess', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    vi.mocked(transactionApi.recordLoanGiven).mockResolvedValueOnce({
      transaction: {
        id: 'tx-1',
        primary_account_id: 'acc-cash-1',
        form: 'PAYMENT_CHARGE',
        total_amount: '2500.00',
        transaction_date: '2026-11-12',
        description: 'Lent to friend',
        allocations: []
      },
      updated_cash_balance: '7500.00',
      updated_receivable: '2500.00'
    });

    render(
      <LoanForm
        accounts={MOCK_ACCOUNTS}
        isOpen={true}
        initialMode="LOAN_GIVEN"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText(/Amount \(THB\)/i), {
      target: { value: '2500.00' }
    });
    fireEvent.change(screen.getByLabelText(/Transaction Date/i), {
      target: { value: '2026-11-12' }
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'Lent to friend' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm Loan Transaction/i }));

    await waitFor(() => {
      expect(transactionApi.recordLoanGiven).toHaveBeenCalledWith({
        from_account_id: 'acc-cash-1',
        to_account_id: 'acc-loan-given-1',
        amount: '2500.00',
        transaction_date: '2026-11-12',
        description: 'Lent to friend'
      });
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('TEST-LOAN-GIVEN-02 (UI): submits Recover Loan Given (LOAN_GIVEN -> CASH) and triggers onSuccess', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    vi.mocked(transactionApi.recordLoanRecovery).mockResolvedValueOnce({
      transaction: {
        id: 'tx-2',
        primary_account_id: 'acc-cash-1',
        form: 'RECEIVE_MONEY',
        total_amount: '1000.00',
        transaction_date: '2026-11-15',
        description: 'Partial recovery',
        allocations: []
      },
      updated_cash_balance: '11000.00',
      updated_receivable: '1500.00'
    });

    render(
      <LoanForm
        accounts={MOCK_ACCOUNTS}
        isOpen={true}
        initialMode="LOAN_RECOVERY"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText(/Amount \(THB\)/i), {
      target: { value: '1000.00' }
    });
    fireEvent.change(screen.getByLabelText(/Transaction Date/i), {
      target: { value: '2026-11-15' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm Loan Transaction/i }));

    await waitFor(() => {
      expect(transactionApi.recordLoanRecovery).toHaveBeenCalledWith({
        from_account_id: 'acc-loan-given-1',
        to_account_id: 'acc-cash-1',
        amount: '1000.00',
        transaction_date: '2026-11-15',
        description: null
      });
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('TEST-LOAN-TAKEN-01 & TEST-LOAN-TAKEN-04 (UI): submits General Loan Borrowing (GENERAL_LOAN -> CASH) and strictly excludes CREDIT_CARD accounts from General Loan dropdown', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    vi.mocked(transactionApi.recordLoanBorrowing).mockResolvedValueOnce({
      transaction: {
        id: 'tx-3',
        primary_account_id: 'acc-cash-1',
        form: 'RECEIVE_MONEY',
        total_amount: '4000.00',
        transaction_date: '2026-11-12',
        description: 'Education loan',
        allocations: []
      },
      updated_cash_balance: '14000.00',
      updated_debt: '4000.00'
    });

    render(
      <LoanForm
        accounts={MOCK_ACCOUNTS}
        isOpen={true}
        initialMode="LOAN_BORROWING"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const targetSelect = screen.getByLabelText(/From General Loan \(Liability\) Account/i);
    expect(targetSelect.textContent).toContain('Personal Loan');
    expect(targetSelect.textContent).not.toContain('Visa Credit Card');

    fireEvent.change(screen.getByLabelText(/Amount \(THB\)/i), {
      target: { value: '4000.00' }
    });
    fireEvent.change(screen.getByLabelText(/Transaction Date/i), {
      target: { value: '2026-11-12' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm Loan Transaction/i }));

    await waitFor(() => {
      expect(transactionApi.recordLoanBorrowing).toHaveBeenCalledWith({
        from_account_id: 'acc-general-loan-1',
        to_account_id: 'acc-cash-1',
        amount: '4000.00',
        transaction_date: '2026-11-12',
        description: null
      });
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('TEST-LOAN-TAKEN-02 (UI): submits General Loan Repayment (CASH -> GENERAL_LOAN) including amounts < 500 THB floor', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    vi.mocked(transactionApi.recordLoanRepayment).mockResolvedValueOnce({
      transaction: {
        id: 'tx-4',
        primary_account_id: 'acc-cash-1',
        form: 'PAYMENT_CHARGE',
        total_amount: '200.00',
        transaction_date: '2026-11-16',
        description: 'Small principal installment',
        allocations: []
      },
      updated_cash_balance: '9800.00',
      updated_debt: '3800.00'
    });

    render(
      <LoanForm
        accounts={MOCK_ACCOUNTS}
        isOpen={true}
        initialMode="LOAN_REPAYMENT"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText(/Amount \(THB\)/i), {
      target: { value: '200.00' }
    });
    fireEvent.change(screen.getByLabelText(/Transaction Date/i), {
      target: { value: '2026-11-16' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm Loan Transaction/i }));

    await waitFor(() => {
      expect(transactionApi.recordLoanRepayment).toHaveBeenCalledWith({
        from_account_id: 'acc-cash-1',
        to_account_id: 'acc-general-loan-1',
        amount: '200.00',
        transaction_date: '2026-11-16',
        description: null
      });
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('TEST-LOAN-GIVEN-03 & TEST-LOAN-TAKEN-03 (UI): displays validation and backend 422 error alerts without closing modal', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    vi.mocked(transactionApi.recordLoanRecovery).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: {
            code: 'RECOVERY_EXCEEDS_RECEIVABLE',
            message: 'Recovery amount of 3000.00 exceeds outstanding receivable of 2500.00.'
          }
        }
      }
    });

    render(
      <LoanForm
        accounts={MOCK_ACCOUNTS}
        isOpen={true}
        initialMode="LOAN_RECOVERY"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // 1. Client-side validation for 3 decimal places
    fireEvent.change(screen.getByLabelText(/Amount \(THB\)/i), {
      target: { value: '100.123' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Loan Transaction/i }));
    const clientAlert = await screen.findByRole('alert');
    expect(clientAlert.textContent).toContain('at most 2 decimal places');

    // 2. Backend 422 error alert
    fireEvent.change(screen.getByLabelText(/Amount \(THB\)/i), {
      target: { value: '3000.00' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Loan Transaction/i }));
    await waitFor(async () => {
      const serverAlert = await screen.findByRole('alert');
      expect(serverAlert.textContent).toContain(
        'Recovery amount of 3000.00 exceeds outstanding receivable of 2500.00'
      );
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
