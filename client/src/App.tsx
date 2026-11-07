import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { AccessDeniedPage } from './pages/AccessDeniedPage.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { useAuth } from './context/AuthContext.js';

export const App: React.FC = () => {
  const { isAuthenticated, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading application...</span>
        </div>
      </div>
    );
  }

  const defaultAuthenticatedRoute = role === 'ADMIN' ? '/access-denied' : '/dashboard';

  return (
    <div className="min-vh-100 bg-light">
      <Navbar />
      <main>
        <Routes>
          <Route
            path="/"
            element={isAuthenticated ? <Navigate to={defaultAuthenticatedRoute} replace /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to={defaultAuthenticatedRoute} replace /> : <LoginPage />}
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute disallowAdmin={true}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/access-denied"
            element={
              <ProtectedRoute>
                <AccessDeniedPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};
