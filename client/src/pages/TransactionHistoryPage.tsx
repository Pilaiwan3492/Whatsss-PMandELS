import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getTransactions,
  toggleFavorite,
  duplicateTransaction,
  HistoryTransaction,
  TransactionFilterParams
} from '../api/transactionApi.js';
import { getAccounts, Account } from '../api/accountApi.js';
import { TransactionCorrectionModal } from '../components/TransactionCorrectionModal.js';

export type SemanticKind = 'INCOME' | 'EXPENSE' | 'REPAYMENT' | 'TRANSFER' | 'LOAN';

/**
 * Classifies a transaction into its authoritative semantic domain kind, matching backend F-15 rules:
 * - LOAN: Allocation to LOAN_GIVEN or LOAN_TAKEN (subtype GENERAL_LOAN).
 * - INCOME: RECEIVE_MONEY with an INCOME allocation.
 * - EXPENSE: PAYMENT_CHARGE with an EXPENSE allocation (including ordinary CASH expenses and CC charges).
 * - REPAYMENT: PAYMENT_CHARGE from CASH to LOAN_TAKEN with subtype CREDIT_CARD.
 * - TRANSFER: PAYMENT_CHARGE from CASH to CASH.
 */
export function getTransactionKind(tx: HistoryTransaction): SemanticKind {
  const lines = tx.allocation_lines || [];

  if (
    lines.some(
      (l) =>
        l.target_account?.type === 'LOAN_GIVEN' ||
        (l.target_account?.type === 'LOAN_TAKEN' && l.target_account?.subtype === 'GENERAL_LOAN')
    )
  ) {
    return 'LOAN';
  }

  if (
    tx.form === 'RECEIVE_MONEY' &&
    lines.some((l) => l.target_account?.type === 'INCOME')
  ) {
    return 'INCOME';
  }

  if (
    tx.form === 'PAYMENT_CHARGE' &&
    lines.some((l) => l.target_account?.type === 'EXPENSE')
  ) {
    return 'EXPENSE';
  }

  if (
    tx.form === 'PAYMENT_CHARGE' &&
    tx.primary_account?.type === 'CASH' &&
    lines.some(
      (l) =>
        l.target_account?.type === 'LOAN_TAKEN' &&
        l.target_account?.subtype === 'CREDIT_CARD'
    )
  ) {
    return 'REPAYMENT';
  }

  if (
    tx.form === 'PAYMENT_CHARGE' &&
    tx.primary_account?.type === 'CASH' &&
    lines.some((l) => l.target_account?.type === 'CASH')
  ) {
    return 'TRANSFER';
  }

  return tx.form === 'RECEIVE_MONEY' ? 'INCOME' : 'EXPENSE';
}

/**
 * Determines the cash-flow amount sign ('+' or '-') from the actual transaction direction:
 * - RECEIVE_MONEY (Income, Loan Recovery, General Loan Borrowing) => '+' (inflow)
 * - PAYMENT_CHARGE (Expense, Credit Card Repayment, Cash Transfer, Loan Given, General Loan Repayment) => '-' (outflow / charge)
 */
export function getTransactionAmountSign(tx: HistoryTransaction): '+' | '-' {
  return tx.form === 'RECEIVE_MONEY' ? '+' : '-';
}

