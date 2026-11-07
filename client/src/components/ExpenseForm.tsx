import React, { useState, useEffect } from 'react';
import { Account } from '../api/accountApi.js';
import { recordExpense, ExpenseResponseData, AllocationLinePayload } from '../api/transactionApi.js';

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
      const defaultCC = creditCardAccounts.find((a) => a.name.toLowerCase().includes('credit')) || creditCardAccounts[0];
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
      const dining = expenseAccounts.find((a) => a.name.toLowerCase().includes('dining')) || expenseAccounts[0];
      const grocery = expenseAccounts.find((a) => a.name.toLowerCase().includes('grocery')) || expenseAccounts[1] || expenseAccounts[0];

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

  // Calculate allocation sum and remaining to allocate
  const parsedTotal = parseFloat(totalAmount) || 0;
  const parsedAllocSum = allocations.reduce((sum, row) => {
    const val = parseFloat(row.amount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const roundedTotal = Math.round(parsedTotal * 100) / 100;
  const roundedSum = Math.round(parsedAllocSum * 100) / 100;
  const remaining = Math.round((roundedTotal - roundedSum) * 100) / 100;
  const isBalanced = roundedTotal > 0 && Math.abs(remaining) < 0.001;

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

    for (let i = 0; i < allocations.length; i++) {
      const row = allocations[i];
      if (!row.target_account_id) {
        return `Please select an expense category for allocation line ${i + 1}.`;
      }
      if (!row.amount || row.amount.trim().length === 0) {
        return `Please enter an amount for allocation line ${i + 1}.`;
      }
      const rowNum = parseFloat(row.amount.trim());
      if (isNaN(rowNum) || rowNum <= 0) {
        return `Allocation amount for line ${i + 1} must be strictly greater than 0.00.`;
      }
      const rowParts = row.amount.trim().split('.');
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
        amount: parseFloat(row.amount.trim()),
        notes: row.notes.trim() ? row.notes.trim() : null
      }));

      const data = await recordExpense({
        primary_account_id: primaryAccountId,
        total_amount: parseFloat(totalAmount.trim()),
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

  return (
    <div
      className="modal show d-block"
      tabIndex={-1}
      role="dialog"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Record Credit Card Purchase</h5>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={onClose}
              disabled={isSubmitting}
            />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {errorMessage && (
                <div className="alert alert-danger" role="alert">
                  {errorMessage}
                </div>
              )}

              <div className="row g-3">
                <div className="col-md-6">
                  <label htmlFor="primaryAccountId" className="form-label">
                    Primary Account (Credit Card)
                  </label>
                  <select
                    id="primaryAccountId"
                    className="form-select"
                    value={primaryAccountId}
                    onChange={(e) => setPrimaryAccountId(e.target.value)}
                    disabled={isSubmitting}
                  >
                    <option value="">-- Select Credit Card --</option>
                    {creditCardAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} (Debt: ฿{acc.current_balance !== undefined ? acc.current_balance.toFixed(2) : '0.00'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label htmlFor="totalAmount" className="form-label">
                    Total Amount (THB)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    id="totalAmount"
                    className="form-control"
                    placeholder="e.g. 3000.00"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="col-md-6">
                  <label htmlFor="transactionDate" className="form-label">
                    Transaction Date
                  </label>
                  <input
                    type="date"
                    id="transactionDate"
                    className="form-control"
                    value={transactionDate}
                    onChange={(e) => setTransactionDate(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="col-md-6">
                  <label htmlFor="description" className="form-label">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    id="description"
                    className="form-control"
                    placeholder="e.g. Weekly supermarket shopping"
                    maxLength={255}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <hr className="my-4" />

              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0">Multi-Line Split Allocations Breakdown (F-06, BR-05, BR-06)</h6>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={handleAddSplitLine}
                  disabled={isSubmitting}
                >
                  + Add Split Line
                </button>
              </div>

              {/* Balance Status indicator */}
              <div className="mb-3">
                {parsedTotal > 0 && (
                  <div>
                    {isBalanced ? (
                      <span className="badge bg-success p-2">
                        ✓ Balanced: Allocated ฿{roundedSum.toFixed(2)} of ฿{roundedTotal.toFixed(2)}
                      </span>
                    ) : (
                      <span className="badge bg-warning text-dark p-2">
                        ⚠ Unbalanced: Remaining to allocate: ฿{remaining.toFixed(2)} (Allocated ฿{roundedSum.toFixed(2)} / Total ฿{roundedTotal.toFixed(2)})
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="table-responsive">
                <table className="table table-bordered align-middle">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: '40%' }}>Expense Category</th>
                      <th style={{ width: '25%' }}>Amount (THB)</th>
                      <th style={{ width: '25%' }}>Notes (Optional)</th>
                      <th style={{ width: '10%' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((row, idx) => (
                      <tr key={idx}>
                        <td>
                          <select
                            className="form-select form-select-sm"
                            value={row.target_account_id}
                            onChange={(e) => handleAllocationChange(idx, 'target_account_id', e.target.value)}
                            disabled={isSubmitting}
                            aria-label={`Category for line ${idx + 1}`}
                          >
                            <option value="">-- Select Category --</option>
                            {expenseAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            className="form-control form-control-sm"
                            placeholder="0.00"
                            value={row.amount}
                            onChange={(e) => handleAllocationChange(idx, 'amount', e.target.value)}
                            disabled={isSubmitting}
                            aria-label={`Amount for line ${idx + 1}`}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="e.g. Dinner"
                            value={row.notes}
                            onChange={(e) => handleAllocationChange(idx, 'notes', e.target.value)}
                            disabled={isSubmitting}
                            aria-label={`Notes for line ${idx + 1}`}
                          />
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => handleRemoveSplitLine(idx)}
                            disabled={allocations.length <= 1 || isSubmitting}
                            title="Remove split line"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || !isBalanced}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                    Recording Purchase...
                  </>
                ) : (
                  'Record Purchase'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
