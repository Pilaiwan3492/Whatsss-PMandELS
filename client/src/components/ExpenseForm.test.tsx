import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpenseForm } from './ExpenseForm.js';
import * as transactionApi from '../api/transactionApi.js';
import { Account } from '../api/accountApi.js';

vi.mock('../api/transactionApi.js', () => ({
  recordExpense: vi.fn()
}));

const mockAccounts: Account[] = [
  {
    id: 'cc-visa-1',
    user_id: 'user-1',
    name: 'Visa Credit Card',
    type: 'LOAN_TAKEN',
    opening_balance: 0.0,
    current_balance: 0.0,
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
  },
  {
    id: 'expense-grocery-2',
    user_id: 'user-1',
    name: 'Grocery',
    type: 'EXPENSE',
    opening_balance: 0.0,
    current_balance: 0.0,
    is_opening_locked: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z'
  }
];

describe('Frontend Component: ExpenseForm & Split Allocations Engine (WP-04, F-05, F-06)', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={false}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with default credit card account and split lines when isOpen is true', () => {
    render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('Record Credit Card Purchase')).toBeDefined();
    expect(screen.getByLabelText(/Primary Account/i)).toBeDefined();
    expect(screen.getByLabelText(/Total Amount/i)).toBeDefined();
    expect(screen.getByText(/Multi-Line Split Allocations Breakdown/i)).toBeDefined();
  });

  it('disables submit button and shows unbalanced badge when allocations do not equal total amount (BR-06)', () => {
    render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const totalInput = screen.getByLabelText(/Total Amount/i);
    fireEvent.change(totalInput, { target: { value: '3000.00' } });

    // Initial allocations are empty, so remaining is 3000
    expect(screen.getByText(/⚠ Unbalanced: Remaining to allocate: ฿3000.00/i)).toBeDefined();

    const submitBtn = screen.getByRole('button', { name: /Record Purchase/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('enables submit button and shows balanced badge when allocation sum strictly equals total amount (AC-06-1)', () => {
    render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const totalInput = screen.getByLabelText(/Total Amount/i);
    fireEvent.change(totalInput, { target: { value: '3000.00' } });

    // Fill line 1: Dining 1000.00
    const amountLine1 = screen.getByLabelText('Amount for line 1');
    fireEvent.change(amountLine1, { target: { value: '1000.00' } });

    // Fill line 2: Grocery 2000.00
    const amountLine2 = screen.getByLabelText('Amount for line 2');
    fireEvent.change(amountLine2, { target: { value: '2000.00' } });

    // Verify balanced badge appears
    expect(screen.getByText(/✓ Balanced: Allocated ฿3000.00 of ฿3000.00/i)).toBeDefined();

    const submitBtn = screen.getByRole('button', { name: /Record Purchase/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
  });

  it('allows adding and removing split allocation lines dynamically', () => {
    render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Initial has 2 lines
    expect(screen.getByLabelText('Amount for line 1')).toBeDefined();
    expect(screen.getByLabelText('Amount for line 2')).toBeDefined();

    // Click Add Split Line
    const addBtn = screen.getByRole('button', { name: /\+ Add Split Line/i });
    fireEvent.click(addBtn);

    expect(screen.getByLabelText('Amount for line 3')).toBeDefined();

    // Click Remove line
    const removeButtons = screen.getAllByTitle('Remove split line');
    fireEvent.click(removeButtons[2]);

    expect(screen.queryByLabelText('Amount for line 3')).toBeNull();
  });

  it('submits purchase transaction successfully and triggers onSuccess callback (AC-05-1)', async () => {
    const mockExpenseResult: any = {
      transaction: {
        id: 'txn-expense-1',
        primary_account_id: 'cc-visa-1',
        form: 'PAYMENT_CHARGE',
        total_amount: '3000.00',
        transaction_date: '2026-11-06',
        description: 'Team dinner & groceries',
        allocations: [
          { id: 'al-1', target_account_id: 'expense-dining-1', amount: '1000.00', notes: 'Dinner' },
          { id: 'al-2', target_account_id: 'expense-grocery-2', amount: '2000.00', notes: 'Grocery' }
        ]
      },
      updated_debt: {
        account_id: 'cc-visa-1',
        current_debt: '3000.00'
      }
    };

    vi.mocked(transactionApi.recordExpense).mockResolvedValueOnce(mockExpenseResult);

    render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText(/Total Amount/i), { target: { value: '3000.00' } });
    fireEvent.change(screen.getByLabelText('Amount for line 1'), { target: { value: '1000.00' } });
    fireEvent.change(screen.getByLabelText('Notes for line 1'), { target: { value: 'Dinner' } });
    fireEvent.change(screen.getByLabelText('Amount for line 2'), { target: { value: '2000.00' } });
    fireEvent.change(screen.getByLabelText('Notes for line 2'), { target: { value: 'Grocery' } });

    const submitBtn = screen.getByRole('button', { name: /Record Purchase/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(transactionApi.recordExpense).toHaveBeenCalledWith({
        primary_account_id: 'cc-visa-1',
        total_amount: 3000,
        transaction_date: expect.any(String),
        description: null,
        allocations: [
          { target_account_id: 'expense-dining-1', amount: 1000, notes: 'Dinner' },
          { target_account_id: 'expense-grocery-2', amount: 2000, notes: 'Grocery' }
        ]
      });
      expect(mockOnSuccess).toHaveBeenCalledWith(mockExpenseResult);
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('displays backend error message when API call fails (e.g. ALLOCATION_SUM_MISMATCH)', async () => {
    vi.mocked(transactionApi.recordExpense).mockRejectedValueOnce({
      response: {
        data: {
          error: {
            code: 'ALLOCATION_SUM_MISMATCH',
            message: 'Total amount must equal the sum of all allocation lines.'
          }
        }
      }
    });

    render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText(/Total Amount/i), { target: { value: '3000.00' } });
    fireEvent.change(screen.getByLabelText('Amount for line 1'), { target: { value: '1500.00' } });
    fireEvent.change(screen.getByLabelText('Amount for line 2'), { target: { value: '1500.00' } });

    const submitBtn = screen.getByRole('button', { name: /Record Purchase/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Total amount must equal the sum of all allocation lines.')).toBeDefined();
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });
});
