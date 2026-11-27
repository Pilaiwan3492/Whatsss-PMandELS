import React, { useEffect, useState } from 'react';
import {
  correctTransaction,
  HistoryTransaction
} from '../api/transactionApi.js';
import { getAccounts, Account } from '../api/accountApi.js';

interface TransactionCorrectionModalProps {
  transaction: HistoryTransaction;
  accounts?: Account[];
  onClose: () => void;
  onSuccess: () => void;
}

interface EditableAllocation {
  rowKey: string;
  target_account_id: string;
  target_name: string;
  amount: string;
  notes: string;
}

function parseToCents(val: string): number | null {
  const trimmed = val.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const cents = parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, '0'), 10);
  return cents > 0 ? cents : null;
}

function isExplicitLoanTakenSubtype(subtype: unknown): subtype is 'CREDIT_CARD' | 'GENERAL_LOAN' {
  return subtype === 'CREDIT_CARD' || subtype === 'GENERAL_LOAN';
}

export function isAccountAllowedTarget(tx: HistoryTransaction, acc: Account): boolean {
  if (tx.form === 'RECEIVE_MONEY') {
    if (acc.type === 'LOAN_TAKEN') {
      return acc.subtype === 'GENERAL_LOAN';
    }
    return ['INCOME', 'LOAN_GIVEN', 'CASH'].includes(acc.type);
  }
  // PAYMENT_CHARGE
  if (tx.primary_account?.type === 'LOAN_TAKEN') {
    if (tx.primary_account.subtype !== 'CREDIT_CARD') {
      return false;
    }
    return acc.type === 'EXPENSE';
  }
  if (tx.primary_account?.type === 'CASH') {
    if (acc.id === tx.primary_account_id) return false;
    if (acc.type === 'LOAN_TAKEN') {
      return isExplicitLoanTakenSubtype(acc.subtype);
    }
    return ['EXPENSE', 'LOAN_GIVEN', 'CASH'].includes(acc.type);
  }
  return acc.type === 'EXPENSE';
}

