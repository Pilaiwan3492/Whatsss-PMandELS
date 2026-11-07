import React, { useState, useEffect } from 'react';
import { Account } from '../api/accountApi.js';
import { recordExpense, ExpenseResponseData, AllocationLinePayload } from '../api/transactionApi.js';
import './ExpenseForm.css';

export interface ExpenseFormProps {
  accounts: Account[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: ExpenseResponseData) => void;
}

interface AllocationRow {
  target_account_id: string;
  amount: string;
  notes: string;
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({
  accounts,
  isOpen,
  onClose,
  onSuccess
}) => {
  const creditCardAccounts = accounts.filter((a) => a.type === 'LOAN_TAKEN');
  const expenseAccounts = accounts.filter((a) => a.type === 'EXPENSE');

  const [primaryAccountId, setPrimaryAccountId] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [transactionDate, setTransactionDate] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      // Default primary credit card account
      const defaultCC =
        creditCardAccounts.find((a) => a.name.toLowerCase().includes('credit')) ||
        creditCardAccounts[0];
      setPrimaryAccountId(defaultCC ? defaultCC.id : '');

      // Default transaction date to YYYY-MM-DD
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      setTransactionDate(`${year}-${month}-${day}`);

      setTotalAmount('');
      setDescription('');
      setErrorMessage(null);
      setIsSubmitting(false);

      // Default with 2 split allocation lines (Dining and Grocery if available)
      const dining =
        expenseAccounts.find((a) => a.name.toLowerCase().includes('dining')) ||
        expenseAccounts[0];
      const grocery =
        expenseAccounts.find((a) => a.name.toLowerCase().includes('grocery')) ||
        expenseAccounts[1] ||
        expenseAccounts[0];

      setAllocations([
        {
          target_account_id: dining ? dining.id : '',
          amount: '',
          notes: ''
        },
        {
          target_account_id: grocery ? grocery.id : '',
          amount: '',
          notes: ''
        }
      ]);
    }
  }, [isOpen, accounts]);

  if (!isOpen) return null;

  // Integer cents calculation for arbitrary decimal precision without float drift
  const toCents = (valStr: string): number => {
    const trimmed = valStr.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0;
    const parts = trimmed.split('.');
    const whole = parseInt(parts[0], 10);
    const fraction = parts[1] ? parseInt(parts[1].padEnd(2, '0').slice(0, 2), 10) : 0;
    return whole * 100 + fraction;
  };

  const totalCents = toCents(totalAmount);
  const allocatedCents = allocations.reduce((sum, row) => sum + toCents(row.amount), 0);
  const remainingCents = totalCents - allocatedCents;
  const remaining = remainingCents / 100;
  const roundedTotal = totalCents / 100;
  const roundedSum = allocatedCents / 100;

  const isBalanced =
    totalCents > 0 &&
    remainingCents === 0 &&
    allocations.length > 0 &&
    allocations.every((row) => toCents(row.amount) > 0);

  const handleAddSplitLine = () => {
    const defaultExpense = expenseAccounts[0];
    setAllocations([
      ...allocations,
      {
        target_account_id: defaultExpense ? defaultExpense.id : '',
        amount: '',
        notes: ''
      }
    ]);
  };

  const handleRemoveSplitLine = (index: number) => {
    if (allocations.length <= 1) return;
    setAllocations(allocations.filter((_, i) => i !== index));
  };

  const handleAllocationChange = (index: number, field: keyof AllocationRow, value: string) => {
    const updated = [...allocations];
    updated[index] = { ...updated[index], [field]: value };
    setAllocations(updated);
  };

  const validateForm = (): string | null => {
    if (!primaryAccountId) {
      return 'Please select a primary credit card account.';
    }
    if (!totalAmount || totalAmount.trim().length === 0) {
      return 'Please enter a total transaction amount.';
    }

    const trimmedTotal = totalAmount.trim();
    if (/[eE]/.test(trimmedTotal)) {
      return 'Exponent notation is not allowed for transaction amounts.';
    }
    if (!/^-?\d+(\.\d+)?$/.test(trimmedTotal)) {
      return 'Transaction amount must be a valid positive number.';
    }
    const num = parseFloat(trimmedTotal);
    if (isNaN(num) || num <= 0) {
      return 'Transaction amount must be strictly greater than 0.00.';
    }
    const parts = trimmedTotal.split('.');
    if (parts.length === 2 && parts[1].length > 2) {
      return 'Transaction amount allows at most 2 decimal places.';
    }

    if (!transactionDate || transactionDate.trim().length === 0) {
      return 'Please select a transaction date.';
    }

    if (allocations.length === 0) {
      return 'At least one allocation line is required.';
    }

    const seenCategories = new Set<string>();
    for (let i = 0; i < allocations.length; i++) {
      const row = allocations[i];
      if (!row.target_account_id) {
        return `Please select an expense category for allocation line ${i + 1}.`;
      }
      if (seenCategories.has(row.target_account_id)) {
        return 'Each allocation line must use a distinct expense category.';
      }
      seenCategories.add(row.target_account_id);

      if (!row.amount || row.amount.trim().length === 0) {
        return `Please enter an amount for allocation line ${i + 1}.`;
      }
      const rawAmount = row.amount.trim();
      if (/[eE]/.test(rawAmount)) {
        return `Exponent notation is not allowed for allocation line ${i + 1}.`;
      }
      if (!/^-?\d+(\.\d+)?$/.test(rawAmount)) {
        return `Allocation amount for line ${i + 1} must be a valid positive number.`;
      }
      const rowNum = parseFloat(rawAmount);
      if (isNaN(rowNum) || rowNum <= 0) {
        return `Allocation amount for line ${i + 1} must be strictly greater than 0.00.`;
      }
      const rowParts = rawAmount.split('.');
      if (rowParts.length === 2 && rowParts[1].length > 2) {
        return `Allocation line ${i + 1} allows at most 2 decimal places.`;
      }
    }

    if (!isBalanced) {
      return `Total amount must equal the sum of all allocation lines. Remaining to allocate: ${remaining.toFixed(2)} THB.`;
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payloadAllocations: AllocationLinePayload[] = allocations.map((row) => ({
        target_account_id: row.target_account_id,
        amount: row.amount.trim(),
        notes: row.notes.trim() ? row.notes.trim() : null
      }));

      const data = await recordExpense({
        primary_account_id: primaryAccountId,
        total_amount: totalAmount.trim(),
        transaction_date: transactionDate.trim(),
        description: description.trim() ? description.trim() : null,
        allocations: payloadAllocations
      });

      onSuccess(data);
      onClose();
    } catch (err: any) {
      const backendError = err.response?.data?.error;
      if (backendError?.message) {
        setErrorMessage(backendError.message);
      } else {
        setErrorMessage('Failed to record purchase transaction. Please check inputs.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Allocation progress percentage
  const progressPercent =
    roundedTotal > 0 ? Math.min(100, Math.max(0, (roundedSum / roundedTotal) * 100)) : 0;

  return (
    <div
      className="expense-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-modal-title"
    >
      <div className="expense-modal-container">
        {/* A. Modal Header */}
        <div className="expense-modal-header">
          <div>
            <h2 id="expense-modal-title" className="expense-modal-title">
              Record Purchase
            </h2>
            <p className="expense-modal-subtitle">
              Add a new credit card transaction.
            </p>
          </div>
          <button
            type="button"
            className="expense-close-btn"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={isSubmitting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="expense-form">
          <div className="expense-modal-body">
            {/* Error Message Alert */}
            {errorMessage && (
              <div className="expense-error-alert" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="expense-error-icon">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* B. Purchase Details (Section 01) */}
            <div className="expense-section">
              <div>
                <span className="expense-section-tag">01 — Purchase Details</span>
                <h3 className="expense-section-title">Credit Card & Transaction Header</h3>
                <p className="expense-section-desc">Select the funding credit account and specify the total purchase amount.</p>
              </div>

              {/* Credit Card Account (Full Width) */}
              <div className="expense-field-group">
                <label htmlFor="primaryAccountId" className="expense-label">
                  Credit Card <span className="expense-required-star" aria-hidden="true">*</span>
                </label>
                <select
                  id="primaryAccountId"
                  className="expense-select"
                  value={primaryAccountId}
                  onChange={(e) => setPrimaryAccountId(e.target.value)}
                  disabled={isSubmitting}
                  aria-label="Credit Card"
                >
                  <option value="">Select a credit card</option>
                  {creditCardAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (Debt: ฿{acc.current_balance !== undefined ? acc.current_balance.toFixed(2) : '0.00'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Total Amount (Prominent Hero Field) */}
              <div className="expense-field-group">
                <label htmlFor="totalAmount" className="expense-label">
                  Total Amount <span className="expense-required-star" aria-hidden="true">*</span>
                </label>
                <div className="expense-amount-wrapper">
                  <span className="expense-currency-symbol">฿</span>
                  <input
                    type="number"
                    step="0.01"
                    id="totalAmount"
                    className="expense-input expense-amount-input"
                    placeholder="0.00"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    disabled={isSubmitting}
                    aria-label="Total Amount"
                  />
                </div>
                <span className="expense-helper">Transaction amount in THB</span>
              </div>

              {/* Date & Description (2-Column Grid) */}
              <div className="expense-grid-2">
                <div className="expense-field-group">
                  <label htmlFor="transactionDate" className="expense-label">
                    Transaction Date <span className="expense-required-star" aria-hidden="true">*</span>
                  </label>
                  <input
                    type="date"
                    id="transactionDate"
                    className="expense-input"
                    value={transactionDate}
                    onChange={(e) => setTransactionDate(e.target.value)}
                    disabled={isSubmitting}
                    aria-label="Transaction Date"
                  />
                </div>

                <div className="expense-field-group">
                  <label htmlFor="description" className="expense-label">
                    Description <span className="expense-optional-badge">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    id="description"
                    className="expense-input"
                    placeholder="e.g. Weekly supermarket shopping"
                    maxLength={255}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isSubmitting}
                    aria-label="Description"
                  />
                </div>
              </div>
            </div>

            {/* C. Expense Breakdown (Section 02) */}
            <div className="expense-section">
              <div className="expense-section-header">
                <div>
                  <span className="expense-section-tag">02 — Expense Breakdown</span>
                  <h3 className="expense-section-title">Expense Allocations</h3>
                  <p className="expense-section-desc">Allocate the purchase amount across categories.</p>
                </div>
                <span className="expense-counter-badge" aria-label="Line count">
                  {allocations.length} {allocations.length === 1 ? 'line' : 'lines'}
                </span>
              </div>

              {/* Allocation Cards (Row List) */}
              <div className="expense-allocations-list" role="list">
                {allocations.map((row, idx) => {
                  const categoryId = `alloc-category-${idx}`;
                  const amountId = `alloc-amount-${idx}`;
                  const notesId = `alloc-notes-${idx}`;

                  return (
                    <div key={idx} className="expense-allocation-card" role="listitem">
                      <div className="expense-card-header">
                        <span className="expense-card-index">
                          Allocation {String(idx + 1).padStart(2, '0')}
                        </span>
                        <button
                          type="button"
                          className="expense-remove-btn"
                          onClick={() => handleRemoveSplitLine(idx)}
                          disabled={allocations.length <= 1 || isSubmitting}
                          aria-label={`Remove allocation ${idx + 1}`}
                          title="Remove split line"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                          <span>Remove</span>
                        </button>
                      </div>

                      <div className="expense-card-grid">
                        <div className="expense-field-group">
                          <label htmlFor={categoryId} className="expense-label">
                            Expense Category <span className="expense-required-star" aria-hidden="true">*</span>
                          </label>
                          <select
                            id={categoryId}
                            className="expense-select"
                            value={row.target_account_id}
                            onChange={(e) => handleAllocationChange(idx, 'target_account_id', e.target.value)}
                            disabled={isSubmitting}
                            aria-label={`Category for line ${idx + 1}`}
                          >
                            <option value="">Select expense category</option>
                            {expenseAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="expense-field-group">
                          <label htmlFor={amountId} className="expense-label">
                            Amount (THB) <span className="expense-required-star" aria-hidden="true">*</span>
                          </label>
                          <div className="expense-amount-wrapper">
                            <span className="expense-card-currency-symbol">฿</span>
                            <input
                              type="number"
                              step="0.01"
                              id={amountId}
                              className="expense-input expense-alloc-amount-input"
                              placeholder="0.00"
                              value={row.amount}
                              onChange={(e) => handleAllocationChange(idx, 'amount', e.target.value)}
                              disabled={isSubmitting}
                              aria-label={`Amount for line ${idx + 1}`}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="expense-field-group">
                        <label htmlFor={notesId} className="expense-label">
                          Notes <span className="expense-optional-badge">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          id={notesId}
                          className="expense-input expense-alloc-notes-input"
                          placeholder="e.g. Dinner with friends"
                          value={row.notes}
                          onChange={(e) => handleAllocationChange(idx, 'notes', e.target.value)}
                          disabled={isSubmitting}
                          aria-label={`Notes for line ${idx + 1}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Category Button */}
              <button
                type="button"
                className="expense-add-category-btn"
                onClick={handleAddSplitLine}
                disabled={isSubmitting}
                aria-label="Add category"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Add category</span>
              </button>
            </div>

            {/* D. Allocation Summary (Section 03) */}
            <div className="expense-summary-panel" aria-label="Allocation Summary">
              <div className="expense-summary-header">
                <h4 className="expense-summary-title">Allocation Summary</h4>
                {roundedTotal > 0 && (
                  <span
                    className={`expense-summary-badge ${
                      isBalanced ? 'balanced' : remaining < 0 ? 'over' : 'incomplete'
                    }`}
                  >
                    {isBalanced && 'Balanced'}
                    {!isBalanced && remaining > 0 && 'Incomplete'}
                    {!isBalanced && remaining < 0 && 'Over-allocated'}
                  </span>
                )}
              </div>

              {/* 3 Metric Columns */}
              <div className="expense-summary-metrics">
                <div className="expense-metric-item">
                  <span className="expense-metric-label">Total Purchase</span>
                  <span className="expense-metric-value" data-testid="summary-total">
                    ฿{roundedTotal.toFixed(2)}
                  </span>
                </div>
                <div className="expense-metric-item">
                  <span className="expense-metric-label">Allocated</span>
                  <span className="expense-metric-value" data-testid="summary-allocated">
                    ฿{roundedSum.toFixed(2)}
                  </span>
                </div>
                <div className="expense-metric-item metric-remaining">
                  <span className="expense-metric-label">Remaining</span>
                  <span
                    className={`expense-metric-value ${
                      isBalanced
                        ? 'remaining-balanced'
                        : remaining < 0
                        ? 'remaining-danger'
                        : 'remaining-warning'
                    }`}
                    data-testid="summary-remaining"
                  >
                    ฿{remaining.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Progress Bar with Full Accessibility Attributes */}
              <div
                className="expense-progress-track"
                role="progressbar"
                aria-label="Allocation progress"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={
                  isBalanced
                    ? 'Fully allocated (100%)'
                    : remaining < 0
                    ? `Over-allocated by ฿${Math.abs(remaining).toFixed(2)}`
                    : `${roundedSum.toFixed(2)} of ${roundedTotal.toFixed(2)} THB allocated (${Math.round(progressPercent)}%)`
                }
                tabIndex={0}
              >
                <div
                  className={`expense-progress-bar ${
                    isBalanced ? 'balanced' : remaining < 0 ? 'over' : 'incomplete'
                  }`}
                  style={{ width: `${Math.min(100, progressPercent)}%` }}
                />
              </div>

              {/* Contextual Status Hint */}
              <p className="expense-summary-hint">
                {isBalanced && (
                  <>
                    <span className="expense-hint-icon-balanced">✓</span>
                    <span>Fully allocated: ฿{roundedSum.toFixed(2)} of ฿{roundedTotal.toFixed(2)}. Ready to record.</span>
                  </>
                )}
                {!isBalanced && remaining > 0 && roundedTotal > 0 && (
                  <>
                    <span className="expense-hint-icon-warning">⚠</span>
                    <span>Allocate the remaining ฿{remaining.toFixed(2)} to continue.</span>
                  </>
                )}
                {!isBalanced && remaining < 0 && (
                  <>
                    <span className="expense-hint-icon-danger">✕</span>
                    <span>Over-allocated by ฿{Math.abs(remaining).toFixed(2)}. Total allocations exceed purchase amount.</span>
                  </>
                )}
                {roundedTotal <= 0 && (
                  <span>Specify a purchase amount to begin allocating across categories.</span>
                )}
              </p>
            </div>
          </div>

          {/* E. Modal Footer */}
          <div className="expense-modal-footer">
            <button
              type="button"
              className="expense-btn expense-btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="expense-btn expense-btn-primary"
              disabled={isSubmitting || !isBalanced}
            >
              {isSubmitting ? (
                <>
                  <span className="expense-spinner" aria-hidden="true" />
                  <span>Recording...</span>
                </>
              ) : (
                'Record Purchase'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
