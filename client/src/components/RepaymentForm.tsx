import React, { useState, useEffect } from 'react';
import { Account } from '../api/accountApi.js';
import { recordRepayment, RepaymentResponseData } from '../api/transactionApi.js';
import './RepaymentForm.css';

export interface RepaymentFormProps {
  accounts: Account[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: RepaymentResponseData) => void;
  initialCreditCardId?: string;
}

export const RepaymentForm: React.FC<RepaymentFormProps> = ({
  accounts,
  isOpen,
  onClose,
  onSuccess,
  initialCreditCardId
}) => {
  const cashAccounts = accounts.filter((a) => a.type === 'CASH');
  const creditCardAccounts = accounts.filter((a) => a.type === 'LOAN_TAKEN');

  const [fromAccountId, setFromAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [transactionDate, setTransactionDate] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      // Default source bank account
      const defaultBank =
        cashAccounts.find((a) => a.name.toLowerCase().includes('checking') || a.name.toLowerCase().includes('bank')) ||
        cashAccounts[0];
      setFromAccountId(defaultBank ? defaultBank.id : '');

      // Default target credit card account
      const defaultCC = initialCreditCardId
        ? creditCardAccounts.find((a) => a.id === initialCreditCardId)
        : creditCardAccounts.find((a) => a.name.toLowerCase().includes('credit')) || creditCardAccounts[0];
      setToAccountId(defaultCC ? defaultCC.id : '');

      // Default transaction date to YYYY-MM-DD
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      setTransactionDate(`${year}-${month}-${day}`);

      setAmount('');
      setDescription('Credit Card Repayment');
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, accounts, initialCreditCardId]);

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

  const formatCurrency = (val: number): string => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 2
    }).format(val);
  };

  const selectedBank = cashAccounts.find((a) => a.id === fromAccountId);
  const selectedCC = creditCardAccounts.find((a) => a.id === toAccountId);

  const bankBalanceCents = Math.round(
    Number(selectedBank?.current_balance ?? selectedBank?.opening_balance ?? 0) * 100
  );
  const debtCents = Math.round(
    Number(selectedCC?.current_balance ?? selectedCC?.opening_balance ?? 0) * 100
  );

  const amountCents = toCents(amount);
  const isExceedingDebt = amountCents > debtCents && debtCents > 0;
  const isInsufficientFunds = amountCents > bankBalanceCents;

  const remainingCashCents = bankBalanceCents - amountCents;
  const remainingDebtCents = Math.max(0, debtCents - amountCents);

  const isFormValid =
    fromAccountId.length > 0 &&
    toAccountId.length > 0 &&
    amountCents > 0 &&
    /^\d+(\.\d{1,2})?$/.test(amount.trim()) &&
    !isExceedingDebt &&
    !isInsufficientFunds;

  const handlePayFullDebt = () => {
    if (debtCents > 0) {
      setAmount((debtCents / 100).toFixed(2));
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fromAccountId) {
      setErrorMessage('Please select a source bank account.');
      return;
    }
    if (!toAccountId) {
      setErrorMessage('Please select a target credit card account.');
      return;
    }

    const trimmedAmount = amount.trim();
    if (!trimmedAmount || !/^\d+(\.\d{1,2})?$/.test(trimmedAmount)) {
      setErrorMessage('Please enter a valid positive repayment amount (e.g. 3000.00).');
      return;
    }

    if (amountCents <= 0) {
      setErrorMessage('Repayment amount must be strictly greater than 0.00 THB.');
      return;
    }

    if (isExceedingDebt) {
      setErrorMessage(
        `Repayment amount (${formatCurrency(amountCents / 100)}) exceeds outstanding debt of ${formatCurrency(debtCents / 100)}.`
      );
      return;
    }

    if (isInsufficientFunds) {
      setErrorMessage(
        `Insufficient funds in source account. Available balance is ${formatCurrency(bankBalanceCents / 100)}.`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await recordRepayment({
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: (amountCents / 100).toFixed(2),
        transaction_date: transactionDate,
        description: description.trim() || null
      });

      onSuccess(response);
      onClose();
    } catch (err: any) {
      const serverMsg =
        err?.response?.data?.error?.message ||
        err?.message ||
        'Failed to record credit card repayment.';
      setErrorMessage(serverMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="repayment-modal-backdrop"
      role="dialog"
      aria-labelledby="repaymentModalTitle"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="repayment-modal-container">
        {/* Header */}
        <div className="repayment-modal-header">
          <div>
            <h3 id="repaymentModalTitle" className="repayment-modal-title">
              Credit Card Repayment
            </h3>
            <p className="repayment-modal-subtitle">
              Settle outstanding credit card debt from your liquid cash account (WP-05, F-07).
            </p>
          </div>
          <button
            type="button"
            className="repayment-close-btn"
            aria-label="Close Repayment Modal"
            onClick={onClose}
            disabled={isSubmitting}
          >
            &times;
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="repayment-modal-body">
            {errorMessage && (
              <div className="repayment-alert-error" role="alert">
                {errorMessage}
              </div>
            )}

            {/* Source & Target Accounts */}
            <div className="repayment-section">
              <div className="repayment-section-title">
                <span>Account Routing</span>
              </div>

              <div className="repayment-form-group">
                <label htmlFor="fromAccountSelect" className="repayment-label">
                  <span>Pay From (Source Cash Account)</span>
                  {selectedBank && (
                    <span className="repayment-balance-pill cash">
                      Available: {formatCurrency(bankBalanceCents / 100)}
                    </span>
                  )}
                </label>
                <select
                  id="fromAccountSelect"
                  className={`repayment-select ${isInsufficientFunds ? 'has-error' : ''}`}
                  value={fromAccountId}
                  onChange={(e) => setFromAccountId(e.target.value)}
                  disabled={isSubmitting}
                  required
                >
                  <option value="" disabled>
                    Select source bank account...
                  </option>
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatCurrency(Number(a.current_balance ?? a.opening_balance))})
                    </option>
                  ))}
                </select>
              </div>

              <div className="repayment-form-group">
                <label htmlFor="toAccountSelect" className="repayment-label">
                  <span>Settle Debt For (Target Credit Card)</span>
                  {selectedCC && (
                    <span className="repayment-balance-pill debt">
                      Current Debt: {formatCurrency(debtCents / 100)}
                    </span>
                  )}
                </label>
                <select
                  id="toAccountSelect"
                  className={`repayment-select ${isExceedingDebt ? 'has-error' : ''}`}
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  disabled={isSubmitting}
                  required
                >
                  <option value="" disabled>
                    Select credit card account...
                  </option>
                  {creditCardAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (Debt: {formatCurrency(Number(a.current_balance ?? a.opening_balance))})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Payment Details */}
            <div className="repayment-section">
              <div className="repayment-section-title">
                <span>Payment Details</span>
                {debtCents > 0 && (
                  <button
                    type="button"
                    className="repayment-quick-action-btn"
                    onClick={handlePayFullDebt}
                    disabled={isSubmitting}
                  >
                    Pay Full Debt ({formatCurrency(debtCents / 100)})
                  </button>
                )}
              </div>

              <div className="repayment-form-group">
                <label htmlFor="repaymentAmountInput" className="repayment-label">
                  <span>Repayment Amount (THB)</span>
                  {isExceedingDebt && (
                    <span className="text-danger small fw-semibold">
                      Exceeds debt ({formatCurrency(debtCents / 100)})
                    </span>
                  )}
                  {isInsufficientFunds && !isExceedingDebt && (
                    <span className="text-danger small fw-semibold">
                      Exceeds bank balance ({formatCurrency(bankBalanceCents / 100)})
                    </span>
                  )}
                </label>
                <input
                  id="repaymentAmountInput"
                  type="text"
                  inputMode="decimal"
                  className={`repayment-input amount-input ${
                    isExceedingDebt || isInsufficientFunds ? 'has-error' : ''
                  }`}
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="repayment-form-group">
                <label htmlFor="repaymentDateInput" className="repayment-label">
                  <span>Transaction Date</span>
                </label>
                <input
                  id="repaymentDateInput"
                  type="date"
                  className="repayment-input"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="repayment-form-group">
                <label htmlFor="repaymentDescriptionInput" className="repayment-label">
                  <span>Description (Optional)</span>
                </label>
                <input
                  id="repaymentDescriptionInput"
                  type="text"
                  className="repayment-input"
                  placeholder="e.g. November credit card bill settlement"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSubmitting}
                  maxLength={255}
                />
              </div>
            </div>

            {/* Live Balance Impact Preview */}
            {amountCents > 0 && !isExceedingDebt && !isInsufficientFunds && (
              <div className="repayment-preview-card">
                <div className="repayment-preview-item">
                  <span className="repayment-preview-label">New Bank Balance</span>
                  <span className="repayment-preview-value text-success">
                    {formatCurrency(remainingCashCents / 100)}
                  </span>
                </div>
                <div className="repayment-preview-item">
                  <span className="repayment-preview-label">New Credit Debt</span>
                  <span className={`repayment-preview-value ${remainingDebtCents === 0 ? 'text-primary' : 'text-danger'}`}>
                    {remainingDebtCents === 0 ? '0.00 THB (Fully Settled)' : formatCurrency(remainingDebtCents / 100)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="repayment-modal-footer">
            <button
              type="button"
              className="repayment-btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="repayment-btn-primary"
              disabled={!isFormValid || isSubmitting}
            >
              {isSubmitting ? 'Processing Repayment...' : 'Confirm Repayment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