export const TransactionHistoryPage: React.FC = () => {
  const [transactions, setTransactions] = useState<HistoryTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [correctionFeedback, setCorrectionFeedback] = useState<string | null>(null);
  const [editingTxn, setEditingTxn] = useState<HistoryTransaction | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Quick tab filter (client-side refinement over fetched results)
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | SemanticKind>('ALL');
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);
  const [expandedTxnIds, setExpandedTxnIds] = useState<Set<string>>(new Set());

  // Server-side Search & Multi-Criteria Filter state (F-15)
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'' | SemanticKind>('');
  const [hasAppliedServerFilters, setHasAppliedServerFilters] = useState<boolean>(false);
  const [hasRecordedTransactions, setHasRecordedTransactions] = useState<boolean>(false);

  // Duplicate Modal state (F-14)
  const [duplicateTarget, setDuplicateTarget] = useState<HistoryTransaction | null>(null);
  const [duplicateDate, setDuplicateDate] = useState<string>('');
  const [duplicateDescription, setDuplicateDescription] = useState<string>('');
  const [isDuplicating, setIsDuplicating] = useState<boolean>(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const buildFilterParams = (): TransactionFilterParams | undefined => {
    const params: TransactionFilterParams = {};
    if (searchKeyword.trim()) params.q = searchKeyword.trim();
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (selectedAccountId) params.accountId = selectedAccountId;
    if (selectedCategoryId) params.categoryId = selectedCategoryId;
    if (selectedType) params.type = selectedType;
    if (favoritesOnly) params.favorite = 'true';
    return Object.keys(params).length > 0 ? params : undefined;
  };

  const fetchHistory = async (overrideParams?: TransactionFilterParams | null) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = overrideParams === null ? undefined : overrideParams ?? buildFilterParams();
      setHasAppliedServerFilters(Boolean(params && Object.keys(params).length > 0));
      const data = params ? await getTransactions(params) : await getTransactions();
      setTransactions(data);
      if (!params && data.length > 0) {
        setHasRecordedTransactions(true);
      } else if (!params && data.length === 0) {
        setHasRecordedTransactions(false);
      }
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.error?.message || err?.message || 'Failed to load transaction history. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(null);
    getAccounts()
      .then((accs) => setAccounts(accs || []))
      .catch(() => {
        // Accounts dropdown is optional if endpoint unavailable
      });
  }, []);

  const handleApplyFilters = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFeedbackMessage(null);
    setActionError(null);
    fetchHistory();
  };

  const handleClearFilters = () => {
    setSearchKeyword('');
    setStartDate('');
    setEndDate('');
    setSelectedAccountId('');
    setSelectedCategoryId('');
    setSelectedType('');
    setFavoritesOnly(false);
    setSelectedFilter('ALL');
    setFeedbackMessage(null);
    setActionError(null);
    fetchHistory(null);
  };

  const handleToggleFavorite = async (tx: HistoryTransaction) => {
    setActionError(null);
    setFeedbackMessage(null);
    const nextFav = !tx.is_favorite;
    try {
      await toggleFavorite(tx.id, nextFav);
      setTransactions((prev) =>
        prev.map((item) => (item.id === tx.id ? { ...item, is_favorite: nextFav } : item))
      );
    } catch (err: any) {
      setActionError(
        err?.response?.data?.error?.message || err?.message || 'Failed to update favorite status.'
      );
    }
  };

  const openDuplicateModal = (tx: HistoryTransaction) => {
    setDuplicateTarget(tx);
    setDuplicateDate(tx.transaction_date || new Date().toISOString().split('T')[0]);
    setDuplicateDescription(tx.description || '');
    setDuplicateError(null);
  };

  const handleConfirmDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateTarget) return;
    setIsDuplicating(true);
    setDuplicateError(null);
    setActionError(null);
    try {
      await duplicateTransaction(duplicateTarget.id, {
        transaction_date: duplicateDate || undefined,
        description: duplicateDescription
      });
      setDuplicateTarget(null);
      setFeedbackMessage('Transaction duplicated successfully.');
      await fetchHistory();
    } catch (err: any) {
      setDuplicateError(
        err?.response?.data?.error?.message || err?.message || 'Failed to duplicate transaction.'
      );
    } finally {
      setIsDuplicating(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedTxnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatCurrency = (amount: number | undefined): string => {
    if (amount === undefined || isNaN(amount)) return '0.00 THB';
    return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
  };

  const filteredTransactions = transactions.filter((tx) => {
    if (favoritesOnly && !tx.is_favorite) return false;
    if (selectedFilter === 'ALL') return true;
    return getTransactionKind(tx) === selectedFilter;
  });

  const categoryAccounts = accounts.filter((a) => a.type === 'EXPENSE' || a.type === 'INCOME');

  return (
    <div className="container py-4">
      {/* Header Breadcrumb & Actions */}
      <div className="d-flex flex-wrap justify-content-between align-items-center p-4 bg-white rounded-3 shadow-sm mb-4 border">
        <div>
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb mb-1 small">
              <li className="breadcrumb-item">
                <Link to="/dashboard" className="text-decoration-none">Dashboard</Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page">Transaction History</li>
            </ol>
          </nav>
          <h2 className="fw-bold mb-1">Transaction History</h2>
          <p className="text-muted mb-0 small">
            Chronological audit ledger of all recorded inflows, split expenditures, transfers, loans, and debt repayments.
          </p>
        </div>
        <div className="d-flex gap-2 mt-3 mt-md-0">
          <button className="btn btn-outline-secondary btn-sm" onClick={() => fetchHistory()} id="btn-refresh-history">
            ↻ Refresh
          </button>
          <Link to="/accounts" className="btn btn-outline-primary btn-sm">
            View Accounts
          </Link>
        </div>
      </div>

      {/* Search & Multi-Criteria Filter Bar (F-15) */}
      <form
        className="card shadow-sm border p-3 mb-3 bg-white"
        onSubmit={handleApplyFilters}
        data-testid="search-filter-form"
      >
        <div className="row g-2 align-items-end">
          <div className="col-md-3">
            <label className="form-label small fw-semibold mb-1" htmlFor="search-keyword">
              Search Keyword
            </label>
            <input
              id="search-keyword"
              type="text"
              className="form-control form-control-sm"
              placeholder="Description, notes, account..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              data-testid="search-keyword-input"
            />
          </div>
          <div className="col-md-2">
            <label className="form-label small fw-semibold mb-1" htmlFor="filter-start-date">
              Start Date
            </label>
            <input
              id="filter-start-date"
              type="date"
              className="form-control form-control-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              data-testid="filter-start-date"
            />
          </div>
          <div className="col-md-2">
            <label className="form-label small fw-semibold mb-1" htmlFor="filter-end-date">
              End Date
            </label>
            <input
              id="filter-end-date"
              type="date"
              className="form-control form-control-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              data-testid="filter-end-date"
            />
          </div>
          <div className="col-md-2">
            <label className="form-label small fw-semibold mb-1" htmlFor="filter-type-select">
              Type
            </label>
            <select
              id="filter-type-select"
              className="form-select form-select-sm"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as '' | SemanticKind)}
              data-testid="filter-type-select"
            >
              <option value="">All Types</option>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
              <option value="REPAYMENT">Repayment</option>
              <option value="TRANSFER">Transfer</option>
              <option value="LOAN">Loan</option>
            </select>
          </div>
          {accounts.length > 0 && (
            <>
              <div className="col-md-3">
                <label className="form-label small fw-semibold mb-1" htmlFor="filter-account-select">
                  Account
                </label>
                <select
                  id="filter-account-select"
                  className="form-select form-select-sm"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  data-testid="filter-account-select"
                >
                  <option value="">All Accounts</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type})
                    </option>
                  ))}
                </select>
              </div>
              {categoryAccounts.length > 0 && (
                <div className="col-md-3">
                  <label className="form-label small fw-semibold mb-1" htmlFor="filter-category-select">
                    Category
                  </label>
                  <select
                    id="filter-category-select"
                    className="form-select form-select-sm"
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    data-testid="filter-category-select"
                  >
                    <option value="">All Categories</option>
                    {categoryAccounts.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          <div className="col-md-auto d-flex gap-2">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              data-testid="btn-apply-filters"
            >
              Search / Filter
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={handleClearFilters}
              data-testid="btn-clear-filters"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </form>

      {/* Filter Tabs */}
      <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
        <span className="small text-muted me-1 fw-semibold">Filter:</span>
        <button
          className={`btn btn-sm ${selectedFilter === 'ALL' ? 'btn-dark' : 'btn-outline-secondary'}`}
          onClick={() => setSelectedFilter('ALL')}
          data-testid="filter-all"
        >
          All ({transactions.length})
        </button>
        <button
          className={`btn btn-sm ${selectedFilter === 'INCOME' ? 'btn-success' : 'btn-outline-success'}`}
          onClick={() => setSelectedFilter('INCOME')}
          data-testid="filter-income"
        >
          Income ({transactions.filter((t) => getTransactionKind(t) === 'INCOME').length})
        </button>
        <button
          className={`btn btn-sm ${selectedFilter === 'EXPENSE' ? 'btn-warning text-dark' : 'btn-outline-warning text-dark'}`}
          onClick={() => setSelectedFilter('EXPENSE')}
          data-testid="filter-expense"
        >
          Expenses ({transactions.filter((t) => getTransactionKind(t) === 'EXPENSE').length})
        </button>
        <button
          className={`btn btn-sm ${selectedFilter === 'REPAYMENT' ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => setSelectedFilter('REPAYMENT')}
          data-testid="filter-repayment"
        >
          Repayments ({transactions.filter((t) => getTransactionKind(t) === 'REPAYMENT').length})
        </button>
        <button
          className={`btn btn-sm ${selectedFilter === 'TRANSFER' ? 'btn-info text-dark' : 'btn-outline-info text-dark'}`}
          onClick={() => setSelectedFilter('TRANSFER')}
          data-testid="filter-transfer"
        >
          Transfers ({transactions.filter((t) => getTransactionKind(t) === 'TRANSFER').length})
        </button>
        <button
          className={`btn btn-sm ${selectedFilter === 'LOAN' ? 'btn-secondary' : 'btn-outline-secondary'}`}
          onClick={() => setSelectedFilter('LOAN')}
          data-testid="filter-loan"
        >
          Loans ({transactions.filter((t) => getTransactionKind(t) === 'LOAN').length})
        </button>
        <button
          className={`btn btn-sm ${favoritesOnly ? 'btn-warning text-dark fw-semibold' : 'btn-outline-secondary'}`}
          onClick={() => setFavoritesOnly((prev) => !prev)}
          data-testid="filter-favorites-only"
        >
          ★ Favorites Only ({transactions.filter((t) => Boolean(t.is_favorite)).length})
        </button>
      </div>

      {/* Correction Feedback Alert */}
      {correctionFeedback && (
        <div className="alert alert-success py-2 small mb-3" role="status" data-testid="correction-feedback">
          {correctionFeedback}
        </div>
      )}

      {/* Feedback / Action Error Alerts */}
      {feedbackMessage && (
        <div className="alert alert-success py-2 small mb-3" role="status" data-testid="history-feedback">
          {feedbackMessage}
        </div>
      )}
      {actionError && (
        <div className="alert alert-danger py-2 small mb-3" role="alert" data-testid="history-action-error">
          {actionError}
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center mb-4" role="alert">
          <div>
            <strong>Error:</strong> {errorMessage}
          </div>
          <button className="btn btn-outline-danger btn-sm" onClick={() => fetchHistory()}>
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="d-flex justify-content-center align-items-center py-5" data-testid="history-loading">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading transactions...</span>
          </div>
        </div>
      ) : !errorMessage && filteredTransactions.length === 0 ? (
        /* Empty State */
        (() => {
          const isFilteredEmpty =
            hasRecordedTransactions &&
            (hasAppliedServerFilters || selectedFilter !== 'ALL' || favoritesOnly);
          return (
            <div className="card shadow-sm border p-5 text-center my-4" data-testid="empty-history-state">
              <div className="mb-3 fs-1 text-muted">📋</div>
              <h4 className="fw-bold mb-2">
                {isFilteredEmpty ? 'No transactions match your filters' : 'No transactions recorded yet'}
              </h4>
              <p className="text-muted mb-4 small">
                {isFilteredEmpty
                  ? 'Try adjusting or clearing your search and filter criteria to view recorded transactions.'
                  : 'Start by setting an opening balance or recording your first income inflow from the dashboard.'}
              </p>
              <div className="d-flex justify-content-center gap-2">
                {isFilteredEmpty ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleClearFilters}
                    data-testid="btn-empty-clear-filters"
                  >
                    Clear Filters
                  </button>
                ) : (
                  <Link to="/dashboard" className="btn btn-primary btn-sm">
                    Return to Dashboard
                  </Link>
                )}
              </div>
            </div>
          );
        })()
      ) : !errorMessage ? (
        /* Responsive Transaction Table */
        <div className="card shadow-sm border" data-testid="transactions-table-card">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" data-testid="transactions-table">
              <thead className="table-light">
                <tr>
                  <th scope="col" style={{ width: '40px' }}></th>
                  <th scope="col">Date</th>
                  <th scope="col">Type</th>
                  <th scope="col">Primary Account</th>
                  <th scope="col">Description</th>
                  <th scope="col">Split Allocations</th>
                  <th scope="col" className="text-end">Total Amount</th>
                  <th scope="col" className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => {
                  const kind = getTransactionKind(tx);
                  const amountSign = getTransactionAmountSign(tx);
                  const isExpanded = expandedTxnIds.has(tx.id);
                  const hasMultipleAllocations = tx.allocation_lines && tx.allocation_lines.length > 1;

                  return (
                    <React.Fragment key={tx.id}>
                      <tr
                        style={{ cursor: hasMultipleAllocations ? 'pointer' : 'default' }}
                        onClick={() => hasMultipleAllocations && toggleExpand(tx.id)}
                        data-testid={`txn-row-${tx.id}`}
                      >
                        <td className="text-center">
                          {hasMultipleAllocations && (
                            <button
                              type="button"
                              className="btn btn-sm btn-link p-0 text-decoration-none"
                              aria-label={isExpanded ? 'Collapse allocations' : 'Expand allocations'}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(tx.id);
                              }}
                            >
                              {isExpanded ? '▼' : '▶'}
                            </button>
                          )}
                        </td>
                        <td className="small text-nowrap fw-semibold">{tx.transaction_date}</td>
                        <td>
                          <span
                            className={`badge ${
                              kind === 'INCOME'
                                ? 'bg-success'
                                : kind === 'REPAYMENT'
                                ? 'bg-primary'
                                : kind === 'TRANSFER'
                                ? 'bg-info text-dark'
                                : kind === 'LOAN'
                                ? 'bg-secondary'
                                : 'bg-warning text-dark'
                            }`}
                            data-testid={`badge-${tx.id}`}
                          >
                            {kind === 'INCOME'
                              ? 'Income'
                              : kind === 'REPAYMENT'
                              ? 'Repayment'
                              : kind === 'TRANSFER'
                              ? 'Transfer'
                              : kind === 'LOAN'
                              ? 'Loan'
                              : 'Expense'}
                          </span>
                        </td>
                        <td className="small">
                          <span className="fw-semibold">{tx.primary_account?.name || 'Account'}</span>
                          <span className="text-muted ms-1 small">({tx.primary_account?.type})</span>
                        </td>
                        <td className="small">{tx.description || '-'}</td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            {tx.allocation_lines.map((line) => (
                              <span
                                key={line.id}
                                className="badge bg-light text-dark border small"
                                title={line.notes || undefined}
                              >
                                {line.target_account?.name || 'Category'}: {formatCurrency(line.amount)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td
                          className={`text-end fw-bold small text-nowrap ${
                            amountSign === '+' ? 'text-success' : 'text-danger'
                          }`}
                          data-testid={`amount-${tx.id}`}
                        >
                          {amountSign} {formatCurrency(tx.total_amount)}
                        </td>
                        <td
                          className="text-end text-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={`btn btn-sm me-1 ${
                              tx.is_favorite ? 'btn-warning text-dark' : 'btn-outline-secondary'
                            }`}
                            aria-label={tx.is_favorite ? 'Remove favorite' : 'Mark as favorite'}
                            onClick={() => handleToggleFavorite(tx)}
                            data-testid={`btn-favorite-${tx.id}`}
                          >
                            {tx.is_favorite ? '★' : '☆'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary me-1"
                            onClick={() => openDuplicateModal(tx)}
                            data-testid={`btn-duplicate-${tx.id}`}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => {
                              setCorrectionFeedback(null);
                              setEditingTxn(tx);
                            }}
                            data-testid={`btn-edit-${tx.id}`}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Sub-Row for Split Allocations */}
                      {isExpanded && (
                        <tr className="table-light" data-testid={`expanded-row-${tx.id}`}>
                          <td colSpan={8} className="p-3">
                            <div className="ps-4">
                              <h6 className="fw-bold small mb-2 text-muted text-uppercase">
                                Split Allocations ({tx.allocation_lines.length} lines):
                              </h6>
                              <div className="table-responsive">
                                <table className="table table-sm table-bordered bg-white mb-0">
                                  <thead>
                                    <tr>
                                      <th>Target Category</th>
                                      <th>Type</th>
                                      <th>Notes</th>
                                      <th className="text-end">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tx.allocation_lines.map((line) => (
                                      <tr key={line.id}>
                                        <td className="fw-semibold">{line.target_account?.name}</td>
                                        <td>
                                          <span className="badge bg-secondary small">
                                            {line.target_account?.type}
                                          </span>
                                        </td>
                                        <td className="text-muted small">{line.notes || '-'}</td>
                                        <td className="text-end fw-bold">{formatCurrency(line.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Transaction Correction Modal (F-16) */}
      {editingTxn && (
        <TransactionCorrectionModal
          transaction={editingTxn}
          onClose={() => setEditingTxn(null)}
          onSuccess={async () => {
            setEditingTxn(null);
            setCorrectionFeedback('Transaction corrected and audit snapshot recorded.');
            await fetchHistory();
          }}
        />
      )}

      {/* Duplicate Transaction Modal (F-14) */}
      {duplicateTarget && (
        <div
          className="modal d-block"
          tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          data-testid="duplicate-modal"
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <form onSubmit={handleConfirmDuplicate}>
                <div className="modal-header">
                  <h5 className="modal-title">Duplicate Transaction</h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setDuplicateTarget(null)}
                  />
                </div>
                <div className="modal-body">
                  <p className="small text-muted mb-3">
                    Creates a new transaction copying account, amount (
                    <strong>{formatCurrency(duplicateTarget.total_amount)}</strong>), and{' '}
                    {duplicateTarget.allocation_lines.length} allocation line(s) with live balance re-validation.
                  </p>
                  {duplicateError && (
                    <div className="alert alert-danger py-2 small" role="alert" data-testid="duplicate-error">
                      {duplicateError}
                    </div>
                  )}
                  <div className="mb-3">
                    <label className="form-label small fw-semibold" htmlFor="duplicate-date-input">
                      Transaction Date
                    </label>
                    <input
                      id="duplicate-date-input"
                      type="date"
                      className="form-control form-control-sm"
                      value={duplicateDate}
                      onChange={(e) => setDuplicateDate(e.target.value)}
                      required
                      data-testid="duplicate-date-input"
                    />
                  </div>
                  <div className="mb-2">
                    <label className="form-label small fw-semibold" htmlFor="duplicate-desc-input">
                      Description
                    </label>
                    <input
                      id="duplicate-desc-input"
                      type="text"
                      className="form-control form-control-sm"
                      maxLength={255}
                      value={duplicateDescription}
                      onChange={(e) => setDuplicateDescription(e.target.value)}
                      data-testid="duplicate-desc-input"
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setDuplicateTarget(null)}
                    disabled={isDuplicating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={isDuplicating}
                    data-testid="btn-confirm-duplicate"
                  >
                    {isDuplicating ? 'Duplicating...' : 'Confirm Duplicate'}
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
