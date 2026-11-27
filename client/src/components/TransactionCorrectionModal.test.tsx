import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransactionCorrectionModal } from './TransactionCorrectionModal.js';
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
});
