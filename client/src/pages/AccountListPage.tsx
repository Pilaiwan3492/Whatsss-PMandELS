import React, { useEffect, useState } from 'react';
import { getAccounts, updateOpeningBalance, Account } from '../api/accountApi.js';

export const AccountListPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal / Form state for setting opening balance
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [balanceInput, setBalanceInput] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchAccounts = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await getAccounts();
      setAccounts(data);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.error?.message || 'Failed to load accounts. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleOpenModal = (account: Account) => {
    setSelectedAccount(account);
    setBalanceInput(account.opening_balance.toFixed(2));
    setModalError(null);
  };

  const handleCloseModal = () => {
    setSelectedAccount(null);
    setBalanceInput('');
    setModalError(null);
  };

  const handleSubmitOpeningBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;

    const num = Number(balanceInput);
    if (isNaN(num) || num < 0) {
      setModalError('Opening balance must be a non-negative number.');
      return;
    }

    const parts = balanceInput.split('.');
    if (parts.length === 2 && parts[1].length > 2) {
      setModalError('Opening balance allows at most 2 decimal places.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);
    try {
      const updated = await updateOpeningBalance(selectedAccount.id, num);
      setAccounts((prev) =>
        prev.map((acc) => (acc.id === updated.id ? updated : acc))
      );
      handleCloseModal();
    } catch (err: any) {
      const apiCode = err?.response?.data?.error?.code;
      const apiMessage = err?.response?.data?.error?.message;
      if (apiCode === 'OPENING_BALANCE_LOCKED') {
        setModalError('Opening balance is locked permanently following first transaction.');
      } else {
        setModalError(apiMessage || 'Failed to update opening balance.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const getTypeBadgeClass = (type: string): string => {
    switch (type) {
      case 'CASH':
        return 'bg-success';
      case 'LOAN_TAKEN':
        return 'bg-danger';
      case 'LOAN_GIVEN':
        return 'bg-warning text-dark';
      case 'INCOME':
        return 'bg-info text-dark';
      case 'EXPENSE':
        return 'bg-secondary';
      default:
        return 'bg-secondary';
    }
  };

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold mb-1">Financial Accounts</h2>
          <p className="text-muted mb-0">
            Manage your financial accounts and configure initial opening balances.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="alert alert-danger shadow-sm" role="alert">
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="d-flex justify-content-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading accounts...</span>
          </div>
        </div>
      ) : (
        <div className="row g-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="col-12 col-md-6 col-lg-4">
              <div className="card h-100 shadow-sm border-0">
                <div className="card-body d-flex flex-column">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h5 className="card-title fw-bold mb-0">{acc.name}</h5>
                    <span className={`badge ${getTypeBadgeClass(acc.type)}`}>
                      {acc.type}
                    </span>
                  </div>

                  <div className="my-3">
                    <span className="text-muted small d-block">Opening Balance</span>
                    <span className="fs-4 fw-bold">
                      {formatCurrency(acc.opening_balance)}
                    </span>
                  </div>

                  <div className="mt-auto pt-2 border-top d-flex justify-content-between align-items-center">
                    <span className="small text-muted">Status:</span>
                    {acc.is_opening_locked ? (
                      <span
                        className="badge bg-secondary"
                        title="Opening balance is locked permanently following first transaction"
                      >
                        Opening balance locked
                      </span>
                    ) : (
                      <button
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => handleOpenModal(acc)}
                      >
                        Set Opening Balance
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Opening Balance Modal */}
      {selectedAccount && (
        <div
          className="modal show d-block"
          tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          role="dialog"
          aria-labelledby="modalTitle"
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow">
              <div className="modal-header">
                <h5 className="modal-title fw-bold" id="modalTitle">
                  Set Opening Balance: {selectedAccount.name}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                />
              </div>
              <form onSubmit={handleSubmitOpeningBalance}>
                <div className="modal-body">
                  {modalError && (
                    <div className="alert alert-danger py-2 small" role="alert">
                      {modalError}
                    </div>
                  )}

                  <div className="mb-3">
                    <label htmlFor="openingBalanceInput" className="form-label fw-semibold">
                      Opening Balance (THB)
                    </label>
                    <input
                      id="openingBalanceInput"
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control"
                      value={balanceInput}
                      onChange={(e) => setBalanceInput(e.target.value)}
                      placeholder="0.00"
                      required
                      autoFocus
                    />
                    <div className="form-text">
                      Non-negative number with up to 2 decimal places. Once a transaction is committed, this balance is locked permanently.
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCloseModal}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Saving...' : 'Save Opening Balance'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
