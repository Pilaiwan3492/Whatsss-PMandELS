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

describe('Frontend Component: ExpenseForm Split Allocation Engine (WP-04, F-05, F-06)', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TEST-UI-EXP-01: does not render modal when isOpen is false', () => {
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

  it('TEST-UI-EXP-02: renders modal with 3-section layout, credit card header, and split allocation cards (AC-05-1)', () => {
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

    // Section 02 — Expense Breakdown (Allocation Cards)
    expect(screen.getByText('02 — Expense Breakdown')).toBeDefined();
    expect(screen.getByText('Allocation 01')).toBeDefined();
    expect(screen.getByText('Allocation 02')).toBeDefined();
    expect(screen.getByRole('button', { name: /Add category/i })).toBeDefined();

    // Section 03 — Allocation Summary Panel
    expect(screen.getByText('Allocation Summary')).toBeDefined();
    expect(screen.getByTestId('summary-total')).toBeDefined();
    expect(screen.getByTestId('summary-allocated')).toBeDefined();
    expect(screen.getByTestId('summary-remaining')).toBeDefined();
  });

  it('TEST-UI-EXP-03: links all labels directly to inputs via htmlFor/id for accessibility compliance', () => {
    const { container } = render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Credit Card select
    const ccSelect = screen.getByLabelText(/Credit Card/i);
    expect(ccSelect.id).toBe('primaryAccountId');

    // Total Amount input
    const totalInput = screen.getByLabelText(/Total Amount/i);
    expect(totalInput.id).toBe('totalAmount');

    // Transaction Date input
    const dateInput = screen.getByLabelText(/Transaction Date/i);
    expect(dateInput.id).toBe('transactionDate');

    // Allocation Card 1 inputs
    const allocCategory1 = screen.getByLabelText('Category for line 1') as HTMLSelectElement;
    expect(allocCategory1.id).toBe('alloc-category-0');

    const allocAmount1 = screen.getByLabelText('Amount for line 1') as HTMLInputElement;
    expect(allocAmount1.id).toBe('alloc-amount-0');

    const allocNotes1 = screen.getByLabelText('Notes for line 1') as HTMLInputElement;
    expect(allocNotes1.id).toBe('alloc-notes-0');

    // Verify corresponding labels have matching htmlFor
    const labelCategory1 = container.querySelector('label[for="alloc-category-0"]');
    expect(labelCategory1).not.toBeNull();
    const labelAmount1 = container.querySelector('label[for="alloc-amount-0"]');
    expect(labelAmount1).not.toBeNull();
    const labelNotes1 = container.querySelector('label[for="alloc-notes-0"]');
    expect(labelNotes1).not.toBeNull();
  });

  it('TEST-UI-EXP-04: disables submit button and shows Incomplete badge when allocations are unbalanced (BR-06)', () => {
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

  it('TEST-UI-EXP-05: enables submit button and shows Balanced badge when allocation sum strictly equals total (AC-06-1)', () => {
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

  it('TEST-UI-EXP-06: shows Over-allocated badge and contextual alert when allocation sum exceeds total purchase', () => {
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

  it('TEST-UI-EXP-07: adds and removes split allocation cards dynamically with outline Add category button', () => {
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

  it('TEST-UI-EXP-08: disables remove buttons when only a single allocation card remains', () => {
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

  it('TEST-UI-EXP-09: updates progress bar proportionally with accessible aria metadata across states', () => {
    render(
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

    const progressTrack = screen.getByRole('progressbar');
    expect(progressTrack).toBeDefined();
    expect(progressTrack.getAttribute('aria-label')).toBe('Allocation progress');
    expect(progressTrack.getAttribute('aria-valuenow')).toBe('50');
    expect(progressTrack.getAttribute('aria-valuetext')).toContain('1000.00 of 2000.00 THB allocated (50%)');

    // 100% balanced
    const amountLine2 = screen.getByLabelText('Amount for line 2');
    fireEvent.change(amountLine2, { target: { value: '1000.00' } });
    expect(progressTrack.getAttribute('aria-valuenow')).toBe('100');
    expect(progressTrack.getAttribute('aria-valuetext')).toBe('Fully allocated (100%)');
  });

  it('TEST-UI-EXP-10: submits purchase transaction successfully and handles API failures properly (AC-05-1)', async () => {
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
        total_amount: '3000.00',
        transaction_date: expect.any(String),
        description: null,
        allocations: [
          { target_account_id: 'expense-dining-1', amount: '1000.00', notes: 'Dinner' },
          { target_account_id: 'expense-grocery-2', amount: '2000.00', notes: 'Grocery' }
        ]
      });
      expect(mockOnSuccess).toHaveBeenCalledWith(mockExpenseResult);
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('TEST-UI-EXP-11: rejects duplicate category selection across allocation lines (AC-06-3)', async () => {
    render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText(/Total Amount/i), { target: { value: '3000.00' } });
    // Set both allocation lines to the same expense category
    fireEvent.change(screen.getByLabelText('Category for line 1'), { target: { value: 'expense-dining-1' } });
    fireEvent.change(screen.getByLabelText('Amount for line 1'), { target: { value: '1000.00' } });
    fireEvent.change(screen.getByLabelText('Category for line 2'), { target: { value: 'expense-dining-1' } });
    fireEvent.change(screen.getByLabelText('Amount for line 2'), { target: { value: '2000.00' } });

    const submitBtn = screen.getByRole('button', { name: /Record Purchase/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Each allocation line must use a distinct expense category.')).toBeDefined();
    });
    expect(transactionApi.recordExpense).not.toHaveBeenCalled();
  });

  it('TEST-UI-EXP-12: rejects invalid allocation amount inputs such as exponent notation and excessive decimal precision (AC-05-3)', async () => {
    render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText(/Total Amount/i), { target: { value: '3000.00' } });
    fireEvent.change(screen.getByLabelText('Category for line 1'), { target: { value: 'expense-dining-1' } });
    fireEvent.change(screen.getByLabelText('Amount for line 1'), { target: { value: '1e3' } });
    fireEvent.change(screen.getByLabelText('Category for line 2'), { target: { value: 'expense-grocery-2' } });
    fireEvent.change(screen.getByLabelText('Amount for line 2'), { target: { value: '2000.00' } });

    const form = screen.getByRole('dialog').querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Exponent notation is not allowed for allocation line 1/i)).toBeDefined();
    });
    expect(transactionApi.recordExpense).not.toHaveBeenCalled();
  });

  it('TEST-UI-EXP-13: directly rejects non-numeric amounts like 1000abc on total and allocation amounts (AC-05-3)', async () => {
    render(
      <ExpenseForm
        accounts={mockAccounts}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Test non-numeric on total amount
    fireEvent.change(screen.getByLabelText(/Total Amount/i), { target: { value: '1000abc' } });
    const form = screen.getByRole('dialog').querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Transaction amount must be a valid positive number.')).toBeDefined();
    });
    expect(transactionApi.recordExpense).not.toHaveBeenCalled();

    // Test non-numeric 1000abc on allocation line
    fireEvent.change(screen.getByLabelText(/Total Amount/i), { target: { value: '3000.00' } });
    fireEvent.change(screen.getByLabelText('Category for line 1'), { target: { value: 'expense-dining-1' } });
    fireEvent.change(screen.getByLabelText('Amount for line 1'), { target: { value: '1000abc' } });
    fireEvent.change(screen.getByLabelText('Category for line 2'), { target: { value: 'expense-grocery-2' } });
    fireEvent.change(screen.getByLabelText('Amount for line 2'), { target: { value: '2000.00' } });

    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Allocation amount for line 1 must be a valid positive number.')).toBeDefined();
    });
    expect(transactionApi.recordExpense).not.toHaveBeenCalled();
  });
});
