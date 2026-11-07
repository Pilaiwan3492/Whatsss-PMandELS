import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

export const AccessDeniedPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="container d-flex justify-content-center align-items-center" style={{ minHeight: '75vh' }}>
      <div className="card shadow-sm p-4 text-center" style={{ maxWidth: '480px', width: '100%' }}>
        <div className="mb-3 text-danger">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="64"
            height="64"
            fill="currentColor"
            className="bi bi-shield-slash"
            viewBox="0 0 16 16"
          >
            <path
              fillRule="evenodd"
              d="M1.729 5.097c.414-.403.882-.777 1.401-1.119l.704.704a11 11 0 0 0-1.127.877c-.367.34-.69.7-.978 1.077V5.097zm11.532 8.406l-1.428-1.428C10.74 13.067 9.42 14.12 8 14.99c-4-2.5-7-6.5-7-10.5V2.414l-.707-.707L.99.99 14.99 14.99l-.707.707-.022-.022v-.002zm-1.848-1.848l-1.39-1.39c.642-.907 1.084-1.954 1.34-3.082l.848.339a11.1 11.1 0 0 1-.798 4.133zM4.123 2.002L8 .32l3.877 1.682c.49.213.947.476 1.37.785l-.715.715a10.9 10.9 0 0 0-1.127-.584L8 1.488 4.838 2.86a10.9 10.9 0 0 0-.715-.858z"
            />
          </svg>
        </div>
        <h3 className="card-title fw-bold text-danger mb-2">Access Forbidden (403)</h3>
        <p className="text-muted mb-3">
          Your account (<strong>{user?.username}</strong>) has the <strong>{user?.role}</strong> role.
        </p>
        <div className="alert alert-warning text-start small mb-4" role="alert">
          <strong>Security Policy (BR-10):</strong> Administrative accounts are strictly segregated from financial
          ledger access to protect tenant financial privacy and maintain zero-trust boundaries.
        </div>
        <div className="d-flex justify-content-center gap-2">
          <Link to="/dashboard" className="btn btn-outline-secondary">
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};
