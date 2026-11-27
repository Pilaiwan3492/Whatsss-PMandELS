import { axiosClient } from './axiosClient.js';

export type AccountType = 'CASH' | 'LOAN_TAKEN' | 'LOAN_GIVEN' | 'INCOME' | 'EXPENSE';
export type AccountSubtype = 'DEFAULT' | 'CREDIT_CARD' | 'GENERAL_LOAN';

export interface Account {
  id: string;
  user_id: string;
  name: string;
  normalized_name?: string;
  type: AccountType;
  subtype?: AccountSubtype;
  opening_balance: number;
  current_balance?: number;
  is_opening_locked: boolean;
  is_archived?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAccountPayload {
  name: string;
  type: AccountType;
  subtype?: AccountSubtype;
  opening_balance?: number;
}

export interface UpdateAccountPayload {
  name: string;
}

export interface AccountsResponse {
  success: boolean;
  data: {
    accounts: Account[];
  };
}

export interface SingleAccountResponse {
  success: boolean;
  data: {
    account: Account;
  };
}

export interface UpdateOpeningBalanceResponse {
  success: boolean;
  data: {
    account: Account;
  };
}

export async function getAccounts(): Promise<Account[]> {
  const res = await axiosClient.get<AccountsResponse>('/accounts');
  return res.data.data.accounts;
}

export async function createAccount(payload: CreateAccountPayload): Promise<Account> {
  const res = await axiosClient.post<SingleAccountResponse>('/accounts', payload);
  return res.data.data.account;
}

export async function updateAccount(id: string, payload: UpdateAccountPayload): Promise<Account> {
  const res = await axiosClient.patch<SingleAccountResponse>(`/accounts/${id}`, payload);
  return res.data.data.account;
}

export async function updateOpeningBalance(id: string, opening_balance: number): Promise<Account> {
  const res = await axiosClient.patch<UpdateOpeningBalanceResponse>(`/accounts/${id}/opening-balance`, {
    opening_balance
  });
  return res.data.data.account;
}
