import { axiosClient } from './axiosClient.js';

export type AccountType = 'CASH' | 'LOAN_TAKEN' | 'LOAN_GIVEN' | 'INCOME' | 'EXPENSE';

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  opening_balance: number;
  is_opening_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccountsResponse {
  success: boolean;
  data: {
    accounts: Account[];
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

export async function updateOpeningBalance(id: string, opening_balance: number): Promise<Account> {
  const res = await axiosClient.patch<UpdateOpeningBalanceResponse>(`/accounts/${id}/opening-balance`, {
    opening_balance
  });
  return res.data.data.account;
}
