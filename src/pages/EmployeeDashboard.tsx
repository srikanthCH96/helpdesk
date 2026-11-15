import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ArrowRight, Bell, Clock, Plus } from 'lucide-react';
import { AppShell } from '../layouts/AppShell';
import { apiClient, extractApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PriorityLabel, StatusLabel } from '../components/StatusIndicators';
import { formatRelativeTime } from '../utils/formatters';
import { Ticket } from '../types';

interface EmployeeDashboardData {
  counts: {
    totalTickets: number;
    openTickets: number;
    inProgressTickets: number;
    resolvedTickets: number;
  };
  statusDistribution: { status: string; count: number }[];
  recentTickets: Ticket[];
  recentActivity: {
    id: number;
    ticketId: number;
    ticketNumber: string;
    subject: string;
    toStatus: string;
    changedByName: string;
    reason: string;
    changedAt: string;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#2563eb',
  ASSIGNED: '#4f46e5',
  IN_PROGRESS: '#d97706',
  RESOLVED: '#16a34a',
  CLOSED: '#64748b',
};

export const EmployeeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { notifications } = useAuth();
  const [data, setData] = useState<EmployeeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/reports/dashboard')
      .then((res) => setData(res.data.data))
      .catch((err) => setError(extractApiError(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell
      breadcrumb="Employee Portal / Overview"
      primaryAction={{
        label: 'New Support Ticket',
        onClick: () => navigate('/employee/tickets?tab=create'),
      }}
    >
      {loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-white border border-slate-200 rounded-lg" />
            ))}
          </div>
          <div className="h-72 bg-white border border-slate-200 rounded-lg" />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      ) : (
        data && (
          <div className="space-y-6">
            {/* 4-Column KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <p className="text-xs font-medium text-slate-500">Total Tickets</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
                  {data.counts.totalTickets}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <p className="text-xs font-medium text-slate-500">Open & Assigned</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-blue-700 tabular-nums">
                  {data.counts.openTickets}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <p className="text-xs font-medium text-slate-500">In Progress</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-amber-600 tabular-nums">
                  {data.counts.inProgressTickets}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <p className="text-xs font-medium text-slate-500">Resolved & Closed</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-emerald-700 tabular-nums">
                  {data.counts.resolvedTickets}
                </p>
              </div>
            </div>

            {/* Chart + Notifications Split */}
            <div className="grid lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-900">Ticket Status Overview</h2>
                  <button
                    onClick={() => navigate('/employee/tickets?tab=list')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800"
                  >
                    View all tickets
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.statusDistribution}>
                      <XAxis dataKey="status" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {data.statusDistribution.map((entry) => (
                          <Cell
                            key={entry.status}
                            fill={STATUS_COLORS[entry.status] || '#334155'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-slate-500" />
                    <h2 className="text-sm font-semibold text-slate-900">Recent Notifications</h2>
                  </div>
                  <button
                    onClick={() => navigate('/employee/tickets?tab=create')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Ticket
                  </button>
                </div>
                <div className="flex-1 divide-y divide-slate-100 overflow-y-auto max-h-60">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 py-8 text-center">
                      No recent notifications.
                    </p>
                  ) : (
                    notifications.slice(0, 5).map((n) => (
                      <div
                        key={n.id}
                        onClick={() => n.ticketId && navigate(`/employee/tickets/${n.ticketId}`)}
                        className="py-3 cursor-pointer hover:bg-slate-50 px-2 rounded transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-900 truncate">{n.title}</p>
                          <span className="text-[11px] font-mono text-slate-400 shrink-0">
                            {formatRelativeTime(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Recent Tickets + Recent Activity */}
            <div className="grid lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">My Recent Tickets</h2>
                  <button
                    onClick={() => navigate('/employee/tickets?tab=list')}
                    className="text-xs font-medium text-blue-700 hover:text-blue-800"
                  >
                    Manage all
                  </button>
                </div>
                {data.recentTickets.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm text-slate-600 mb-3">
                      You have not submitted any IT support tickets yet.
                    </p>
                    <button
                      onClick={() => navigate('/employee/tickets?tab=create')}
                      className="px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800"
                    >
                      Submit First Ticket
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-4">ID</th>
                          <th className="py-2.5 px-4">Subject</th>
                          <th className="py-2.5 px-4">Priority</th>
                          <th className="py-2.5 px-4">Status</th>
                          <th className="py-2.5 px-4 text-right">Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {data.recentTickets.map((t) => (
                          <tr
                            key={t.id}
                            onClick={() => navigate(`/employee/tickets/${t.id}`)}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4 font-mono text-xs font-medium text-slate-700 whitespace-nowrap">
                              {t.ticketNumber}
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-medium text-slate-900 line-clamp-1">{t.subject}</p>
                              <p className="text-xs text-slate-500">
                                {t.categoryName} · {t.assignedAgentName || 'Awaiting agent'}
                              </p>
                            </td>
                            <td className="py-3 px-4">
                              <PriorityLabel priority={t.priority} />
                            </td>
                            <td className="py-3 px-4">
                              <StatusLabel status={t.status} />
                            </td>
                            <td className="py-3 px-4 text-right text-xs font-mono text-slate-500 whitespace-nowrap">
                              {formatRelativeTime(t.updatedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
                </div>
                <div className="space-y-4">
                  {data.recentActivity.length === 0 ? (
                    <p className="text-xs text-slate-500">No recent activity recorded.</p>
                  ) : (
                    data.recentActivity.map((act) => (
                      <div key={act.id} className="border-b border-slate-100 pb-3 last:border-0">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-semibold text-slate-800">
                            {act.ticketNumber}
                          </span>
                          <span className="font-mono text-slate-400">
                            {formatRelativeTime(act.changedAt)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 mt-1">
                          Moved to <span className="font-medium">{act.toStatus}</span> by{' '}
                          {act.changedByName}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {act.reason}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </AppShell>
  );
};
