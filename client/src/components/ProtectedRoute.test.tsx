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
    const authMeSpy = vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
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

    expect(authMeSpy).toHaveBeenCalledTimes(1);
    expect(authMeSpy).toHaveBeenCalledWith('/auth/me');
    expect(screen.getAllByText('USER').length).toBeGreaterThan(0);
  });

  it('verifies AuthProvider lifecycle for ADMIN: intercepts /dashboard and redirects to /access-denied', async () => {
    const authMeSpy = vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
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

    expect(authMeSpy).toHaveBeenCalledTimes(1);
    expect(authMeSpy).toHaveBeenCalledWith('/auth/me');
    expect(screen.getByText(/Security Policy \(BR-10\)/i)).toBeDefined();
    expect(screen.getAllByText('ADMIN').length).toBeGreaterThan(0);
  });

  it('verifies AuthProvider lifecycle for Unauthenticated: redirects /dashboard to /login', async () => {
    const authMeSpy = vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
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

    expect(authMeSpy).toHaveBeenCalledTimes(1);
    expect(authMeSpy).toHaveBeenCalledWith('/auth/me');
  });

  it('verifies full page refresh lifecycle: remounting AuthProvider re-evaluates server session state with explicit call count', async () => {
    let sessionActive = true;

    // Spy on axiosClient.get to verify exact call sequence and counts across remounts
    const authMeSpy = vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
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

    // 1. Initial Page Load with valid session
    const { unmount } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    // 2. Verify dashboard is accessible on initial mount
    await waitFor(() => {
      expect(screen.getByText('Welcome, user_demo!')).toBeDefined();
    });

    // 3. Verify exactly one call to /api/auth/me was made during initial mount
    expect(authMeSpy).toHaveBeenCalledTimes(1);
    expect(authMeSpy).toHaveBeenNthCalledWith(1, '/auth/me');

    // 4. Simulate session invalidation on server
    sessionActive = false;

    // 5. Unmount the entire application tree (simulating browser reload / navigation away)
    unmount();

    // 6. Mount a brand new AuthProvider and application instance from scratch
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    // 7. Verify /api/auth/me was called a second time by the newly mounted AuthProvider
    await waitFor(() => {
      expect(authMeSpy).toHaveBeenCalledTimes(2);
    });
    expect(authMeSpy).toHaveBeenNthCalledWith(2, '/auth/me');

    // 8. Verify the application handles HTTP 401 from second request and redirects to login
    await waitFor(() => {
      expect(screen.getByText('Sign In to Whatsss')).toBeDefined();
    });

    // 9. Verify protected dashboard content is completely removed and no longer visible in DOM
    expect(screen.queryByText('Welcome, user_demo!')).toBeNull();
    expect(screen.queryByText('Sprint 1 Golden Slice Dashboard')).toBeNull();
  });
});
