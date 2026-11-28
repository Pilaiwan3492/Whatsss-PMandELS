import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransactionCorrectionModal, isAccountAllowedTarget } from './TransactionCorrectionModal.js';
import * as transactionApi from '../api/transactionApi.js';
import * as accountApi from '../api/accountApi.js';

describe('Frontend TransactionCorrectionModal Suite (WP-11, Feature F-16, Task 3)', () => {
  const mockAccounts: accountApi.Account[] = [
    {
      id: 'acc-cc',
      user_id: 'u1-uuid',
      name: 'Visa Credit Card',
      type: 'LOAN_TAKEN',
      subtype: 'CREDIT_CARD',
      opening_balance: 0,
      current_balance: 3000,
      is_opening_locked: true,
      is_archived: false,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z'
    },
    {
      id: 'acc-dining',
      user_id: 'u1-uuid',
      name: 'Dining',
      type: 'EXPENSE',
      subtype: 'DEFAULT',
      opening_balance: 0,
      current_balance: 1000,
      is_opening_locked: true,
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
      current_balance: 2000,
      is_opening_locked: true,
      is_archived: false,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z'
    },
    {
      id: 'acc-utilities',
      user_id: 'u1-uuid',
      name: 'Utilities',
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
      id: 'acc-archived-exp',
      user_id: 'u1-uuid',
      name: 'Old Category',
      type: 'EXPENSE',
      subtype: 'DEFAULT',
      opening_balance: 0,
      current_balance: 0,
      is_opening_locked: false,
      is_archived: true,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z'
    }
  ];

  const baseTransaction: transactionApi.HistoryTransaction = {
    id: 'tx-split-1',
    user_id: 'u1-uuid',
    primary_account_id: 'acc-cc',
    primary_account: { id: 'acc-cc', name: 'Visa Credit Card', type: 'LOAN_TAKEN', subtype: 'CREDIT_CARD' },
    form: 'PAYMENT_CHARGE',
    total_amount: 3000,
    transaction_date: '2026-11-03',
    description: 'Dining & Grocery Split',
    created_at: '2026-11-03T12:00:00.000Z',
    allocation_lines: [
      {
        id: 'line-1',
        transaction_id: 'tx-split-1',
        target_account_id: 'acc-dining',
        target_account: { id: 'acc-dining', name: 'Dining', type: 'EXPENSE' },
        amount: 1000,
        notes: 'Dinner'
      },
      {
        id: 'line-2',
        transaction_id: 'tx-split-1',
        target_account_id: 'acc-grocery',
        target_account: { id: 'acc-grocery', name: 'Grocery', type: 'EXPENSE' },
        amount: 2000,
        notes: 'Groceries'
      }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(accountApi, 'getAccounts').mockResolvedValue(mockAccounts);
  });

  it('allows changing allocation target, editing amount & notes, adding and removing allocations, and submits successfully', async () => {
    const corrSpy = vi.spyOn(transactionApi, 'correctTransaction').mockResolvedValue({ id: 'tx-split-1' });
    const onSuccess = vi.fn();

    render(
      <TransactionCorrectionModal
        transaction={baseTransaction}
        accounts={mockAccounts}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    );

    // Archived account must NOT be offered as a new selectable option
    const targetSelect0 = screen.getByTestId('corr-alloc-target-0') as HTMLSelectElement;
    expect(Array.from(targetSelect0.options).some((o) => o.value === 'acc-archived-exp')).toBe(false);

    // Remove 2nd allocation (Grocery)
    fireEvent.click(screen.getByTestId('btn-remove-allocation-1'));
    expect(screen.queryByTestId('corr-alloc-row-1')).toBeNull();

    // Add a new allocation -> auto-picks next unused active expense account
    fireEvent.click(screen.getByTestId('btn-add-allocation'));
    expect(screen.getByTestId('corr-alloc-row-1')).toBeDefined();

    // Change 2nd allocation target to Utilities, edit amounts & notes
    fireEvent.change(screen.getByTestId('corr-alloc-target-1'), { target: { value: 'acc-utilities' } });
    fireEvent.change(screen.getByTestId('corr-alloc-amount-0'), { target: { value: '1200.00' } });
    fireEvent.change(screen.getByTestId('corr-alloc-notes-0'), { target: { value: 'Updated dinner' } });
    fireEvent.change(screen.getByTestId('corr-alloc-amount-1'), { target: { value: '1800.00' } });
    fireEvent.change(screen.getByTestId('corr-alloc-notes-1'), { target: { value: 'Electric' } });

    fireEvent.click(screen.getByTestId('btn-save-correction'));

    await waitFor(() => {
      expect(corrSpy).toHaveBeenCalledWith('tx-split-1', {
        total_amount: '3000.00',
        transaction_date: '2026-11-03',
        description: 'Dining & Grocery Split',
        allocations: [
          { target_account_id: 'acc-dining', amount: '1200.00', notes: 'Updated dinner' },
          { target_account_id: 'acc-utilities', amount: '1800.00', notes: 'Electric' }
        ]
      });
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks allocation sum mismatch, empty allocation list, duplicate targets, and archived account selection before calling API', async () => {
    const corrSpy = vi.spyOn(transactionApi, 'correctTransaction').mockResolvedValue({});

    render(
      <TransactionCorrectionModal
        transaction={baseTransaction}
        accounts={mockAccounts}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // 1. Sum mismatch
    fireEvent.change(screen.getByTestId('corr-total-amount'), { target: { value: '3500.00' } });
    fireEvent.click(screen.getByTestId('btn-save-correction'));
    expect(screen.getByTestId('correction-error').textContent).toContain('must equal total amount');
    expect(corrSpy).not.toHaveBeenCalled();

    // 2. Duplicate target account
    fireEvent.change(screen.getByTestId('corr-total-amount'), { target: { value: '3000.00' } });
    fireEvent.change(screen.getByTestId('corr-alloc-target-1'), { target: { value: 'acc-dining' } });
    fireEvent.click(screen.getByTestId('btn-save-correction'));
    expect(screen.getByTestId('correction-error').textContent).toContain('Duplicate target account');
    expect(corrSpy).not.toHaveBeenCalled();

    // 3. Empty allocation list
    fireEvent.click(screen.getByTestId('btn-remove-allocation-1'));
    fireEvent.click(screen.getByTestId('btn-remove-allocation-0'));
    fireEvent.click(screen.getByTestId('btn-save-correction'));
    expect(screen.getByTestId('correction-error').textContent).toContain('At least one allocation line');
    expect(corrSpy).not.toHaveBeenCalled();
  });

  it('blocks submitting a transaction whose existing target account is archived', async () => {
    const corrSpy = vi.spyOn(transactionApi, 'correctTransaction').mockResolvedValue({});
    const archivedTx: transactionApi.HistoryTransaction = {
      ...baseTransaction,
      total_amount: 1000,
      allocation_lines: [
        {
          id: 'line-arch',
          transaction_id: 'tx-split-1',
          target_account_id: 'acc-archived-exp',
          target_account: { id: 'acc-archived-exp', name: 'Old Category', type: 'EXPENSE' },
          amount: 1000,
          notes: null
        }
      ]
    };

    render(
      <TransactionCorrectionModal
        transaction={archivedTx}
        accounts={mockAccounts}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('btn-save-correction'));
    expect(screen.getByTestId('correction-error').textContent).toContain('archived account');
    expect(corrSpy).not.toHaveBeenCalled();
  });

  it('displays backend validation errors and network/server errors cleanly', async () => {
    vi.spyOn(transactionApi, 'correctTransaction')
      .mockRejectedValueOnce({
        response: { data: { error: { code: 'MIN_REPAYMENT_NOT_MET', message: 'Below minimum repayment floor' } } }
      })
      .mockRejectedValueOnce(new Error('Network Error'));

    render(
      <TransactionCorrectionModal
        transaction={baseTransaction}
        accounts={mockAccounts}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // Backend validation error
    fireEvent.click(screen.getByTestId('btn-save-correction'));
    await waitFor(() => {
      expect(screen.getByTestId('correction-error').textContent).toContain('Below minimum repayment floor');
    });

    // Network/server error
    fireEvent.click(screen.getByTestId('btn-save-correction'));
    await waitFor(() => {
      expect(screen.getByTestId('correction-error').textContent).toContain('Network Error');
    });
  });

  it('enforces explicit LOAN_TAKEN subtype filtering across RECEIVE_MONEY, LOAN_TAKEN charges, and CASH payments', () => {
    const subtypeAccounts: accountApi.Account[] = [
      ...mockAccounts,
      {
        id: 'acc-cash',
        user_id: 'u1-uuid',
        name: 'Checking Bank',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: 5000,
        current_balance: 5000,
        is_opening_locked: true,
        is_archived: false,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      },
      {
        id: 'acc-gl',
        user_id: 'u1-uuid',
        name: 'Personal Loan',
        type: 'LOAN_TAKEN',
        subtype: 'GENERAL_LOAN',
        opening_balance: 0,
        current_balance: 2000,
        is_opening_locked: true,
        is_archived: false,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      },
      {
        id: 'acc-lt-default',
        user_id: 'u1-uuid',
        name: 'Default Loan',
        type: 'LOAN_TAKEN',
        subtype: 'DEFAULT',
        opening_balance: 0,
        current_balance: 0,
        is_opening_locked: false,
        is_archived: false,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      },
      {
        id: 'acc-lt-undef',
        user_id: 'u1-uuid',
        name: 'Undefined Loan',
        type: 'LOAN_TAKEN',
        subtype: undefined as any,
        opening_balance: 0,
        current_balance: 0,
        is_opening_locked: false,
        is_archived: false,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      },
      {
        id: 'acc-lt-unknown',
        user_id: 'u1-uuid',
        name: 'Unknown Loan',
        type: 'LOAN_TAKEN',
        subtype: 'CRYPTO_LOAN' as any,
        opening_balance: 0,
        current_balance: 0,
        is_opening_locked: false,
        is_archived: false,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      }
    ];

    // 1. RECEIVE_MONEY: allows only GENERAL_LOAN among LOAN_TAKEN; excludes CREDIT_CARD, DEFAULT, undefined, unknown
    const receiveTx: transactionApi.HistoryTransaction = {
      ...baseTransaction,
      id: 'tx-recv-sub',
      primary_account_id: 'acc-cash',
      primary_account: { id: 'acc-cash', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
      form: 'RECEIVE_MONEY',
      total_amount: 2000,
      allocation_lines: [
        {
          id: 'l-gl',
          transaction_id: 'tx-recv-sub',
          target_account_id: 'acc-gl',
          target_account: { id: 'acc-gl', name: 'Personal Loan', type: 'LOAN_TAKEN', subtype: 'GENERAL_LOAN' },
          amount: 2000,
          notes: null
        }
      ]
    };
    const { unmount: unmountRecv } = render(
      <TransactionCorrectionModal
        transaction={receiveTx}
        accounts={subtypeAccounts}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    const recvValues = Array.from(
      (screen.getByTestId('corr-alloc-target-0') as HTMLSelectElement).options
    ).map((o) => o.value);
    expect(recvValues).toContain('acc-gl');
    expect(recvValues).not.toContain('acc-cc');
    expect(recvValues).not.toContain('acc-lt-default');
    expect(recvValues).not.toContain('acc-lt-undef');
    expect(recvValues).not.toContain('acc-lt-unknown');
    unmountRecv();

    // 2. PAYMENT_CHARGE with LOAN_TAKEN primary: allows EXPENSE only when primary subtype === CREDIT_CARD;
    //    rejects GENERAL_LOAN, DEFAULT, undefined, and unknown primary subtypes
    for (const badPrimarySubtype of ['GENERAL_LOAN', 'DEFAULT', undefined, 'CRYPTO_LOAN'] as const) {
      const badChargeTx: transactionApi.HistoryTransaction = {
        ...baseTransaction,
        primary_account: {
          id: 'acc-bad-lt',
          name: 'Bad Loan Primary',
          type: 'LOAN_TAKEN',
          subtype: badPrimarySubtype as any
        }
      };
      const { unmount } = render(
        <TransactionCorrectionModal
          transaction={badChargeTx}
          accounts={subtypeAccounts}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );
      const opts = Array.from(
        (screen.getByTestId('corr-alloc-target-0') as HTMLSelectElement).options
      ).map((o) => o.value);
      expect(opts).not.toContain('acc-utilities');
      expect(opts).not.toContain('acc-grocery');
      expect(isAccountAllowedTarget(badChargeTx, mockAccounts[1])).toBe(false);
      unmount();
    }

    // 3. PAYMENT_CHARGE with CASH primary: allows CREDIT_CARD and GENERAL_LOAN, excludes DEFAULT, undefined, unknown
    const cashPayTx: transactionApi.HistoryTransaction = {
      ...baseTransaction,
      id: 'tx-cash-pay-sub',
      primary_account_id: 'acc-cash',
      primary_account: { id: 'acc-cash', name: 'Checking Bank', type: 'CASH', subtype: 'DEFAULT' },
      form: 'PAYMENT_CHARGE',
      total_amount: 1000,
      allocation_lines: [
        {
          id: 'l-cc',
          transaction_id: 'tx-cash-pay-sub',
          target_account_id: 'acc-cc',
          target_account: { id: 'acc-cc', name: 'Visa Credit Card', type: 'LOAN_TAKEN', subtype: 'CREDIT_CARD' },
          amount: 1000,
          notes: null
        }
      ]
    };
    render(
      <TransactionCorrectionModal
        transaction={cashPayTx}
        accounts={subtypeAccounts}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    const cashPayValues = Array.from(
      (screen.getByTestId('corr-alloc-target-0') as HTMLSelectElement).options
    ).map((o) => o.value);
    expect(cashPayValues).toContain('acc-cc');
    expect(cashPayValues).toContain('acc-gl');
    expect(cashPayValues).toContain('acc-dining');
    expect(cashPayValues).not.toContain('acc-cash');
    expect(cashPayValues).not.toContain('acc-lt-default');
    expect(cashPayValues).not.toContain('acc-lt-undef');
    expect(cashPayValues).not.toContain('acc-lt-unknown');
  });
});
