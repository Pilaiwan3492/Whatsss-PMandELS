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
});
