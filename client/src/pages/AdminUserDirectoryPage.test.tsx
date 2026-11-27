import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.js';
import { AdminUserDirectoryPage } from './AdminUserDirectoryPage.js';
import { axiosClient } from '../api/axiosClient.js';
import * as adminApi from '../api/adminApi.js';

describe('Frontend Admin User Directory & Governance Suite (WP-11, Feature F-19)', () => {
  const mockAdmin = {
    id: 'admin-uuid',
    username: 'admin_demo',
    email: 'admin_demo@whatsss.local',
    role: 'ADMIN' as const
  };

  const mockUsers: adminApi.PlatformUser[] = [
    {
      id: 'user-a-uuid',
      username: 'user_demo',
      email: 'user_demo@whatsss.local',
      role: 'USER',
      is_active: true,
      created_at: '2026-11-01T00:00:00.000Z'
    },
    {
      id: 'admin-uuid',
      username: 'admin_demo',
      email: 'admin_demo@whatsss.local',
      role: 'ADMIN',
      is_active: true,
      created_at: '2026-11-01T00:00:00.000Z'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return { data: { success: true, data: { user: mockAdmin } } };
      }
      throw new Error(`Unhandled url: ${url}`);
    });
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AuthProvider>
          <AdminUserDirectoryPage />
        </AuthProvider>
      </MemoryRouter>
    );

  it('TEST-UI-ADMIN-01: renders platform user directory with governance fields and disables self-deactivation button (AC-19-1, AC-19-4)', async () => {
    vi.spyOn(adminApi, 'getAdminUsers').mockResolvedValue(mockUsers);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('admin-users-table')).toBeDefined();
      expect(screen.getByTestId('admin-user-row-user-a-uuid')).toBeDefined();
      expect(screen.getByTestId('admin-user-row-admin-uuid')).toBeDefined();
    });

    // Self-deactivation button disabled for active admin
    const selfBtn = screen.getByTestId('btn-toggle-status-admin-uuid') as HTMLButtonElement;
    expect(selfBtn.disabled).toBe(true);
  });

  it('TEST-UI-ADMIN-02: toggles user is_active status via PATCH /api/admin/users/:id/status and updates status badge (AC-19-2)', async () => {
    vi.spyOn(adminApi, 'getAdminUsers').mockResolvedValue(mockUsers);
    const statusSpy = vi.spyOn(adminApi, 'updateAdminUserStatus').mockResolvedValue({
      ...mockUsers[0],
      is_active: false
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('btn-toggle-status-user-a-uuid')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-toggle-status-user-a-uuid'));

    await waitFor(() => {
      expect(statusSpy).toHaveBeenCalledWith('user-a-uuid', false);
      expect(screen.getByTestId('status-badge-user-a-uuid').textContent).toBe('Disabled');
      expect(screen.getByTestId('admin-feedback').textContent).toContain('user_demo');
    });
  });
});
