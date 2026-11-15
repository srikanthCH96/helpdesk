import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  CheckCheck,
  FilePlus2,
  Headset,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  TicketCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatRelativeTime, formatRoleLabel } from '../utils/formatters';
import { RoleName } from '../types';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: RoleName[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Employee Dashboard',
    to: '/employee/dashboard',
    icon: LayoutDashboard,
    roles: ['EMPLOYEE'],
  },
  {
    label: 'Tickets & Requests',
    to: '/employee/tickets',
    icon: FilePlus2,
    roles: ['EMPLOYEE'],
  },
  {
    label: 'Agent Dashboard',
    to: '/agent/dashboard',
    icon: LayoutDashboard,
    roles: ['SUPPORT_AGENT'],
  },
  {
    label: 'Queue & Workspace',
    to: '/agent/workspace',
    icon: Headset,
    roles: ['SUPPORT_AGENT'],
  },
  {
    label: 'Admin Dashboard',
    to: '/admin/dashboard',
    icon: LayoutDashboard,
    roles: ['ADMIN'],
  },
  {
    label: 'Employees & Agents',
    to: '/admin/users',
    icon: Users,
    roles: ['ADMIN'],
  },
  {
    label: 'Ticket Admin & SLA',
    to: '/admin/tickets-sla',
    icon: TicketCheck,
    roles: ['ADMIN'],
  },
  {
    label: 'Reports & Settings',
    to: '/admin/reports-settings',
    icon: BarChart3,
    roles: ['ADMIN'],
  },
];

interface AppShellProps {
  breadcrumb: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ breadcrumb, primaryAction, children }) => {
  const { user, logout, notifications, unreadCount, markNotificationRead, markAllNotificationsRead } =
    useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  if (!user) return null;

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login');
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar (256px) */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0" />
            <span className="font-display font-semibold text-base tracking-tight text-white whitespace-nowrap">
              HelpDesk Pro
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-white"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-md object-cover border border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200 shrink-0">
                {user.fullName
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.fullName}</p>
              <p className="text-xs text-slate-400 truncate">
                {formatRoleLabel(user.role)} · {user.departmentName}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-800 hover:text-white rounded-md border border-slate-700 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-md"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm lg:text-base font-semibold text-slate-900 truncate">
              {breadcrumb}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Notifications Trigger */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                aria-label="Toggle notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-mono font-semibold bg-blue-700 text-white rounded">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">
                      Notifications ({unreadCount} unread)
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllNotificationsRead()}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={async () => {
                            if (!n.read) await markNotificationRead(n.id);
                            setNotifOpen(false);
                            if (n.ticketId) {
                              if (user.role === 'EMPLOYEE') {
                                navigate(`/employee/tickets/${n.ticketId}`);
                              } else if (user.role === 'SUPPORT_AGENT') {
                                navigate(`/agent/workspace?ticketId=${n.ticketId}`);
                              } else {
                                navigate('/admin/tickets-sla');
                              }
                            }
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                            !n.read ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                            <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
                              {formatRelativeTime(n.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2">{n.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {primaryAction && (
              <button
                onClick={primaryAction.onClick}
                className="px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
              >
                {primaryAction.label}
              </button>
            )}
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
