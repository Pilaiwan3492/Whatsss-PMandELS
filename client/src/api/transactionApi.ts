import { axiosClient } from './axiosClient.js';

export interface IncomePayload {
  primary_account_id: string;
  income_account_id: string;
  total_amount: string;
  transaction_date: string;
  description?: string | null;
}

export interface AllocationItem {
  id: string;
  target_account_id: string;
  amount: string;
  notes: string | null;
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

/**
 * Records an income inflow into an owned CASH account.
 * Atomically locks opening balance on the destination account upon commit.
 */
export async function recordIncome(payload: IncomePayload): Promise<IncomeResponseData> {
  const res = await axiosClient.post<IncomeApiResponse>('/transactions/income', payload);
  return res.data.data;
}
