import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute.js';
import * as AuthContextModule from '../context/AuthContext.js';

describe('Frontend ProtectedRoute Suite (Section 2.4 & Section 3)', () => {
  const renderWithRouter = (initialRoute: string, disallowAdmin = false) => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/login" element={<div>Login Page View</div>} />
          <Route path="/access-denied" element={<div>Access Denied View</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute disallowAdmin={disallowAdmin}>
                <div>Dashboard View</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders loading spinner while session is being verified', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      role: null,
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn()
    });

    renderWithRouter('/dashboard', true);
    expect(screen.getByText('Loading session...')).toBeDefined();
  });

  it('redirects unauthenticated user to /login', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      role: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn()
    });

    renderWithRouter('/dashboard', true);
    expect(screen.getByText('Login Page View')).toBeDefined();
  });

  it('allows authenticated USER to access /dashboard', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u1', username: 'user_demo', email: 'user@test.local', role: 'USER' },
      role: 'USER',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn()
    });

    renderWithRouter('/dashboard', true);
    expect(screen.getByText('Dashboard View')).toBeDefined();
  });

  it('redirects authenticated ADMIN to /access-denied when accessing /dashboard (disallowAdmin=true)', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'a1', username: 'admin_demo', email: 'admin@test.local', role: 'ADMIN' },
      role: 'ADMIN',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn()
    });

    renderWithRouter('/dashboard', true);
    expect(screen.getByText('Access Denied View')).toBeDefined();
  });

  it('maintains protection on route refresh with preserved auth session', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u1', username: 'user_demo', email: 'user@test.local', role: 'USER' },
      role: 'USER',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn()
    });

    const { rerender } = renderWithRouter('/dashboard', true);
    expect(screen.getByText('Dashboard View')).toBeDefined();

    // Simulate page re-render / route refresh
    rerender(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>Login Page View</div>} />
          <Route path="/access-denied" element={<div>Access Denied View</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute disallowAdmin={true}>
                <div>Dashboard View</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Dashboard View')).toBeDefined();
  });
});
