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

describe('Frontend Component: ExpenseForm Premium Minimal Fintech Redesign (WP-04, F-05, F-06)', () => {
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

  it('renders modal with new 3-section layout, default credit card and allocation rows when isOpen is true', () => {
    render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Modal Header
    expect(screen.getByRole('heading', { name: 'Record Purchase', level: 2 })).toBeDefined();
    expect(screen.getByText('Add a new credit card transaction.')).toBeDefined();

    // Section 01 — Purchase Details
    expect(screen.getByText('01 — Purchase Details')).toBeDefined();
    expect(screen.getByLabelText(/Credit Card/i)).toBeDefined();
    expect(screen.getByLabelText(/Total Amount/i)).toBeDefined();
    expect(screen.getByLabelText(/Transaction Date/i)).toBeDefined();
    expect(screen.getByLabelText(/Description/i)).toBeDefined();

    // Section 02 — Expense Breakdown
    expect(screen.getByText('02 — Expense Breakdown')).toBeDefined();
    expect(screen.getByText('Allocation 01')).toBeDefined();
    expect(screen.getByText('Allocation 02')).toBeDefined();
    expect(screen.getByRole('button', { name: /Add category/i })).toBeDefined();

    // Section 03 — Allocation Summary
    expect(screen.getByText('Allocation Summary')).toBeDefined();
    expect(screen.getByTestId('summary-total')).toBeDefined();
    expect(screen.getByTestId('summary-allocated')).toBeDefined();
    expect(screen.getByTestId('summary-remaining')).toBeDefined();
  });

  it('disables submit button and displays Incomplete badge when allocations do not balance (BR-06)', () => {
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

    // Initial allocations are empty, so remaining is 3000.00
    expect(screen.getByText('Incomplete')).toBeDefined();
    expect(screen.getByTestId('summary-total').textContent).toBe('฿3000.00');
    expect(screen.getByTestId('summary-allocated').textContent).toBe('฿0.00');
    expect(screen.getByTestId('summary-remaining').textContent).toBe('฿3000.00');
    expect(screen.getByText(/Allocate the remaining ฿3000.00 to continue/i)).toBeDefined();

    const submitBtn = screen.getByRole('button', { name: /Record Purchase/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('enables submit button and shows Balanced badge when allocation sum strictly equals total amount (AC-06-1)', () => {
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

    // Verify Balanced status and metrics
    expect(screen.getByText('Balanced')).toBeDefined();
    expect(screen.getByTestId('summary-total').textContent).toBe('฿3000.00');
    expect(screen.getByTestId('summary-allocated').textContent).toBe('฿3000.00');
    expect(screen.getByTestId('summary-remaining').textContent).toBe('฿0.00');
    expect(screen.getByText(/Fully allocated: ฿3000.00 of ฿3000.00. Ready to record./i)).toBeDefined();

    const submitBtn = screen.getByRole('button', { name: /Record Purchase/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
  });

  it('displays Over-allocated badge and contextual warning when allocations exceed total purchase', () => {
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

    const amountLine1 = screen.getByLabelText('Amount for line 1');
    fireEvent.change(amountLine1, { target: { value: '2000.00' } });

    const amountLine2 = screen.getByLabelText('Amount for line 2');
    fireEvent.change(amountLine2, { target: { value: '1500.00' } });

    // Verify Over-allocated state
    expect(screen.getByText('Over-allocated')).toBeDefined();
    expect(screen.getByTestId('summary-total').textContent).toBe('฿3000.00');
    expect(screen.getByTestId('summary-allocated').textContent).toBe('฿3500.00');
    expect(screen.getByTestId('summary-remaining').textContent).toBe('฿-500.00');
    expect(screen.getByText(/Over-allocated by ฿500.00/i)).toBeDefined();

    const submitBtn = screen.getByRole('button', { name: /Record Purchase/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('allows adding and removing split allocation lines dynamically with outline Add category button', () => {
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

    // Click Add category
    const addBtn = screen.getByRole('button', { name: /Add category/i });
    fireEvent.click(addBtn);

    expect(screen.getByLabelText('Amount for line 3')).toBeDefined();
    expect(screen.getByText('Allocation 03')).toBeDefined();

    // Click Remove line 3
    const removeButtons = screen.getAllByTitle('Remove split line');
    expect(removeButtons.length).toBe(3);
    fireEvent.click(removeButtons[2]);

    expect(screen.queryByLabelText('Amount for line 3')).toBeNull();
    expect(screen.queryByText('Allocation 03')).toBeNull();
  });

  it('disables remove buttons when only 1 allocation line remains', () => {
    render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const removeButtons = screen.getAllByTitle('Remove split line');
    // Remove second line to leave only 1 line
    fireEvent.click(removeButtons[1]);

    const remainingRemoveBtn = screen.getByRole('button', { name: 'Remove allocation 1' }) as HTMLButtonElement;
    expect(remainingRemoveBtn.disabled).toBe(true);
  });

  it('updates progress bar state proportionally according to allocations', () => {
    const { container } = render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const totalInput = screen.getByLabelText(/Total Amount/i);
    fireEvent.change(totalInput, { target: { value: '2000.00' } });

    // 50% allocated
    const amountLine1 = screen.getByLabelText('Amount for line 1');
    fireEvent.change(amountLine1, { target: { value: '1000.00' } });

    const progressBar = container.querySelector('.expense-progress-bar') as HTMLElement;
    expect(progressBar).toBeDefined();
    expect(progressBar.style.width).toBe('50%');
    expect(progressBar.className).toContain('incomplete');

    // 100% balanced
    const amountLine2 = screen.getByLabelText('Amount for line 2');
    fireEvent.change(amountLine2, { target: { value: '1000.00' } });
    expect(progressBar.style.width).toBe('100%');
    expect(progressBar.className).toContain('balanced');
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
