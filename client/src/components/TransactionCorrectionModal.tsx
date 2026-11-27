import React, { useState } from 'react';
import {
  correctTransaction,
  HistoryTransaction
} from '../api/transactionApi.js';

interface TransactionCorrectionModalProps {
  transaction: HistoryTransaction;
  onClose: () => void;
  onSuccess: () => void;
}

interface EditableAllocation {
  target_account_id: string;
  target_name: string;
  amount: string;
  notes: string;
}

export const TransactionCorrectionModal: React.FC<TransactionCorrectionModalProps> = ({
  transaction,
  onClose,
  onSuccess
}) => {
  const [totalAmount, setTotalAmount] = useState<string>(transaction.total_amount.toFixed(2));
  const [transactionDate, setTransactionDate] = useState<string>(transaction.transaction_date);
  const [description, setDescription] = useState<string>(transaction.description || '');
  const [allocations, setAllocations] = useState<EditableAllocation[]>(
    (transaction.allocation_lines || []).map((line) => ({
      target_account_id: line.target_account_id,
      target_name: line.target_account?.name || line.target_account_id,
      amount: line.amount.toFixed(2),
      notes: line.notes || ''
    }))
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAllocationChange = (
    idx: number,
    field: 'amount' | 'notes',
    value: string
  ) => {
    setAllocations((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await correctTransaction(transaction.id, {
        total_amount: totalAmount,
        transaction_date: transactionDate,
        description,
        allocations: allocations.map((a) => ({
          target_account_id: a.target_account_id,
          amount: a.amount,
          notes: a.notes || null
        }))
      });
      onSuccess();
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.error?.message || err?.message || 'Failed to save transaction correction.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal d-block"
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      data-testid="correction-modal"
    >
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <h5 className="modal-title">Correct Transaction</h5>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={onClose}
              />
            </div>
            <div className="modal-body">
              <p className="small text-muted mb-3">
                Updates transaction atomically and records an immutable audit snapshot (FR-19).
              </p>
              {errorMessage && (
                <div className="alert alert-danger py-2 small" role="alert" data-testid="correction-error">
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
                    onChange={(e) => setTotalAmount(e.target.value)}
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
                    onChange={(e) => setTransactionDate(e.target.value)}
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
                    onChange={(e) => setDescription(e.target.value)}
                    data-testid="corr-description"
                  />
                </div>
              </div>

              <h6 className="small fw-bold text-muted text-uppercase mb-2">Allocation Lines</h6>
              {allocations.map((alloc, idx) => (
                <div className="row g-2 mb-2 align-items-center" key={alloc.target_account_id}>
                  <div className="col-md-4 small fw-semibold">{alloc.target_name}</div>
                  <div className="col-md-3">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={alloc.amount}
                      onChange={(e) => handleAllocationChange(idx, 'amount', e.target.value)}
                      required
                      data-testid={`corr-alloc-amount-${idx}`}
                    />
                  </div>
                  <div className="col-md-5">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Notes"
                      value={alloc.notes}
                      onChange={(e) => handleAllocationChange(idx, 'notes', e.target.value)}
                      data-testid={`corr-alloc-notes-${idx}`}
                    />
                  </div>
                </div>
              ))}
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
