import React, { useState, useEffect } from 'react';
import { Account } from '../api/accountApi.js';
import {
  recordLoanGiven,
  recordLoanRecovery,
  recordLoanBorrowing,
  recordLoanRepayment
} from '../api/transactionApi.js';

export type LoanOperationMode =
  | 'LOAN_GIVEN'
  | 'LOAN_RECOVERY'
  | 'LOAN_BORROWING'
  | 'LOAN_REPAYMENT';

export interface LoanFormProps {
  accounts: Account[];
  isOpen: boolean;
  initialMode?: LoanOperationMode;
  initialLoanAccountId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const LoanForm: React.FC<LoanFormProps> = ({
  accounts,
  isOpen,
  initialMode = 'LOAN_GIVEN',
  initialLoanAccountId,
  onClose,
  onSuccess
}) => {
  const cashAccounts = accounts.filter((a) => a.type === 'CASH' && !a.is_archived);
  const loanGivenAccounts = accounts.filter((a) => a.type === 'LOAN_GIVEN' && !a.is_archived);
  const generalLoanAccounts = accounts.filter(
    (a) => a.type === 'LOAN_TAKEN' && a.subtype === 'GENERAL_LOAN' && !a.is_archived
  );

  const [mode, setMode] = useState<LoanOperationMode>(initialMode);
  const [cashAccountId, setCashAccountId] = useState<string>('');
  const [loanAccountId, setLoanAccountId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [transactionDate, setTransactionDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [description, setDescription] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setCashAccountId(cashAccounts[0]?.id || '');

      const isPeerLending = initialMode === 'LOAN_GIVEN' || initialMode === 'LOAN_RECOVERY';
      const targetPool = isPeerLending ? loanGivenAccounts : generalLoanAccounts;

      if (initialLoanAccountId && targetPool.some((a) => a.id === initialLoanAccountId)) {
        setLoanAccountId(initialLoanAccountId);
      } else {
        setLoanAccountId(targetPool[0]?.id || '');
      }

      setAmount('');
      setDescription('');
      setErrorMessage(null);
    }
  }, [isOpen, initialMode, initialLoanAccountId, accounts]);

  const handleModeChange = (nextMode: LoanOperationMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    const isPeerLending = nextMode === 'LOAN_GIVEN' || nextMode === 'LOAN_RECOVERY';
    const targetPool = isPeerLending ? loanGivenAccounts : generalLoanAccounts;
    setLoanAccountId(targetPool[0]?.id || '');
  };

  if (!isOpen) return null;

  const isPeerLendingMode = mode === 'LOAN_GIVEN' || mode === 'LOAN_RECOVERY';
  const activeLoanPool = isPeerLendingMode ? loanGivenAccounts : generalLoanAccounts;

