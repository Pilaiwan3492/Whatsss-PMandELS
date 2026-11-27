import React, { useEffect, useState } from 'react';
import {
  getAccounts,
  createAccount,
  updateAccount,
  updateOpeningBalance,
  Account,
  AccountType,
  AccountSubtype
} from '../api/accountApi.js';
import { recordTransfer } from '../api/transactionApi.js';
import { IncomeForm } from '../components/IncomeForm.js';
import { ExpenseForm } from '../components/ExpenseForm.js';
import { RepaymentForm } from '../components/RepaymentForm.js';
import { LoanForm, LoanOperationMode } from '../components/LoanForm.js';

interface AccountGroupConfig {
  type: AccountType;
  title: string;
  description: string;
  badgeClass: string;
}

const ACCOUNT_GROUPS: AccountGroupConfig[] = [
  {
    type: 'CASH',
    title: 'Cash & Liquid Accounts',
    description: 'Liquid checking and savings accounts used to deposit funds and pay expenses.',
    badgeClass: 'bg-success'
  },
  {
    type: 'LOAN_TAKEN',
    title: 'Credit Cards & Liabilities',
    description: 'Liability accounts used to track credit debt and borrowing balances.',
    badgeClass: 'bg-danger'
  },
  {
    type: 'LOAN_GIVEN',
    title: 'Lent Funds & Receivables',
    description: 'Accounts tracking money lent to others awaiting reimbursement.',
    badgeClass: 'bg-warning text-dark'
  },
  {
    type: 'INCOME',
    title: 'Income Categories',
    description: 'Flow accounts categorizing revenue inflows such as salary.',
    badgeClass: 'bg-info text-dark'
  },
  {
    type: 'EXPENSE',
    title: 'Expense Categories',
    description: 'Flow accounts categorizing expenditures such as food, groceries, and bills.',
    badgeClass: 'bg-secondary'
  }
];

