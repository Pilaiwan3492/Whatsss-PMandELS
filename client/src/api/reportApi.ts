import axios from 'axios';

export const reportClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

export interface CategorySummary {
  name: string;
  amount: number;
}

export interface FinancialSummaryData {
  bank_balance: number;
  credit_debt: number;
  total_income: number;
  total_expense: number;
  category_breakdown: Record<string, number>;
  categories: CategorySummary[];
}

export interface FinancialSummaryResponse {
  success: boolean;
  data: FinancialSummaryData;
}

/**
 * Fetches real-time financial summaries for the authenticated tenant (F-08, WP-06, FR-10, AC-08-1).
 */
export async function getFinancialSummary(): Promise<FinancialSummaryData> {
  const res = await reportClient.get<FinancialSummaryResponse>('/reports/summary');
  return res.data.data;
}
