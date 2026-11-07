import { axiosClient } from './axiosClient.js';

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
