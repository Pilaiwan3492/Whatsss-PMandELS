import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

export const Navbar: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-3 mb-4 shadow-sm">
      <div className="container-fluid">
        <Link className="navbar-brand fw-bold" to="/">
          Whatsss
        </Link>
        <div className="d-flex align-items-center ms-auto">
          {isAuthenticated && user ? (
            <div className="d-flex align-items-center gap-3">
              <span className="text-light small">
                Signed in as: <strong>{user.username}</strong>
              </span>
              <span className={`badge ${user.role === 'ADMIN' ? 'bg-danger' : 'bg-primary'}`}>
                {user.role}
              </span>
              <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>
                Logout
              </button>
            </div>
          ) : (
            <Link className="btn btn-primary btn-sm" to="/login">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};
