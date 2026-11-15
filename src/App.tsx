import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RoleName } from './types';
import { AuthPage } from './pages/AuthPage';
import { EmployeeDashboard } from './pages/EmployeeDashboard';
import { EmployeeTicketsPage } from './pages/EmployeeTicketsPage';
import { EmployeeTicketDetailsPage } from './pages/EmployeeTicketDetailsPage';
import { AgentDashboard } from './pages/AgentDashboard';
import { AgentWorkspacePage } from './pages/AgentWorkspacePage';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminTicketsSlaPage } from './pages/AdminTicketsSlaPage';
import { AdminReportsSettingsPage } from './pages/AdminReportsSettingsPage';

const ProtectedRoute: React.FC<{ roles?: RoleName[]; children: React.ReactNode }> = ({
  roles,
  children,
}) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-xs font-medium text-slate-500">
        Verifying session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    if (user.role === 'ADMIN') return <Navigate to="/admin/dashboard" replace />;
    if (user.role === 'SUPPORT_AGENT') return <Navigate to="/agent/dashboard" replace />;
    return <Navigate to="/employee/dashboard" replace />;
  }

  return <>{children}</>;
};

const RootRedirect: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth/login" replace />;
  if (user.role === 'ADMIN') return <Navigate to="/admin/dashboard" replace />;
  if (user.role === 'SUPPORT_AGENT') return <Navigate to="/agent/dashboard" replace />;
  return <Navigate to="/employee/dashboard" replace />;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRedirect />} />

            {/* Screen 1: Authentication */}
            <Route path="/auth/*" element={<AuthPage />} />

            {/* Screens 2, 3, 4: Employee Portal */}
            <Route
              path="/employee/dashboard"
              element={
                <ProtectedRoute roles={['EMPLOYEE']}>
                  <EmployeeDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/employee/tickets"
              element={
                <ProtectedRoute roles={['EMPLOYEE']}>
                  <EmployeeTicketsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/employee/tickets/:id"
              element={
                <ProtectedRoute roles={['EMPLOYEE']}>
                  <EmployeeTicketDetailsPage />
                </ProtectedRoute>
              }
            />

            {/* Screens 5, 6: Support Agent Portal */}
            <Route
              path="/agent/dashboard"
              element={
                <ProtectedRoute roles={['SUPPORT_AGENT']}>
                  <AgentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agent/workspace"
              element={
                <ProtectedRoute roles={['SUPPORT_AGENT']}>
                  <AgentWorkspacePage />
                </ProtectedRoute>
              }
            />

            {/* Screens 7, 8, 9, 10: Administrator Console */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminUsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/tickets-sla"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminTicketsSlaPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/reports-settings"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminReportsSettingsPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
