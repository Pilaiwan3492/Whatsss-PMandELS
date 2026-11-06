import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.js';
import { App } from '../App.js';
import { axiosClient } from '../api/axiosClient.js';

describe('Frontend AuthProvider Lifecycle & Route Protection Suite (Section 2.4 & Task 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies AuthProvider lifecycle for USER: queries /api/auth/me and grants access to /dashboard', async () => {
    // Mock /api/auth/me returning valid USER profile
    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return {
          data: {
            success: true,
            data: {
              user: {
                id: 'u1-uuid',
                username: 'user_demo',
                email: 'user_demo@whatsss.local',
                role: 'USER'
              }
            }
          }
        };
      }
      throw new Error(`Unhandled url: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    // Initial state renders loading spinner
    expect(screen.getByText('Loading application...')).toBeDefined();

    // After session resolution, Dashboard view is rendered
    await waitFor(() => {
      expect(screen.getByText('Welcome, user_demo!')).toBeDefined();
    });

    expect(screen.getAllByText('USER').length).toBeGreaterThan(0);
  });

  it('verifies AuthProvider lifecycle for ADMIN: intercepts /dashboard and redirects to /access-denied', async () => {
    // Mock /api/auth/me returning ADMIN profile
    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        return {
          data: {
            success: true,
            data: {
              user: {
                id: 'admin-uuid',
                username: 'admin_demo',
                email: 'admin_demo@whatsss.local',
                role: 'ADMIN'
              }
            }
          }
        };
      }
      throw new Error(`Unhandled url: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    // Admin accessing /dashboard must be intercepted and redirected to /access-denied
    await waitFor(() => {
      expect(screen.getByText(/Access Forbidden/i)).toBeDefined();
    });

    expect(screen.getByText(/Security Policy \(BR-10\)/i)).toBeDefined();
    expect(screen.getAllByText('ADMIN').length).toBeGreaterThan(0);
  });

  it('verifies AuthProvider lifecycle for Unauthenticated: redirects /dashboard to /login', async () => {
    // Mock /api/auth/me rejecting with 401
    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        const error: any = new Error('Unauthorized');
        error.response = { status: 401, data: { success: false, error: { code: 'UNAUTHORIZED' } } };
        throw error;
      }
      throw new Error(`Unhandled url: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    // Unauthenticated user is redirected to LoginPage
    await waitFor(() => {
      expect(screen.getByText('Sign In to Whatsss')).toBeDefined();
    });
  });

  it('verifies full page refresh lifecycle: remounting AuthProvider re-evaluates server session state', async () => {
    let sessionActive = true;

    // Dynamic mock simulating active session on first load, revoked on reload
    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') {
        if (sessionActive) {
          return {
            data: {
              success: true,
              data: {
                user: {
                  id: 'u1-uuid',
                  username: 'user_demo',
                  email: 'user_demo@whatsss.local',
                  role: 'USER'
                }
              }
            }
          };
        } else {
          const error: any = new Error('Session Expired');
          error.response = { status: 401, data: { success: false, error: { code: 'UNAUTHORIZED' } } };
          throw error;
        }
      }
      throw new Error(`Unhandled url: ${url}`);
    });

    // 1. Initial Page Load
    const { unmount } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Welcome, user_demo!')).toBeDefined();
    });

    // 2. Simulate Session Invalidation on backend and Page Refresh / Remount
    sessionActive = false;
    unmount();

    // 3. Remount application from scratch (simulating browser reload)
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    // The remounted AuthProvider re-queries /api/auth/me, detects session revocation, and redirects to login
    await waitFor(() => {
      expect(screen.getByText('Sign In to Whatsss')).toBeDefined();
    });
  });
});
