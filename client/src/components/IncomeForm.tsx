import React, { useState, useEffect } from 'react';
import { Account } from '../api/accountApi.js';
import { recordIncome, IncomeResponseData } from '../api/transactionApi.js';

export interface IncomeFormProps {
  accounts: Account[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: IncomeResponseData) => void;
}

export const IncomeForm: React.FC<IncomeFormProps> = ({
  accounts,
  isOpen,
  onClose,
  onSuccess
}) => {
  const cashAccounts = accounts.filter((a) => a.type === 'CASH');
  const incomeAccounts = accounts.filter((a) => a.type === 'INCOME');

  const [primaryAccountId, setPrimaryAccountId] = useState<string>('');
  const [incomeAccountId, setIncomeAccountId] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [transactionDate, setTransactionDate] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      // Default cash account to Checking Bank if available
      const defaultCash = cashAccounts.find((a) => a.name === 'Checking Bank') || cashAccounts[0];
      setPrimaryAccountId(defaultCash ? defaultCash.id : '');

      // Default income account to Salary if available
      const defaultIncome = incomeAccounts.find((a) => a.name === 'Salary') || incomeAccounts[0];
      setIncomeAccountId(defaultIncome ? defaultIncome.id : '');

      // Default transaction date to today (YYYY-MM-DD)
      const today = new Date().toISOString().split('T')[0];
      setTransactionDate(today);

      setTotalAmount('');
      setDescription('');
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, accounts]);

  if (!isOpen) return null;

  const validateForm = (): string | null => {
    if (!primaryAccountId) {
      return 'Please select a destination cash account.';
    }
    if (!incomeAccountId) {
      return 'Please select an income category account.';
    }
    if (!totalAmount || totalAmount.trim().length === 0) {
      return 'Please enter a transaction amount.';
    }

    const trimmedAmount = totalAmount.trim();
    if (/[eE]/.test(trimmedAmount)) {
      return 'Exponent notation is not allowed for transaction amounts.';
    }
    if (!/^-?\d+(\.\d+)?$/.test(trimmedAmount)) {
      return 'Transaction amount must be a valid positive number.';
    }

    const num = parseFloat(trimmedAmount);
    if (isNaN(num) || num <= 0) {
      return 'Transaction amount must be strictly greater than 0.00.';
    }

    const parts = trimmedAmount.split('.');
    if (parts.length === 2 && parts[1].length > 2) {
      return 'Transaction amount allows at most 2 decimal places.';
    }

    if (num > 9999999999.99) {
      return 'Transaction amount exceeds maximum allowed limit (9,999,999,999.99).';
    }

    if (!transactionDate || transactionDate.trim().length === 0) {
      return 'Please select a transaction date.';
    }

    if (description && description.length > 255) {
      return 'Description cannot exceed 255 characters.';
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
      const data = await recordIncome({
        primary_account_id: primaryAccountId,
        income_account_id: incomeAccountId,
        total_amount: totalAmount.trim(),
        transaction_date: transactionDate.trim(),
        description: description.trim() ? description.trim() : null
      });

      onSuccess(data);
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        'Failed to record income transaction. Please check your inputs and try again.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal show d-block"
      tabIndex={-1}
      role="dialog"
      aria-labelledby="record-income-title"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content border-0 shadow">
          <div className="modal-header bg-success text-white">
            <h5 className="modal-title fw-bold" id="record-income-title">
              Record Income Transaction
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              aria-label="Close"
              onClick={onClose}
              disabled={isSubmitting}
            />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body p-4">
              {errorMessage && (
                <div className="alert alert-danger mb-3" role="alert">
                  {errorMessage}
                </div>
              )}

              {cashAccounts.length === 0 || incomeAccounts.length === 0 ? (
                <div className="alert alert-warning" role="alert">
                  You need at least one Cash account and one Income category account to record an income transaction.
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <label htmlFor="primary-account-select" className="form-label fw-semibold">
                      Destination Cash Account <span className="text-danger">*</span>
                    </label>
                    <select
                      id="primary-account-select"
                      className="form-select"
                      value={primaryAccountId}
                      onChange={(e) => setPrimaryAccountId(e.target.value)}
                      disabled={isSubmitting}
                      required
                    >
                      {cashAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} (Current: ฿{(acc.current_balance ?? acc.opening_balance).toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="income-account-select" className="form-label fw-semibold">
                      Income Category <span className="text-danger">*</span>
                    </label>
                    <select
                      id="income-account-select"
                      className="form-select"
                      value={incomeAccountId}
                      onChange={(e) => setIncomeAccountId(e.target.value)}
                      disabled={isSubmitting}
                      required
                    >
                      {incomeAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="income-amount-input" className="form-label fw-semibold">
                      Amount (THB) <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">฿</span>
                      <input
                        id="income-amount-input"
                        type="text"
                        className="form-control"
                        placeholder="0.00"
                        value={totalAmount}
                        onChange={(e) => setTotalAmount(e.target.value)}
                        disabled={isSubmitting}
                        required
                      />
                    </div>
                    <small className="form-text text-muted">
                      Positive decimal amount with up to 2 decimal places (e.g. 20000.00).
                    </small>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="income-date-input" className="form-label fw-semibold">
                      Transaction Date <span className="text-danger">*</span>
                    </label>
                    <input
                      id="income-date-input"
                      type="date"
                      className="form-control"
                      value={transactionDate}
                      onChange={(e) => setTransactionDate(e.target.value)}
                      disabled={isSubmitting}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label htmlFor="income-desc-input" className="form-label fw-semibold">
                      Description (Optional)
                    </label>
                    <input
                      id="income-desc-input"
                      type="text"
                      className="form-control"
                      placeholder="e.g. Monthly Salary"
                      maxLength={255}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer bg-light">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-success"
                disabled={
                  isSubmitting ||
                  cashAccounts.length === 0 ||
                  incomeAccounts.length === 0
                }
              >
                {isSubmitting ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    />
                    Recording...
                  </>
                ) : (
                  'Record Income'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
