import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

interface ProtectedRouteProps {
  children: React.ReactElement;
  disallowAdmin?: boolean;
  requireAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  disallowAdmin = false,
  requireAdmin = false
}) => {
  const { isAuthenticated, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (disallowAdmin && role === 'ADMIN') {
    return <Navigate to="/access-denied" replace />;
  }

  if (requireAdmin && role !== 'ADMIN') {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
};
