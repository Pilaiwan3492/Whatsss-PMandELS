import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { getFinancialSummary, FinancialSummaryData } from '../api/reportApi.js';
import { getTransactions, HistoryTransaction } from '../api/transactionApi.js';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  const [summary, setSummary] = useState<FinancialSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [recentTransactions, setRecentTransactions] = useState<HistoryTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const summaryData = await getFinancialSummary();
      setSummary(summaryData);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Failed to load financial summary';
      if (!msg.includes('Unhandled url')) {
        setSummaryError(msg);
      }
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadRecentTransactions = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const txns = await getTransactions();
      setRecentTransactions(Array.isArray(txns) ? txns.slice(0, 5) : []);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Unable to load recent transactions.';
      if (!msg.includes('Unhandled url')) {
        setHistoryError('Unable to load recent transactions.');
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    await Promise.all([loadSummary(), loadRecentTransactions()]);
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatCurrency = (amount: number | undefined): string => {
    if (amount === undefined || isNaN(amount)) return '0.00 THB';
    return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
  };

  return (
    <div className="container py-4">
      {/* Welcome & Overview Header */}
      <div className="p-4 bg-light rounded-3 shadow-sm mb-4 border">
        <div className="d-flex flex-wrap justify-content-between align-items-center">
          <div>
            <h2 className="fw-bold mb-2">Welcome, {user?.username}!</h2>
            <p className="text-muted mb-0">
              Role: <span className="badge bg-primary">{user?.role}</span> | Email: {user?.email}
            </p>
          </div>
          <div className="d-flex gap-2 mt-3 mt-md-0">
            <Link to="/accounts" className="btn btn-success btn-sm d-flex align-items-center gap-1" id="btn-quick-income">
              <span>+</span> Record Income
            </Link>
            <Link to="/accounts" className="btn btn-warning btn-sm d-flex align-items-center gap-1 text-dark" id="btn-quick-expense">
              <span>-</span> Record Expense
            </Link>
            <Link to="/accounts" className="btn btn-primary btn-sm d-flex align-items-center gap-1" id="btn-quick-repayment">
              <span>💳</span> Pay Debt
            </Link>
            <Link to="/transactions" className="btn btn-outline-secondary btn-sm" id="btn-view-history">
              History
            </Link>
          </div>
        </div>
      </div>

      {/* Summary Error Alert */}
      {summaryError && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center mb-4" role="alert" data-testid="summary-error-alert">
          <div>
            <strong>Error:</strong> {summaryError}
          </div>
          <button className="btn btn-outline-danger btn-sm" onClick={fetchDashboardData}>
            Retry
          </button>
        </div>
      )}

      {/* Loading State for Summary */}
      {summaryLoading ? (
        <div className="d-flex justify-content-center align-items-center py-5" data-testid="dashboard-loading">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading dashboard metrics...</span>
          </div>
        </div>
      ) : summary ? (
        <>
          {/* 4 Summary Metric Cards (AC-08-1) */}
          <div className="row g-3 mb-4" data-testid="summary-cards">
            {/* 1. Checking Bank Balance */}
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card h-100 shadow-sm border-0 border-start border-4 border-success">
                <div className="card-body">
                  <span className="text-muted small text-uppercase fw-semibold">Checking Bank Balance</span>
                  <h3 className="fw-bold mt-2 mb-1 text-success" data-testid="metric-bank-balance">
                    {formatCurrency(summary.bank_balance)}
                  </h3>
                  <small className="text-muted">Liquid cash funds</small>
                </div>
              </div>
            </div>

            {/* 2. Credit Card Debt */}
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card h-100 shadow-sm border-0 border-start border-4 border-danger">
                <div className="card-body">
                  <span className="text-muted small text-uppercase fw-semibold">Credit Card Debt</span>
                  <h3
                    className={`fw-bold mt-2 mb-1 ${summary.credit_debt === 0 ? 'text-secondary' : 'text-danger'}`}
                    data-testid="metric-credit-debt"
                  >
                    {formatCurrency(summary.credit_debt)}
                  </h3>
                  <small className="text-muted">
                    {summary.credit_debt === 0 ? 'Fully settled (0 debt)' : 'Outstanding liability'}
                  </small>
                </div>
              </div>
            </div>

            {/* 3. Total Income */}
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card h-100 shadow-sm border-0 border-start border-4 border-info">
                <div className="card-body">
                  <span className="text-muted small text-uppercase fw-semibold">Total Income</span>
                  <h3 className="fw-bold mt-2 mb-1 text-info" data-testid="metric-total-income">
                    {formatCurrency(summary.total_income)}
                  </h3>
                  <small className="text-muted">Excludes opening balance</small>
                </div>
              </div>
            </div>

            {/* 4. Total Expense */}
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card h-100 shadow-sm border-0 border-start border-4 border-warning">
                <div className="card-body">
                  <span className="text-muted small text-uppercase fw-semibold">Total Expenses</span>
                  <h3 className="fw-bold mt-2 mb-1 text-warning text-dark" data-testid="metric-total-expense">
                    {formatCurrency(summary.total_expense)}
                  </h3>
                  <small className="text-muted">Excludes debt repayments</small>
                </div>
              </div>
            </div>
          </div>

          {/* Lower Pane: Category Breakdown & Recent Transactions */}
          <div className="row g-4 mb-4">
            {/* Expense Category Breakdown */}
            <div className="col-12 col-lg-5">
              <div className="card shadow-sm h-100 border">
                <div className="card-header bg-white py-3 border-bottom">
                  <h5 className="fw-bold mb-0">Expense Category Breakdown</h5>
                </div>
                <div className="card-body" data-testid="category-breakdown-section">
                  {summary.categories && summary.categories.length > 0 ? (
                    <div className="d-flex flex-column gap-3">
                      {summary.categories.map((cat) => {
                        const percentage = summary.total_expense > 0
                          ? Math.round((cat.amount / summary.total_expense) * 100)
                          : 0;

                        return (
                          <div key={cat.name} data-testid={`category-row-${cat.name}`}>
                            <div className="d-flex justify-content-between align-items-center mb-1">
                              <span className="fw-semibold">{cat.name}</span>
                              <span className="fw-bold text-dark">{formatCurrency(cat.amount)} ({percentage}%)</span>
                            </div>
                            <div className="progress" style={{ height: '8px' }}>
                              <div
                                className="progress-bar bg-primary"
                                role="progressbar"
                                style={{ width: `${percentage}%` }}
                                aria-valuenow={percentage}
                                aria-valuemin={0}
                                aria-valuemax={100}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted">
                      <p className="mb-0">No expense allocations recorded yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Transaction Activity */}
            <div className="col-12 col-lg-7">
              <div className="card shadow-sm h-100 border">
                <div className="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
                  <h5 className="fw-bold mb-0">Recent Transactions</h5>
                  <Link to="/transactions" className="btn btn-sm btn-link text-decoration-none">
                    View Full History &rarr;
                  </Link>
                </div>
                <div className="card-body p-0" data-testid="recent-transactions-section">
                  {historyLoading ? (
                    <div className="text-center py-5 text-muted" data-testid="history-loading">
                      <div className="spinner-border spinner-border-sm text-secondary me-2" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                      <span>Loading recent transactions...</span>
                    </div>
                  ) : historyError ? (
                    <div className="p-4" data-testid="history-error-container">
                      <div className="alert alert-warning d-flex justify-content-between align-items-center mb-0" role="alert">
                        <span>{historyError}</span>
                        <button className="btn btn-outline-dark btn-sm" onClick={loadRecentTransactions}>
                          Retry
                        </button>
                      </div>
                    </div>
                  ) : recentTransactions.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th className="text-end">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentTransactions.map((tx) => (
                            <tr key={tx.id}>
                              <td className="small text-muted">{tx.transaction_date}</td>
                              <td>
                                <span
                                  className={`badge ${
                                    tx.form === 'RECEIVE_MONEY'
                                      ? 'bg-success'
                                      : tx.primary_account?.type === 'CASH'
                                      ? 'bg-primary'
                                      : 'bg-warning text-dark'
                                  }`}
                                >
                                  {tx.form === 'RECEIVE_MONEY'
                                    ? 'Income'
                                    : tx.primary_account?.type === 'CASH'
                                    ? 'Repayment'
                                    : 'Expense'}
                                </span>
                              </td>
                              <td className="small">{tx.description || 'Transaction'}</td>
                              <td
                                className={`text-end fw-bold small ${
                                  tx.form === 'RECEIVE_MONEY' ? 'text-success' : 'text-danger'
                                }`}
                              >
                                {tx.form === 'RECEIVE_MONEY' ? '+' : '-'} {formatCurrency(tx.total_amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-5 text-muted" data-testid="history-empty">
                      <p className="mb-0">No transactions recorded yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
