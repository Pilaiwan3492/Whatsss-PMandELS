import React, { useEffect, useState } from 'react';
import { getAdminUsers, updateAdminUserStatus, PlatformUser } from '../api/adminApi.js';
import { useAuth } from '../context/AuthContext.js';

export const AdminUserDirectoryPage: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadUsers = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const list = await getAdminUsers();
      setUsers(list);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.error?.message || err?.message || 'Failed to load platform user directory.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleStatus = async (target: PlatformUser) => {
    setUpdatingId(target.id);
    setErrorMessage(null);
    setActionFeedback(null);
    const nextStatus = !target.is_active;
    try {
      const updated = await updateAdminUserStatus(target.id, nextStatus);
      setUsers((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, is_active: updated.is_active } : u))
      );
      setActionFeedback(
        `User "${target.username}" is now ${updated.is_active ? 'Active' : 'Disabled'}.`
      );
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.error?.message || err?.message || 'Failed to update user access status.'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="container py-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center p-4 bg-white rounded-3 shadow-sm mb-4 border">
        <div>
          <h2 className="fw-bold mb-1">Platform User Directory & Governance</h2>
          <p className="text-muted mb-0 small">
            Manage platform account access status (FR-03, FR-04). User financial ledgers remain strictly private per Security Policy (BR-10).
          </p>
        </div>
        <button
          className="btn btn-outline-secondary btn-sm mt-2 mt-md-0"
          onClick={loadUsers}
          data-testid="btn-refresh-users"
        >
          ↻ Refresh
        </button>
      </div>

      {actionFeedback && (
        <div className="alert alert-success py-2 small mb-3" role="status" data-testid="admin-feedback">
          {actionFeedback}
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-danger py-2 small mb-3" role="alert" data-testid="admin-error">
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="d-flex justify-content-center py-5" data-testid="admin-loading">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading users...</span>
          </div>
        </div>
      ) : (
        <div className="card shadow-sm border">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" data-testid="admin-users-table">
              <thead className="table-light">
                <tr>
                  <th scope="col">Username</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created At</th>
                  <th scope="col" className="text-end">Access Governance</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = currentAdmin?.id === u.id;
                  return (
                    <tr key={u.id} data-testid={`admin-user-row-${u.id}`}>
                      <td className="fw-semibold small">{u.username}</td>
                      <td className="small text-muted">{u.email}</td>
                      <td>
                        <span className={`badge ${u.role === 'ADMIN' ? 'bg-danger' : 'bg-primary'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${u.is_active ? 'bg-success' : 'bg-secondary'}`}
                          data-testid={`status-badge-${u.id}`}
                        >
                          {u.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="small text-muted">{u.created_at.split('T')[0]}</td>
                      <td className="text-end">
                        <button
                          type="button"
                          className={`btn btn-sm ${
                            u.is_active ? 'btn-outline-danger' : 'btn-outline-success'
                          }`}
                          disabled={updatingId === u.id || (isSelf && u.is_active)}
                          title={isSelf ? 'Cannot deactivate your own active admin account' : undefined}
                          onClick={() => handleToggleStatus(u)}
                          data-testid={`btn-toggle-status-${u.id}`}
                        >
                          {updatingId === u.id
                            ? 'Updating...'
                            : u.is_active
                            ? 'Disable'
                            : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
