import React from 'react';
import { useAuth } from '../context/AuthContext.js';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="container py-4">
      <div className="p-4 bg-light rounded-3 shadow-sm mb-4">
        <h2 className="fw-bold mb-2">Welcome, {user?.username}!</h2>
        <p className="text-muted mb-0">
          Role: <span className="badge bg-primary">{user?.role}</span> | Email: {user?.email}
        </p>
      </div>

      <div className="alert alert-info shadow-sm" role="alert">
        <h5 className="alert-heading fw-bold">Sprint 1 Golden Slice Dashboard</h5>
        <p className="mb-0">
          User authentication and session boundaries (Issue #1, Features F-01 & F-02) are active.
          Financial accounts and transaction recording interfaces will be integrated in subsequent work packages (WP-02 through WP-06).
        </p>
      </div>
    </div>
  );
};
