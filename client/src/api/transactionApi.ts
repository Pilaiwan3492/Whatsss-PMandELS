import { axiosClient } from './axiosClient.js';
import { reportClient } from './reportApi.js';

export interface AllocationItem {
  id: string;
  target_account_id: string;
  amount: string;
  notes: string | null;
}

export interface IncomePayload {
  primary_account_id: string;
  income_account_id: string;
  total_amount: string;
  transaction_date: string;
  description?: string | null;
}

export interface IncomeTransaction {
  id: string;
  primary_account_id: string;
  form: 'RECEIVE_MONEY';
  total_amount: string;
  transaction_date: string;
  description: string | null;
  allocations: AllocationItem[];
}

export interface IncomeResponseData {
  transaction: IncomeTransaction;
  updated_balance: {
    account_id: string;
    current_balance: string;
  };
}

export interface IncomeApiResponse {
  success: boolean;
  data: IncomeResponseData;
}

export interface AllocationLinePayload {
  target_account_id: string;
  amount: string;
  notes?: string | null;
}

export interface ExpensePayload {
  primary_account_id: string;
  total_amount: string;
  transaction_date: string;
  description?: string | null;
  allocations: AllocationLinePayload[];
}

export interface ExpenseTransaction {
  id: string;
  primary_account_id: string;
  form: 'PAYMENT_CHARGE';
  total_amount: string;
  transaction_date: string;
  description: string | null;
  allocations: AllocationItem[];
}

export interface ExpenseResponseData {
  transaction: ExpenseTransaction;
  updated_debt: {
    account_id: string;
    current_debt: string;
  };
}

export interface ExpenseApiResponse {
  success: boolean;
  data: ExpenseResponseData;
}

export interface RepaymentPayload {
  from_account_id: string;
  to_account_id: string;
  amount: string;
  transaction_date: string;
  description?: string | null;
}

export interface RepaymentTransaction {
  id: string;
  primary_account_id: string;
  form: 'PAYMENT_CHARGE';
  total_amount: string;
  transaction_date: string;
  description: string | null;
  allocations: AllocationItem[];
}

export interface RepaymentResponseData {
  transaction: RepaymentTransaction;
  updated_cash_balance: string;
  updated_debt: string;
}

export interface RepaymentApiResponse {
  success: boolean;
  data: RepaymentResponseData;
}

export interface TransferPayload {
  from_account_id: string;
  to_account_id: string;
  amount: string;
  transaction_date: string;
  description?: string | null;
}

export interface TransferResponseData {
  transaction: RepaymentTransaction;
  updated_from_cash_balance: string;
  updated_to_cash_balance: string;
}

export interface TransferApiResponse {
  success: boolean;
  data: TransferResponseData;
}

export interface LoanFlowPayload {
  from_account_id: string;
  to_account_id: string;
  amount: string;
  transaction_date: string;
  description?: string | null;
}

export interface LoanTransaction {
  id: string;
  primary_account_id: string;
  form: 'PAYMENT_CHARGE' | 'RECEIVE_MONEY';
  total_amount: string;
  transaction_date: string;
  description: string | null;
  allocations: AllocationItem[];
}

export interface LoanGivenResponseData {
  transaction: LoanTransaction;
  updated_cash_balance: string;
  updated_receivable: string;
}

export interface LoanGivenApiResponse {
  success: boolean;
  data: LoanGivenResponseData;
}

export interface GeneralLoanResponseData {
  transaction: LoanTransaction;
  updated_cash_balance: string;
  updated_debt: string;
}

export interface GeneralLoanApiResponse {
  success: boolean;
  data: GeneralLoanResponseData;
}

export interface HistoryAllocationLine {
  id: string;
  transaction_id: string;
  target_account_id: string;
  target_account: {
    id: string;
    name: string;
    type: string;
    subtype?: string;
  };
  amount: number;
  notes: string | null;
}

export interface HistoryTransaction {
  id: string;
  user_id: string;
  primary_account_id: string;
  primary_account: {
    id: string;
    name: string;
    type: string;
    subtype?: string;
  };
  form: 'PAYMENT_CHARGE' | 'RECEIVE_MONEY';
  total_amount: number;
  transaction_date: string;
  description: string | null;
  is_favorite?: boolean;
  created_at: string;
  allocation_lines: HistoryAllocationLine[];
}

export interface TransactionFilterParams {
  startDate?: string;
  endDate?: string;
  accountId?: string;
  categoryId?: string;
  form?: 'PAYMENT_CHARGE' | 'RECEIVE_MONEY';
  type?: 'INCOME' | 'EXPENSE' | 'REPAYMENT' | 'TRANSFER' | 'LOAN';
  favorite?: 'true' | 'false';
  q?: string;
}

export interface DuplicatePayload {
  transaction_date?: string;
  description?: string;
}

