import axios from 'axios';

const defaultBaseUrl = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api';

export const reportClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || defaultBaseUrl,
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

export interface CategorySpendingItem {
  category_id: string;
  category_name: string;
  total_amount: string;
  percentage: string;
  transaction_count: number;
}

export interface CategorySpendingReportData {
  period?: {
    start_date: string | null;
    end_date: string | null;
  };
  total_expense: string;
  categories: CategorySpendingItem[];
}

export interface CategorySpendingReportResponse {
  success: boolean;
  data: CategorySpendingReportData;
}

export async function getCategorySpendingReport(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<CategorySpendingReportData> {
  const queryParams: Record<string, string> = {};
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  const res = await reportClient.get<CategorySpendingReportResponse>('/reports/categories', {
    params: queryParams
  });
  return res.data.data;
}
