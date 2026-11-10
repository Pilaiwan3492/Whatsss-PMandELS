import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTransactions, HistoryTransaction } from '../api/transactionApi.js';

export const TransactionHistoryPage: React.FC = () => {
  const [transactions, setTransactions] = useState<HistoryTransaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE' | 'REPAYMENT'>('ALL');
  const [expandedTxnIds, setExpandedTxnIds] = useState<Set<string>>(new Set());

  const fetchHistory = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await getTransactions();
      setTransactions(data);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.error?.message || err?.message || 'Failed to load transaction history. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

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

  const getTransactionKind = (tx: HistoryTransaction): 'INCOME' | 'EXPENSE' | 'REPAYMENT' => {
    if (tx.form === 'RECEIVE_MONEY') return 'INCOME';
    if (tx.primary_account?.type === 'CASH') return 'REPAYMENT';
    return 'EXPENSE';
  };

  const filteredTransactions = transactions.filter((tx) => {
    if (selectedFilter === 'ALL') return true;
    return getTransactionKind(tx) === selectedFilter;
  });

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
            Chronological audit ledger of all recorded inflows, split expenditures, and debt repayments.
          </p>
        </div>
        <div className="d-flex gap-2 mt-3 mt-md-0">
          <button className="btn btn-outline-secondary btn-sm" onClick={fetchHistory} id="btn-refresh-history">
            ↻ Refresh
          </button>
          <Link to="/accounts" className="btn btn-outline-primary btn-sm">
            View Accounts
          </Link>
        </div>
      </div>

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
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center mb-4" role="alert">
          <div>
            <strong>Error:</strong> {errorMessage}
          </div>
          <button className="btn btn-outline-danger btn-sm" onClick={fetchHistory}>
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
        <div className="card shadow-sm border p-5 text-center my-4" data-testid="empty-history-state">
          <div className="mb-3 fs-1 text-muted">📋</div>
          <h4 className="fw-bold mb-2">No transactions recorded yet</h4>
          <p className="text-muted mb-4 small">
            Start by setting an opening balance or recording your first income inflow from the dashboard.
          </p>
          <div className="d-flex justify-content-center gap-2">
            <Link to="/dashboard" className="btn btn-primary btn-sm">
              Return to Dashboard
            </Link>
          </div>
        </div>
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
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => {
                  const kind = getTransactionKind(tx);
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
                                : 'bg-warning text-dark'
                            }`}
                            data-testid={`badge-${tx.id}`}
                          >
                            {kind === 'INCOME' ? 'Income' : kind === 'REPAYMENT' ? 'Repayment' : 'Expense'}
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
                            kind === 'INCOME' ? 'text-success' : 'text-danger'
                          }`}
                          data-testid={`amount-${tx.id}`}
                        >
                          {kind === 'INCOME' ? '+' : '-'} {formatCurrency(tx.total_amount)}
                        </td>
                      </tr>

                      {/* Expanded Sub-Row for Split Allocations */}
                      {isExpanded && (
                        <tr className="table-light" data-testid={`expanded-row-${tx.id}`}>
                          <td colSpan={7} className="p-3">
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
    </div>
  );
};