export interface TransactionsApiResponse {
  success: boolean;
  data: {
    transactions: HistoryTransaction[];
  };
}

/**
 * Records an income inflow into an owned CASH account.
 * Atomically locks opening balance on the destination account upon commit.
 */
export async function recordIncome(payload: IncomePayload): Promise<IncomeResponseData> {
  const res = await axiosClient.post<IncomeApiResponse>('/transactions/income', payload);
  return res.data.data;
}

/**
 * Records an expense / credit card purchase into an owned LOAN_TAKEN account
 * with multiple split allocation lines.
 * Enforces Split Sum Integrity and atomically locks opening balances.
 */
export async function recordExpense(payload: ExpensePayload): Promise<ExpenseResponseData> {
  const res = await axiosClient.post<ExpenseApiResponse>('/transactions/expense', payload);
  return res.data.data;
}

/**
 * Records a credit card debt settlement repayment (Transaction 3 of Golden Journey, WP-05, F-07).
 * Atomically decreases Cash balance and Credit Card debt balance while strictly excluding
 * repayment transaction from Expense summaries (BR-07, BR-08).
 */
export async function recordRepayment(payload: RepaymentPayload): Promise<RepaymentResponseData> {
  const res = await axiosClient.post<RepaymentApiResponse>('/transactions/repayment', payload);
  return res.data.data;
}

/**
 * Records an internal cash transfer between two owned CASH accounts (F-11, WP-08, FR-13, BR-02).
 */
export async function recordTransfer(payload: TransferPayload): Promise<TransferResponseData> {
  const res = await axiosClient.post<TransferApiResponse>('/transactions/transfer', payload);
  return res.data.data;
}

/**
 * Disburses funds from a CASH account to a LOAN_GIVEN account (F-12, WP-09, FR-14, BR-08).
 */
export async function recordLoanGiven(payload: LoanFlowPayload): Promise<LoanGivenResponseData> {
  const res = await axiosClient.post<LoanGivenApiResponse>('/transactions/loan-given', payload);
  return res.data.data;
}

/**
 * Recovers principal from a LOAN_GIVEN account into a CASH account (F-12, WP-09, FR-14, BR-08).
 */
export async function recordLoanRecovery(payload: LoanFlowPayload): Promise<LoanGivenResponseData> {
  const res = await axiosClient.post<LoanGivenApiResponse>('/transactions/loan-recovery', payload);
  return res.data.data;
}

/**
 * Records money borrowed from a general LOAN_TAKEN account (subtype GENERAL_LOAN) into a CASH account (F-13, WP-09, FR-15, BR-08).
 */
export async function recordLoanBorrowing(payload: LoanFlowPayload): Promise<GeneralLoanResponseData> {
  const res = await axiosClient.post<GeneralLoanApiResponse>('/transactions/loan-borrowing', payload);
  return res.data.data;
}

/**
 * Repays general loan principal from a CASH account to a general LOAN_TAKEN account (subtype GENERAL_LOAN) (F-13, WP-09, FR-15, BR-08).
 */
export async function recordLoanRepayment(payload: LoanFlowPayload): Promise<GeneralLoanResponseData> {
  const res = await axiosClient.post<GeneralLoanApiResponse>('/transactions/loan-repayment', payload);
  return res.data.data;
}

/**
 * Fetches chronological transaction history for the authenticated tenant with optional
 * search & multi-criteria filtering (WP-06, WP-10, F-09, F-15, FR-11, FR-18).
 */
export async function getTransactions(
  filters?: TransactionFilterParams
): Promise<HistoryTransaction[]> {
  if (filters) {
    const cleanParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        cleanParams[k] = String(v).trim();
      }
    }
    if (Object.keys(cleanParams).length > 0) {
      const res = await reportClient.get<TransactionsApiResponse>('/transactions', {
        params: cleanParams
      });
      return res.data.data.transactions;
    }
  }
  const res = await reportClient.get<TransactionsApiResponse>('/transactions');
  return res.data.data.transactions;
}

/**
 * Toggles favorite status on a user-owned transaction (F-14, WP-10, FR-16, AC-14-1).
 */
export async function toggleFavorite(
  transactionId: string,
  is_favorite: boolean
): Promise<HistoryTransaction> {
  const res = await axiosClient.patch<{ success: boolean; data: { transaction: HistoryTransaction } }>(
    `/transactions/${transactionId}/favorite`,
    { is_favorite }
  );
  return res.data.data.transaction;
}

/**
 * Duplicates an existing user-owned transaction with live re-validation (F-14, WP-10, FR-17, AC-14-2..3).
 */
export async function duplicateTransaction(
  transactionId: string,
  payload: DuplicatePayload = {}
): Promise<any> {
  const res = await axiosClient.post<{ success: boolean; data: { transaction: any } }>(
    `/transactions/${transactionId}/duplicate`,
    payload
  );
  return res.data.data.transaction;
}