export const AccountListPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal / Form state for setting opening balance
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [balanceInput, setBalanceInput] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Income form modal state
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState<boolean>(false);

  // Expense form modal state (WP-04)
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState<boolean>(false);

  // Repayment form modal state (WP-05)
  const [isRepaymentModalOpen, setIsRepaymentModalOpen] = useState<boolean>(false);
  const [repaymentInitialCCId, setRepaymentInitialCCId] = useState<string | undefined>(undefined);

  // Loan form modal state (F-12, F-13, WP-09)
  const [isLoanModalOpen, setIsLoanModalOpen] = useState<boolean>(false);
  const [loanInitialMode, setLoanInitialMode] = useState<LoanOperationMode>('LOAN_GIVEN');
  const [loanInitialAccountId, setLoanInitialAccountId] = useState<string | undefined>(undefined);

  // Create Account modal state (F-10, WP-08)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newAccName, setNewAccName] = useState<string>('');
  const [newAccType, setNewAccType] = useState<AccountType>('CASH');
  const [newAccSubtype, setNewAccSubtype] = useState<AccountSubtype>('DEFAULT');
  const [newAccOpeningBalance, setNewAccOpeningBalance] = useState<string>('0.00');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // Rename Account modal state (F-10, WP-08)
  const [renameTargetAccount, setRenameTargetAccount] = useState<Account | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState<boolean>(false);

  // Internal Cash Transfer modal state (F-11, WP-08)
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [transferFromId, setTransferFromId] = useState<string>('');
  const [transferToId, setTransferToId] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [transferDesc, setTransferDesc] = useState<string>('');
  const [transferError, setTransferError] = useState<string | null>(null);
  const [isTransferring, setIsTransferring] = useState<boolean>(false);

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

  const handleOpenRepayment = (creditCardId?: string) => {
    setRepaymentInitialCCId(creditCardId);
    setIsRepaymentModalOpen(true);
  };

  const handleOpenLoanModal = (
    mode: LoanOperationMode = 'LOAN_GIVEN',
    accountId?: string
  ) => {
    setLoanInitialMode(mode);
    setLoanInitialAccountId(accountId);
    setIsLoanModalOpen(true);
  };

  const handleOpenCreateModal = () => {
    setNewAccName('');
    setNewAccType('CASH');
    setNewAccSubtype('DEFAULT');
    setNewAccOpeningBalance('0.00');
    setCreateError(null);
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreateError(null);
  };

  const handleSubmitCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newAccName.trim().replace(/\s+/g, ' ');
    if (!trimmedName || trimmedName.length > 100) {
      setCreateError('Account name is required and must be 1–100 characters.');
      return;
    }

    const isCategory = newAccType === 'INCOME' || newAccType === 'EXPENSE';
    let numBalance = 0;
    if (!isCategory) {
      numBalance = Number(newAccOpeningBalance || '0');
      if (isNaN(numBalance) || numBalance < 0) {
        setCreateError('Opening balance must be a non-negative number.');
        return;
      }
      const parts = (newAccOpeningBalance || '0').split('.');
      if (parts.length === 2 && parts[1].length > 2) {
        setCreateError('Opening balance allows at most 2 decimal places.');
        return;
      }
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      const subtypeToSend: AccountSubtype =
        newAccType === 'LOAN_TAKEN'
          ? newAccSubtype === 'CREDIT_CARD' || newAccSubtype === 'GENERAL_LOAN'
            ? newAccSubtype
            : 'GENERAL_LOAN'
          : 'DEFAULT';

      const created = await createAccount({
        name: trimmedName,
        type: newAccType,
        subtype: subtypeToSend,
        opening_balance: isCategory ? 0 : numBalance
      });
      setAccounts((prev) => [...prev, created]);
      handleCloseCreateModal();
    } catch (err: any) {
      setCreateError(
        err?.response?.data?.error?.message || 'Failed to create account. Please try again.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenRenameModal = (acc: Account) => {
    setRenameTargetAccount(acc);
    setRenameInput(acc.name);
    setRenameError(null);
  };

  const handleCloseRenameModal = () => {
    setRenameTargetAccount(null);
    setRenameInput('');
    setRenameError(null);
  };

  const handleSubmitRenameAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTargetAccount) return;
    const trimmedName = renameInput.trim().replace(/\s+/g, ' ');
    if (!trimmedName || trimmedName.length > 100) {
      setRenameError('Account name is required and must be 1–100 characters.');
      return;
    }
    setIsRenaming(true);
    setRenameError(null);
    try {
      const updated = await updateAccount(renameTargetAccount.id, { name: trimmedName });
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      handleCloseRenameModal();
    } catch (err: any) {
      setRenameError(
        err?.response?.data?.error?.message || 'Failed to rename account. Please try again.'
      );
    } finally {
      setIsRenaming(false);
    }
  };

  const handleOpenTransferModal = () => {
    const cashList = accounts.filter((a) => a.type === 'CASH' && !a.is_archived);
    setTransferFromId(cashList[0]?.id || '');
    setTransferToId(cashList[1]?.id || cashList[0]?.id || '');
    setTransferAmount('');
    setTransferDesc('');
    setTransferError(null);
    setIsTransferModalOpen(true);
  };

  const handleCloseTransferModal = () => {
    setIsTransferModalOpen(false);
    setTransferError(null);
  };

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFromId || !transferToId) {
      setTransferError('Please select both source and destination cash accounts.');
      return;
    }
    if (transferFromId === transferToId) {
      setTransferError('Source and destination cash accounts must be distinct.');
      return;
    }
    const trimmedAmt = transferAmount.trim();
    const numAmt = Number(trimmedAmt);
    if (!trimmedAmt || isNaN(numAmt) || numAmt <= 0) {
      setTransferError('Transfer amount must be strictly greater than 0.00.');
      return;
    }
    setIsTransferring(true);
    setTransferError(null);
    try {
      await recordTransfer({
        from_account_id: transferFromId,
        to_account_id: transferToId,
        amount: trimmedAmt,
        transaction_date: transferDate,
        description: transferDesc.trim() || null
      });
      await fetchAccounts();
      handleCloseTransferModal();
    } catch (err: any) {
      setTransferError(
        err?.response?.data?.error?.message || 'Failed to transfer cash. Please try again.'
      );
    } finally {
      setIsTransferring(false);
    }
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

    if (num > 9999999999.99) {
      setModalError('Opening balance exceeds maximum allowed limit (9,999,999,999.99).');
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
      setModalError(
        err?.response?.data?.error?.message ||
        'Failed to update opening balance. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="fw-bold mb-1">Financial Accounts</h2>
          <p className="text-muted mb-0">
            Manage your financial accounts grouped by type and configure initial opening balances.
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button
            type="button"
            className="btn btn-dark fw-semibold shadow-sm"
            onClick={handleOpenCreateModal}
          >
            + Create Account
          </button>
          <button
            type="button"
            className="btn btn-outline-primary fw-semibold shadow-sm"
            onClick={handleOpenTransferModal}
          >
            Transfer Cash
          </button>
          <button
            type="button"
            className="btn btn-success fw-semibold shadow-sm"
            onClick={() => setIsIncomeModalOpen(true)}
          >
            Record Income
          </button>
          <button
            type="button"
            className="btn btn-primary fw-semibold shadow-sm"
            onClick={() => setIsExpenseModalOpen(true)}
          >
            Record Purchase
          </button>
          <button
            type="button"
            className="btn btn-outline-danger fw-semibold shadow-sm"
            onClick={() => handleOpenRepayment()}
          >
            Pay Credit Card
          </button>
          <button
            type="button"
            className="btn btn-outline-warning text-dark fw-semibold shadow-sm"
            onClick={() => handleOpenLoanModal('LOAN_GIVEN')}
          >
            Manage Loans
          </button>
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
        <div>
          {ACCOUNT_GROUPS.map((group) => {
            const groupAccounts = accounts.filter((a) => a.type === group.type);
            if (groupAccounts.length === 0) return null;

            return (
              <section key={group.type} className="mb-5" aria-labelledby={`group-${group.type}`}>
                <div className="border-bottom pb-2 mb-3">
                  <h4 id={`group-${group.type}`} className="fw-bold mb-0">
                    {group.title}
                  </h4>
                  <small className="text-muted">{group.description}</small>
                </div>

                <div className="row g-4">
                  {groupAccounts.map((acc) => (
                    <div key={acc.id} className="col-12 col-md-6 col-lg-4">
                      <div className="card h-100 shadow-sm border-0">
                        <div className="card-body d-flex flex-column">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div className="d-flex align-items-center gap-2 flex-wrap">
                              <h5 className="card-title fw-bold mb-0">{acc.name}</h5>
                              <button
                                type="button"
                                className="btn btn-link btn-sm p-0 text-decoration-none"
                                aria-label={`Rename ${acc.name}`}
                                onClick={() => handleOpenRenameModal(acc)}
                              >
                                Rename
                              </button>
                            </div>
                            <div className="d-flex gap-1 flex-wrap">
                              <span className={`badge ${group.badgeClass}`}>
                                {acc.type}
                              </span>
                              {acc.type === 'LOAN_TAKEN' && acc.subtype && (
                                <span className="badge bg-dark">
                                  {acc.subtype}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="my-3">
                            {acc.type === 'CASH' && acc.current_balance !== undefined ? (
                              <>
                                <span className="text-muted small d-block">Current Balance</span>
                                <span className="fs-4 fw-bold text-success">
                                  {formatCurrency(acc.current_balance)}
                                </span>
                                <small className="text-muted d-block mt-1">
                                  Opening: {formatCurrency(acc.opening_balance)}
                                </small>
                              </>
                            ) : acc.type === 'LOAN_TAKEN' && acc.current_balance !== undefined ? (
                              <>
                                <span className="text-muted small d-block">Current Debt</span>
                                <span className="fs-4 fw-bold text-danger">
                                  {formatCurrency(acc.current_balance)}
                                </span>
                                <small className="text-muted d-block mt-1">
                                  Opening: {formatCurrency(acc.opening_balance)}
                                </small>
                              </>
                            ) : acc.type === 'LOAN_GIVEN' && acc.current_balance !== undefined ? (
                              <>
                                <span className="text-muted small d-block">Current Receivable</span>
                                <span className="fs-4 fw-bold text-warning text-dark">
                                  {formatCurrency(acc.current_balance)}
                                </span>
                                <small className="text-muted d-block mt-1">
                                  Opening: {formatCurrency(acc.opening_balance)}
                                </small>
                              </>
                            ) : (
                              <>
                                <span className="text-muted small d-block">Opening Balance</span>
                                <span className="fs-4 fw-bold">
                                  {formatCurrency(acc.opening_balance)}
                                </span>
                              </>
                            )}
                          </div>

                          <div className="mt-auto pt-2 border-top d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <div className="d-flex align-items-center gap-2">
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

                            {acc.type === 'LOAN_TAKEN' && Number(acc.current_balance ?? 0) > 0 && (
                              acc.subtype === 'GENERAL_LOAN' ? (
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => handleOpenLoanModal('LOAN_REPAYMENT', acc.id)}
                                >
                                  Repay Loan
                                </button>
                              ) : (
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => handleOpenRepayment(acc.id)}
                                >
                                  Pay Debt
                                </button>
                              )
                            )}
                            {acc.type === 'LOAN_GIVEN' && Number(acc.current_balance ?? 0) > 0 && (
                              <button
                                className="btn btn-sm btn-outline-warning text-dark"
                                onClick={() => handleOpenLoanModal('LOAN_RECOVERY', acc.id)}
                              >
                                Recover Loan
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Record Income Modal */}
      <IncomeForm
        accounts={accounts}
        isOpen={isIncomeModalOpen}
        onClose={() => setIsIncomeModalOpen(false)}
        onSuccess={() => {
          fetchAccounts();
        }}
      />

      {/* Record Credit Card Purchase Modal (WP-04) */}
      <ExpenseForm
        accounts={accounts}
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSuccess={() => {
          fetchAccounts();
        }}
      />

      {/* Record Credit Card Repayment Modal (WP-05) */}
      <RepaymentForm
        accounts={accounts}
        isOpen={isRepaymentModalOpen}
        initialCreditCardId={repaymentInitialCCId}
        onClose={() => setIsRepaymentModalOpen(false)}
        onSuccess={() => {
          fetchAccounts();
        }}
      />

      {/* Peer Lending & General Loan Modal (F-12, F-13, WP-09) */}
      <LoanForm
        accounts={accounts}
        isOpen={isLoanModalOpen}
        initialMode={loanInitialMode}
        initialLoanAccountId={loanInitialAccountId}
        onClose={() => setIsLoanModalOpen(false)}
        onSuccess={() => {
          fetchAccounts();
        }}
      />

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

      {/* Create Custom Account Modal (F-10, WP-08) */}
      {isCreateModalOpen && (
        <div
          className="modal show d-block"
          tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          role="dialog"
          aria-labelledby="createAccountModalTitle"
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow">
              <div className="modal-header">
                <h5 className="modal-title fw-bold" id="createAccountModalTitle">
                  Create Custom Account
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={handleCloseCreateModal}
                  disabled={isCreating}
                />
              </div>
              <form onSubmit={handleSubmitCreateAccount}>
                <div className="modal-body">
                  {createError && (
                    <div className="alert alert-danger py-2 small" role="alert">
                      {createError}
                    </div>
                  )}

                  <div className="mb-3">
                    <label htmlFor="newAccountNameInput" className="form-label fw-semibold">
                      Account Name
                    </label>
                    <input
                      id="newAccountNameInput"
                      type="text"
                      className="form-control"
                      value={newAccName}
                      onChange={(e) => setNewAccName(e.target.value)}
                      placeholder="e.g. Savings Bank"
                      maxLength={100}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label htmlFor="newAccountTypeSelect" className="form-label fw-semibold">
                      Account Type
                    </label>
                    <select
                      id="newAccountTypeSelect"
                      className="form-select"
                      value={newAccType}
                      onChange={(e) => {
                        const nextType = e.target.value as AccountType;
                        setNewAccType(nextType);
                        if (nextType === 'LOAN_TAKEN') {
                          setNewAccSubtype('GENERAL_LOAN');
                        } else {
                          setNewAccSubtype('DEFAULT');
                        }
                        if (nextType === 'INCOME' || nextType === 'EXPENSE') {
                          setNewAccOpeningBalance('0.00');
                        }
                      }}
                    >
                      <option value="CASH">CASH (Liquid Bank / Wallet)</option>
                      <option value="LOAN_TAKEN">LOAN_TAKEN (Credit Card / General Liability)</option>
                      <option value="LOAN_GIVEN">LOAN_GIVEN (Receivable / Lent Funds)</option>
                      <option value="INCOME">INCOME (Income Category)</option>
                      <option value="EXPENSE">EXPENSE (Expense Category)</option>
                    </select>
                  </div>

                  {newAccType === 'LOAN_TAKEN' && (
                    <div className="mb-3">
                      <label htmlFor="newAccountSubtypeSelect" className="form-label fw-semibold">
                        Liability Subtype
                      </label>
                      <select
                        id="newAccountSubtypeSelect"
                        className="form-select"
                        value={newAccSubtype}
                        onChange={(e) => setNewAccSubtype(e.target.value as AccountSubtype)}
                      >
                        <option value="GENERAL_LOAN">GENERAL_LOAN (General Borrowing)</option>
                        <option value="CREDIT_CARD">CREDIT_CARD (Credit Card)</option>
                      </select>
                    </div>
                  )}

                  {newAccType !== 'INCOME' && newAccType !== 'EXPENSE' && (
                    <div className="mb-3">
                      <label htmlFor="newAccountOpeningBalanceInput" className="form-label fw-semibold">
                        Initial Opening Balance (THB)
                      </label>
                      <input
                        id="newAccountOpeningBalanceInput"
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control"
                        value={newAccOpeningBalance}
                        onChange={(e) => setNewAccOpeningBalance(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCloseCreateModal}
                    disabled={isCreating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={isCreating}
                  >
                    {isCreating ? 'Creating...' : 'Save Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Rename Account Modal (F-10, WP-08) */}
      {renameTargetAccount && (
        <div
          className="modal show d-block"
          tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          role="dialog"
          aria-labelledby="renameAccountModalTitle"
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow">
              <div className="modal-header">
                <h5 className="modal-title fw-bold" id="renameAccountModalTitle">
                  Rename Account: {renameTargetAccount.name}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={handleCloseRenameModal}
                  disabled={isRenaming}
                />
              </div>
              <form onSubmit={handleSubmitRenameAccount}>
                <div className="modal-body">
                  {renameError && (
                    <div className="alert alert-danger py-2 small" role="alert">
                      {renameError}
                    </div>
                  )}
                  <div className="mb-3">
                    <label htmlFor="renameAccountInput" className="form-label fw-semibold">
                      New Account Name
                    </label>
                    <input
                      id="renameAccountInput"
                      type="text"
                      className="form-control"
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                      maxLength={100}
                      required
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCloseRenameModal}
                    disabled={isRenaming}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={isRenaming}
                  >
                    {isRenaming ? 'Saving...' : 'Save New Name'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Internal Cash Transfer Modal (F-11, WP-08) */}
      {isTransferModalOpen && (
        <div
          className="modal show d-block"
          tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          role="dialog"
          aria-labelledby="transferModalTitle"
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow">
              <div className="modal-header">
                <h5 className="modal-title fw-bold" id="transferModalTitle">
                  Internal Cash Transfer
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={handleCloseTransferModal}
                  disabled={isTransferring}
                />
              </div>
              <form onSubmit={handleSubmitTransfer}>
                <div className="modal-body">
                  {transferError && (
                    <div className="alert alert-danger py-2 small" role="alert">
                      {transferError}
                    </div>
                  )}

                  <div className="mb-3">
                    <label htmlFor="transferFromSelect" className="form-label fw-semibold">
                      From Cash Account
                    </label>
                    <select
                      id="transferFromSelect"
                      className="form-select"
                      value={transferFromId}
                      onChange={(e) => setTransferFromId(e.target.value)}
                      required
                    >
                      <option value="">Select source cash account...</option>
                      {accounts
                        .filter((a) => a.type === 'CASH' && !a.is_archived)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({formatCurrency(Number(a.current_balance ?? a.opening_balance))})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="transferToSelect" className="form-label fw-semibold">
                      To Cash Account
                    </label>
                    <select
                      id="transferToSelect"
                      className="form-select"
                      value={transferToId}
                      onChange={(e) => setTransferToId(e.target.value)}
                      required
                    >
                      <option value="">Select destination cash account...</option>
                      {accounts
                        .filter((a) => a.type === 'CASH' && !a.is_archived)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({formatCurrency(Number(a.current_balance ?? a.opening_balance))})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="transferAmountInput" className="form-label fw-semibold">
                      Transfer Amount (THB)
                    </label>
                    <input
                      id="transferAmountInput"
                      type="text"
                      inputMode="decimal"
                      className="form-control"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label htmlFor="transferDateInput" className="form-label fw-semibold">
                      Transaction Date
                    </label>
                    <input
                      id="transferDateInput"
                      type="date"
                      className="form-control"
                      value={transferDate}
                      onChange={(e) => setTransferDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label htmlFor="transferDescInput" className="form-label fw-semibold">
                      Description (Optional)
                    </label>
                    <input
                      id="transferDescInput"
                      type="text"
                      className="form-control"
                      value={transferDesc}
                      onChange={(e) => setTransferDesc(e.target.value)}
                      maxLength={255}
                      placeholder="e.g. Monthly savings transfer"
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCloseTransferModal}
                    disabled={isTransferring}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={isTransferring}
                  >
                    {isTransferring ? 'Transferring...' : 'Confirm Transfer'}
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
