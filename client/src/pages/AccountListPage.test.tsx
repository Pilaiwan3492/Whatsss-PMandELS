import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.js';
import { App } from '../App.js';
import { axiosClient } from '../api/axiosClient.js';

describe('Frontend Financial Accounts & Opening Balance Suite (WP-02)', () => {
  const mockUserDemo = {
    id: 'u1-uuid',
    username: 'user_demo',
    email: 'user_demo@whatsss.local',
    role: 'USER'
  };

  const mockAdminDemo = {
    id: 'admin-uuid',
    username: 'admin_demo',
    email: 'admin_demo@whatsss.local',
    role: 'ADMIN'
  };

  const mockAccountsList = [
    {
      id: 'acc-1',
      user_id: 'u1-uuid',
      name: 'Checking Bank',
      type: 'CASH',
      opening_balance: 0.00,
      is_opening_locked: false,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z'
    },
    {
      id: 'acc-2',
      user_id: 'u1-uuid',
      name: 'Visa Credit Card',
      type: 'LOAN_TAKEN',
      opening_balance: 0.00,
      is_opening_locked: true,
      created_at: '2026-11-01T00:00:01.000Z',
      updated_at: '2026-11-01T00:00:01.000Z'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders accounts list with unlocked button and locked badge', async () => {
    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return { data: { success: true, data: { user: mockUserDemo } } };
      }
      if (url === '/accounts') {
        return { data: { success: true, data: { accounts: mockAccountsList } } };
      }
      throw new Error(`Unhandled get url: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Checking Bank')).toBeDefined();
      expect(screen.getByText('Visa Credit Card')).toBeDefined();
    });

    // Checking Bank is unlocked -> has button
    expect(screen.getByRole('button', { name: 'Set Opening Balance' })).toBeDefined();

    // Visa Credit Card is locked -> has locked badge
    expect(screen.getByText('Opening balance locked')).toBeDefined();
  });

  it('opens opening balance modal and submits valid balance update', async () => {
    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return { data: { success: true, data: { user: mockUserDemo } } };
      }
      if (url === '/accounts') {
        return { data: { success: true, data: { accounts: mockAccountsList } } };
      }
      throw new Error(`Unhandled get url: ${url}`);
    });

    const patchSpy = vi.spyOn(axiosClient, 'patch').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          account: {
            ...mockAccountsList[0],
            opening_balance: 10000.00
          }
        }
      }
    });

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Checking Bank')).toBeDefined();
    });

    // Click Set Opening Balance
    fireEvent.click(screen.getByRole('button', { name: 'Set Opening Balance' }));

    // Modal appears
    await waitFor(() => {
      expect(screen.getByText('Set Opening Balance: Checking Bank')).toBeDefined();
    });

    const input = screen.getByLabelText('Opening Balance (THB)');
    fireEvent.change(input, { target: { value: '10000.00' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('/accounts/acc-1/opening-balance', {
        opening_balance: 10000.00
      });
    });

    // Modal is closed and balance is updated on page
    await waitFor(() => {
      expect(screen.queryByText('Set Opening Balance: Checking Bank')).toBeNull();
      expect(screen.getByText(/10,000\.00/)).toBeDefined();
    });
  });

  it('validates client-side input and rejects negative numbers', async () => {
    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return { data: { success: true, data: { user: mockUserDemo } } };
      }
      if (url === '/accounts') {
        return { data: { success: true, data: { accounts: mockAccountsList } } };
      }
      throw new Error(`Unhandled get url: ${url}`);
    });

    const patchSpy = vi.spyOn(axiosClient, 'patch');

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Checking Bank')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Set Opening Balance' }));

    await waitFor(() => {
      expect(screen.getByText('Set Opening Balance: Checking Bank')).toBeDefined();
    });

    const input = screen.getByLabelText('Opening Balance (THB)');
    fireEvent.change(input, { target: { value: '-500' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Opening balance must be a non-negative number.')).toBeDefined();
    });

    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('renders accounts grouped into distinct sections by type (P1 Finding 8)', async () => {
    const fullMockAccounts = [
      {
        id: 'acc-1',
        user_id: 'u1-uuid',
        name: 'Checking Bank',
        type: 'CASH',
        opening_balance: 5000.00,
        is_opening_locked: false,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      },
      {
        id: 'acc-2',
        user_id: 'u1-uuid',
        name: 'Visa Credit Card',
        type: 'LOAN_TAKEN',
        opening_balance: 0.00,
        is_opening_locked: true,
        created_at: '2026-11-01T00:00:01.000Z',
        updated_at: '2026-11-01T00:00:01.000Z'
      },
      {
        id: 'acc-3',
        user_id: 'u1-uuid',
        name: 'Lent to Alice',
        type: 'LOAN_GIVEN',
        opening_balance: 1200.00,
        is_opening_locked: false,
        created_at: '2026-11-01T00:00:02.000Z',
        updated_at: '2026-11-01T00:00:02.000Z'
      },
      {
        id: 'acc-4',
        user_id: 'u1-uuid',
        name: 'Salary',
        type: 'INCOME',
        opening_balance: 0.00,
        is_opening_locked: false,
        created_at: '2026-11-01T00:00:03.000Z',
        updated_at: '2026-11-01T00:00:03.000Z'
      },
      {
        id: 'acc-5',
        user_id: 'u1-uuid',
        name: 'Food & Dining',
        type: 'EXPENSE',
        opening_balance: 0.00,
        is_opening_locked: false,
        created_at: '2026-11-01T00:00:04.000Z',
        updated_at: '2026-11-01T00:00:04.000Z'
      }
    ];

    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return { data: { success: true, data: { user: mockUserDemo } } };
      }
      if (url === '/accounts') {
        return { data: { success: true, data: { accounts: fullMockAccounts } } };
      }
      throw new Error(`Unhandled get url: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Checking Bank')).toBeDefined();
    });

    // Verify 5 group section headings
    expect(screen.getByText('Cash & Liquid Accounts')).toBeDefined();
    expect(screen.getByText('Credit Cards & Liabilities')).toBeDefined();
    expect(screen.getByText('Lent Funds & Receivables')).toBeDefined();
    expect(screen.getByText('Income Categories')).toBeDefined();
    expect(screen.getByText('Expense Categories')).toBeDefined();

    // Verify all 5 accounts are displayed
    expect(screen.getByText('Checking Bank')).toBeDefined();
    expect(screen.getByText('Visa Credit Card')).toBeDefined();
    expect(screen.getByText('Lent to Alice')).toBeDefined();
    expect(screen.getByText('Salary')).toBeDefined();
    expect(screen.getByText('Food & Dining')).toBeDefined();
  });

  it('validates client-side input and rejects numbers with more than 2 decimal places', async () => {
    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return { data: { success: true, data: { user: mockUserDemo } } };
      }
      if (url === '/accounts') {
        return { data: { success: true, data: { accounts: mockAccountsList } } };
      }
      throw new Error(`Unhandled get url: ${url}`);
    });

    const patchSpy = vi.spyOn(axiosClient, 'patch');

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Checking Bank')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Set Opening Balance' }));

    await waitFor(() => {
      expect(screen.getByText('Set Opening Balance: Checking Bank')).toBeDefined();
    });

    const input = screen.getByLabelText('Opening Balance (THB)');
    fireEvent.change(input, { target: { value: '100.123' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Opening balance allows at most 2 decimal places.')).toBeDefined();
    });

    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('validates client-side input and rejects numbers exceeding maximum allowed limit', async () => {
    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return { data: { success: true, data: { user: mockUserDemo } } };
      }
      if (url === '/accounts') {
        return { data: { success: true, data: { accounts: mockAccountsList } } };
      }
      throw new Error(`Unhandled get url: ${url}`);
    });

    const patchSpy = vi.spyOn(axiosClient, 'patch');

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Checking Bank')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Set Opening Balance' }));

    await waitFor(() => {
      expect(screen.getByText('Set Opening Balance: Checking Bank')).toBeDefined();
    });

    const input = screen.getByLabelText('Opening Balance (THB)');
    fireEvent.change(input, { target: { value: '10000000000.00' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Opening balance exceeds maximum allowed limit (9,999,999,999.99).')).toBeDefined();
    });

    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('redirects ADMIN attempting to access /accounts to /access-denied', async () => {
    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return { data: { success: true, data: { user: mockAdminDemo } } };
      }
      throw new Error(`Unhandled get url: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Access Forbidden (403)')).toBeDefined();
      expect(screen.getByText(/Security Policy \(BR-10\):/i)).toBeDefined();
    });

    // Accounts view not rendered
    expect(screen.queryByText('Financial Accounts')).toBeNull();
  });

  it('renders LOAN_TAKEN accounts with Current Debt and formatted balance', async () => {
    const mockAccountsWithDebt = [
      {
        id: 'acc-cc-1',
        user_id: 'u1-uuid',
        name: 'Visa Credit Card',
        type: 'LOAN_TAKEN',
        opening_balance: 0.00,
        current_balance: 3000.00,
        is_opening_locked: true,
        created_at: '2026-11-01T00:00:01.000Z',
        updated_at: '2026-11-01T00:00:01.000Z'
      }
    ];

    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return { data: { success: true, data: { user: mockUserDemo } } };
      }
      if (url === '/accounts') {
        return { data: { success: true, data: { accounts: mockAccountsWithDebt } } };
      }
      throw new Error(`Unhandled get url: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Visa Credit Card')).toBeDefined();
    });

    expect(screen.getByText('Current Debt')).toBeDefined();
    expect(screen.getByText(/3,000\.00/)).toBeDefined();
  });

  it('TEST-ACC-01 & TEST-ACC-04 (UI): opens Create Account modal, creates a new custom account, and renames an existing account (F-10, WP-08)', async () => {
    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return { data: { success: true, data: { user: mockUserDemo } } };
      }
      if (url === '/accounts') {
        return { data: { success: true, data: { accounts: mockAccountsList } } };
      }
      throw new Error(`Unhandled get url: ${url}`);
    });

    const postSpy = vi.spyOn(axiosClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          account: {
            id: 'acc-savings-new',
            user_id: 'u1-uuid',
            name: 'Savings Bank',
            type: 'CASH',
            subtype: 'DEFAULT',
            opening_balance: 5000.00,
            current_balance: 5000.00,
            is_opening_locked: false,
            is_archived: false,
            created_at: '2026-11-10T00:00:00.000Z',
            updated_at: '2026-11-10T00:00:00.000Z'
          }
        }
      }
    });

    const patchSpy = vi.spyOn(axiosClient, 'patch').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          account: {
            ...mockAccountsList[0],
            name: 'Main Checking'
          }
        }
      }
    });

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Checking Bank')).toBeDefined();
    });

    // 1. Open Create Account Modal
    fireEvent.click(screen.getByRole('button', { name: '+ Create Account' }));

    await waitFor(() => {
      expect(screen.getByText('Create Custom Account')).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText('Account Name'), {
      target: { value: '  Savings   Bank  ' }
    });
    fireEvent.change(screen.getByLabelText('Initial Opening Balance (THB)'), {
      target: { value: '5000.00' }
    });

    fireEvent.submit(screen.getByLabelText('Account Name').closest('form')!);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/accounts', {
        name: 'Savings Bank',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: 5000
      });
      expect(screen.getByText('Savings Bank')).toBeDefined();
    });

    // 2. Open Rename Modal for Checking Bank
    fireEvent.click(screen.getByRole('button', { name: 'Rename Checking Bank' }));

    await waitFor(() => {
      expect(screen.getByText('Rename Account: Checking Bank')).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText('New Account Name'), {
      target: { value: 'Main Checking' }
    });
    fireEvent.submit(screen.getByLabelText('New Account Name').closest('form')!);

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('/accounts/acc-1', { name: 'Main Checking' });
      expect(screen.getByText('Main Checking')).toBeDefined();
    });
  });

  it('TEST-XFER-01 (UI): opens Internal Cash Transfer modal and submits transfer between two CASH accounts (F-11, WP-08)', async () => {
    const twoCashAccounts = [
      {
        id: 'acc-cash-1',
        user_id: 'u1-uuid',
        name: 'Checking Bank',
        type: 'CASH',
        opening_balance: 10000.00,
        current_balance: 10000.00,
        is_opening_locked: false,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      },
      {
        id: 'acc-cash-2',
        user_id: 'u1-uuid',
        name: 'Savings Bank',
        type: 'CASH',
        opening_balance: 2000.00,
        current_balance: 2000.00,
        is_opening_locked: false,
        created_at: '2026-11-01T00:00:01.000Z',
        updated_at: '2026-11-01T00:00:01.000Z'
      }
    ];

    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return { data: { success: true, data: { user: mockUserDemo } } };
      }
      if (url === '/accounts') {
        return { data: { success: true, data: { accounts: twoCashAccounts } } };
      }
      throw new Error(`Unhandled get url: ${url}`);
    });

    const postSpy = vi.spyOn(axiosClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          transaction: {
            id: 'txn-xfer-1',
            primary_account_id: 'acc-cash-1',
            form: 'PAYMENT_CHARGE',
            total_amount: '3000.00',
            transaction_date: '2026-11-10',
            description: 'Move to Savings',
            allocations: []
          },
          updated_from_cash_balance: '7000.00',
          updated_to_cash_balance: '5000.00'
        }
      }
    });

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Checking Bank')).toBeDefined();
      expect(screen.getByText('Savings Bank')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Transfer Cash' }));

    await waitFor(() => {
      expect(screen.getByText('Internal Cash Transfer')).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText('Transfer Amount (THB)'), {
      target: { value: '3000.00' }
    });
    fireEvent.change(screen.getByLabelText('Transaction Date'), {
      target: { value: '2026-11-10' }
    });
    fireEvent.change(screen.getByLabelText('Description (Optional)'), {
      target: { value: 'Move to Savings' }
    });

    fireEvent.submit(screen.getByLabelText('Transfer Amount (THB)').closest('form')!);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/transactions/transfer', {
        from_account_id: 'acc-cash-1',
        to_account_id: 'acc-cash-2',
        amount: '3000.00',
        transaction_date: '2026-11-10',
        description: 'Move to Savings'
      });
    });
  });
});