  const formatCurrency = (val: number) => {
    return `${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!cashAccountId) {
      setErrorMessage('Please select a Cash account.');
      return;
    }
    if (!loanAccountId) {
      setErrorMessage(
        isPeerLendingMode
          ? 'Please select a Loan Given (Receivable) account.'
          : 'Please select a General Loan (Liability) account.'
      );
      return;
    }

    const trimmedAmt = amount.trim();
    if (!trimmedAmt || /[eE]/.test(trimmedAmt) || !/^-?\d+(\.\d+)?$/.test(trimmedAmt)) {
      setErrorMessage('Amount must be a valid positive decimal.');
      return;
    }

    const numAmt = Number(trimmedAmt);
    if (!Number.isFinite(numAmt) || numAmt <= 0) {
      setErrorMessage('Amount must be strictly greater than 0.00.');
      return;
    }

    const parts = trimmedAmt.split('.');
    if (parts.length === 2 && parts[1].length > 2) {
      setErrorMessage('Amount allows at most 2 decimal places.');
      return;
    }

    if (!transactionDate || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      setErrorMessage('Please provide a valid transaction date (YYYY-MM-DD).');
      return;
    }

    if (description.length > 255) {
      setErrorMessage('Description cannot exceed 255 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanDesc = description.trim() || null;

      if (mode === 'LOAN_GIVEN') {
        await recordLoanGiven({
          from_account_id: cashAccountId,
          to_account_id: loanAccountId,
          amount: trimmedAmt,
          transaction_date: transactionDate,
          description: cleanDesc
        });
      } else if (mode === 'LOAN_RECOVERY') {
        await recordLoanRecovery({
          from_account_id: loanAccountId,
          to_account_id: cashAccountId,
          amount: trimmedAmt,
          transaction_date: transactionDate,
          description: cleanDesc
        });
      } else if (mode === 'LOAN_BORROWING') {
        await recordLoanBorrowing({
          from_account_id: loanAccountId,
          to_account_id: cashAccountId,
          amount: trimmedAmt,
          transaction_date: transactionDate,
          description: cleanDesc
        });
      } else {
        await recordLoanRepayment({
          from_account_id: cashAccountId,
          to_account_id: loanAccountId,
          amount: trimmedAmt,
          transaction_date: transactionDate,
          description: cleanDesc
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.error?.message || 'Failed to record loan transaction. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal show d-block"
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-labelledby="loanModalTitle"
      aria-modal="true"
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content shadow">
          <div className="modal-header">
            <h5 className="modal-title fw-bold" id="loanModalTitle">
              Peer Lending &amp; General Loan Transactions
            </h5>
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
                <div className="alert alert-danger py-2 small" role="alert">
                  {errorMessage}
                </div>
              )}

              <div className="mb-3">
                <label htmlFor="loanOperationModeSelect" className="form-label fw-semibold">
                  Loan Transaction Type
                </label>
                <select
                  id="loanOperationModeSelect"
                  className="form-select"
                  value={mode}
                  onChange={(e) => handleModeChange(e.target.value as LoanOperationMode)}
                >
                  <option value="LOAN_GIVEN">Disburse Loan Given (Cash &rarr; Loan Given)</option>
                  <option value="LOAN_RECOVERY">Recover Loan Given (Loan Given &rarr; Cash)</option>
                  <option value="LOAN_BORROWING">Record Money Borrowed (General Loan &rarr; Cash)</option>
                  <option value="LOAN_REPAYMENT">Repay General Loan (Cash &rarr; General Loan)</option>
                </select>
              </div>

              <div className="mb-3">
                <label htmlFor="loanCashAccountSelect" className="form-label fw-semibold">
                  {mode === 'LOAN_GIVEN' || mode === 'LOAN_REPAYMENT'
                    ? 'From Cash Account'
                    : 'To Cash Account'}
                </label>
                <select
                  id="loanCashAccountSelect"
                  className="form-select"
                  value={cashAccountId}
                  onChange={(e) => setCashAccountId(e.target.value)}
                  required
                >
                  <option value="">Select cash account...</option>
                  {cashAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (Available: {formatCurrency(Number(acc.current_balance ?? acc.opening_balance))})
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label htmlFor="loanTargetAccountSelect" className="form-label fw-semibold">
                  {mode === 'LOAN_GIVEN'
                    ? 'To Loan Given (Receivable) Account'
                    : mode === 'LOAN_RECOVERY'
                    ? 'From Loan Given (Receivable) Account'
                    : mode === 'LOAN_BORROWING'
                    ? 'From General Loan (Liability) Account'
                    : 'To General Loan (Liability) Account'}
                </label>
                <select
                  id="loanTargetAccountSelect"
                  className="form-select"
                  value={loanAccountId}
                  onChange={(e) => setLoanAccountId(e.target.value)}
                  required
                >
                  <option value="">
                    {isPeerLendingMode
                      ? 'Select loan given account...'
                      : 'Select general loan account...'}
                  </option>
                  {activeLoanPool.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({isPeerLendingMode ? 'Receivable' : 'Debt'}:{' '}
                      {formatCurrency(Number(acc.current_balance ?? acc.opening_balance))})
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label htmlFor="loanAmountInput" className="form-label fw-semibold">
                  Amount (THB)
                </label>
                <input
                  id="loanAmountInput"
                  type="text"
                  inputMode="decimal"
                  className="form-control"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="mb-3">
                <label htmlFor="loanDateInput" className="form-label fw-semibold">
                  Transaction Date
                </label>
                <input
                  id="loanDateInput"
                  type="date"
                  className="form-control"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  required
                />
              </div>

              <div className="mb-3">
                <label htmlFor="loanDescriptionInput" className="form-label fw-semibold">
                  Description (Optional)
                </label>
                <input
                  id="loanDescriptionInput"
                  type="text"
                  className="form-control"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={255}
                  placeholder="e.g. Loan disbursement or principal repayment"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Confirm Loan Transaction'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