export const TransactionCorrectionModal: React.FC<TransactionCorrectionModalProps> = ({
  transaction,
  accounts: providedAccounts,
  onClose,
  onSuccess
}) => {
  const [availableAccounts, setAvailableAccounts] = useState<Account[]>(providedAccounts || []);
  const [totalAmount, setTotalAmount] = useState<string>(transaction.total_amount.toFixed(2));
  const [transactionDate, setTransactionDate] = useState<string>(transaction.transaction_date);
  const [description, setDescription] = useState<string>(transaction.description || '');
  const [allocations, setAllocations] = useState<EditableAllocation[]>(
    (transaction.allocation_lines || []).map((line, i) => ({
      rowKey: line.id || `init-${i}`,
      target_account_id: line.target_account_id,
      target_name: line.target_account?.name || line.target_account_id,
      amount: line.amount.toFixed(2),
      notes: line.notes || ''
    }))
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (providedAccounts && providedAccounts.length > 0) {
      setAvailableAccounts(providedAccounts);
      return;
    }
    let mounted = true;
    getAccounts()
      .then((accs) => {
        if (mounted && Array.isArray(accs)) {
          setAvailableAccounts(accs);
        }
      })
      .catch(() => {
        // Gracefully fall back to existing allocation targets if accounts API is unavailable in isolated unit tests
      });
    return () => {
      mounted = false;
    };
  }, [providedAccounts]);

  const selectableAccounts = availableAccounts.filter(
    (acc) => !acc.is_archived && isAccountAllowedTarget(transaction, acc)
  );

  const accountById = new Map<string, Account>(availableAccounts.map((a) => [a.id, a]));

  const handleAllocationChange = (
    idx: number,
    field: 'target_account_id' | 'amount' | 'notes',
    value: string
  ) => {
    setErrorMessage(null);
    setAllocations((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        if (field === 'target_account_id') {
          const acc = accountById.get(value);
          return {
            ...item,
            target_account_id: value,
            target_name: acc ? acc.name : value
          };
        }
        return { ...item, [field]: value };
      })
    );
  };

  const handleAddAllocation = () => {
    setErrorMessage(null);
    const usedIds = new Set(allocations.map((a) => a.target_account_id));
    const nextCandidate = selectableAccounts.find((a) => !usedIds.has(a.id));
    setAllocations((prev) => [
      ...prev,
      {
        rowKey: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        target_account_id: nextCandidate ? nextCandidate.id : '',
        target_name: nextCandidate ? nextCandidate.name : '',
        amount: '',
        notes: ''
      }
    ]);
  };

  const handleRemoveAllocation = (idx: number) => {
    setErrorMessage(null);
    setAllocations((prev) => prev.filter((_, i) => i !== idx));
  };

  const validateBeforeSubmit = (): string | null => {
    const totalCents = parseToCents(totalAmount);
    if (totalCents === null) {
      return 'Total amount must be a positive decimal with at most 2 decimal places.';
    }

    if (allocations.length === 0) {
      return 'At least one allocation line is required.';
    }

    const seenTargets = new Set<string>();
    let sumCents = 0;

    for (const line of allocations) {
      if (!line.target_account_id || line.target_account_id.trim() === '') {
        return 'Each allocation line must select a target account.';
      }
      if (seenTargets.has(line.target_account_id)) {
        return 'Duplicate target account is not allowed in split allocations.';
      }
      seenTargets.add(line.target_account_id);

      const matchedAcc = accountById.get(line.target_account_id);
      if (matchedAcc?.is_archived) {
        return `Cannot allocate to archived account "${matchedAcc.name}".`;
      }

      const lineCents = parseToCents(line.amount);
      if (lineCents === null) {
        return 'Each allocation amount must be a positive decimal with at most 2 decimal places.';
      }
      sumCents += lineCents;
    }

    if (sumCents !== totalCents) {
      return `Sum of allocations (${(sumCents / 100).toFixed(2)} THB) must equal total amount (${(
        totalCents / 100
      ).toFixed(2)} THB).`;
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validationError = validateBeforeSubmit();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await correctTransaction(transaction.id, {
        total_amount: totalAmount.trim(),
        transaction_date: transactionDate,
        description,
        allocations: allocations.map((a) => ({
          target_account_id: a.target_account_id,
          amount: a.amount.trim(),
          notes: a.notes || null
        }))
      });
      onSuccess();
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.error?.message ||
          err?.message ||
          'Failed to save transaction correction.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentAllocSumCents = allocations.reduce((acc, l) => {
    const c = parseToCents(l.amount);
    return acc + (c ?? 0);
  }, 0);

  return (
    <div
      className="modal d-block"
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      data-testid="correction-modal"
    >
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <form onSubmit={handleSubmit} noValidate>
            <div className="modal-header">
              <h5 className="modal-title">Correct Transaction</h5>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={onClose}
                disabled={isSubmitting}
              />
            </div>
            <div className="modal-body">
              <p className="small text-muted mb-3">
                Updates transaction atomically and records an immutable audit snapshot (FR-19).
              </p>
              {errorMessage && (
                <div
                  className="alert alert-danger py-2 small"
                  role="alert"
                  data-testid="correction-error"
                >
                  {errorMessage}
                </div>
              )}

              <div className="row g-3 mb-3">
                <div className="col-md-4">
                  <label className="form-label small fw-semibold" htmlFor="corr-total-amount">
                    Total Amount (THB)
                  </label>
                  <input
                    id="corr-total-amount"
                    type="text"
                    className="form-control form-control-sm"
                    value={totalAmount}
                    onChange={(e) => {
                      setErrorMessage(null);
                      setTotalAmount(e.target.value);
                    }}
                    required
                    data-testid="corr-total-amount"
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold" htmlFor="corr-date">
                    Transaction Date
                  </label>
                  <input
                    id="corr-date"
                    type="date"
                    className="form-control form-control-sm"
                    value={transactionDate}
                    onChange={(e) => {
                      setErrorMessage(null);
                      setTransactionDate(e.target.value);
                    }}
                    required
                    data-testid="corr-date"
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold" htmlFor="corr-description">
                    Description
                  </label>
                  <input
                    id="corr-description"
                    type="text"
                    className="form-control form-control-sm"
                    maxLength={255}
                    value={description}
                    onChange={(e) => {
                      setErrorMessage(null);
                      setDescription(e.target.value);
                    }}
                    data-testid="corr-description"
                  />
                </div>
              </div>

              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="small fw-bold text-muted text-uppercase mb-0">
                  Allocation Lines (Sum: {(currentAllocSumCents / 100).toFixed(2)} THB)
                </h6>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={handleAddAllocation}
                  disabled={isSubmitting}
                  data-testid="btn-add-allocation"
                >
                  + Add Allocation
                </button>
              </div>

              {allocations.length === 0 ? (
                <div className="alert alert-warning py-2 small" data-testid="empty-allocations-warning">
                  No allocation lines. Add at least one allocation line matching the total amount.
                </div>
              ) : (
                allocations.map((alloc, idx) => {
                  const existingTargetAcc = accountById.get(alloc.target_account_id);
                  const options: Array<{ id: string; label: string; archived?: boolean }> =
                    selectableAccounts.map((acc) => ({
                      id: acc.id,
                      label: `${acc.name} (${acc.type})`
                    }));
                  // Preserve currently bound target in dropdown if not in selectableAccounts (e.g. archived or unloaded)
                  if (
                    alloc.target_account_id &&
                    !options.some((o) => o.id === alloc.target_account_id)
                  ) {
                    options.unshift({
                      id: alloc.target_account_id,
                      label: existingTargetAcc?.is_archived
                        ? `${existingTargetAcc.name} [Archived]`
                        : alloc.target_name || alloc.target_account_id,
                      archived: Boolean(existingTargetAcc?.is_archived)
                    });
                  }

                  return (
                    <div
                      className="row g-2 mb-2 align-items-center"
                      key={alloc.rowKey}
                      data-testid={`corr-alloc-row-${idx}`}
                    >
                      <div className="col-md-4">
                        <select
                          aria-label={`Target account for allocation ${idx + 1}`}
                          className="form-select form-select-sm"
                          value={alloc.target_account_id}
                          onChange={(e) =>
                            handleAllocationChange(idx, 'target_account_id', e.target.value)
                          }
                          disabled={isSubmitting}
                          data-testid={`corr-alloc-target-${idx}`}
                        >
                          <option value="">-- Select Account --</option>
                          {options.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-3">
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="0.00"
                          value={alloc.amount}
                          onChange={(e) => handleAllocationChange(idx, 'amount', e.target.value)}
                          disabled={isSubmitting}
                          required
                          data-testid={`corr-alloc-amount-${idx}`}
                        />
                      </div>
                      <div className="col-md-4">
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Notes"
                          value={alloc.notes}
                          onChange={(e) => handleAllocationChange(idx, 'notes', e.target.value)}
                          disabled={isSubmitting}
                          data-testid={`corr-alloc-notes-${idx}`}
                        />
                      </div>
                      <div className="col-md-1 text-end">
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          aria-label={`Remove allocation ${idx + 1}`}
                          onClick={() => handleRemoveAllocation(idx)}
                          disabled={isSubmitting}
                          data-testid={`btn-remove-allocation-${idx}`}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={isSubmitting}
                data-testid="btn-save-correction"
              >
                {isSubmitting ? 'Saving...' : 'Save Correction'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
