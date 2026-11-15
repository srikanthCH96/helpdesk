import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { AppShell } from '../layouts/AppShell';
import { apiClient, extractApiError } from '../services/api';
import { PriorityLabel, StatusLabel } from '../components/StatusIndicators';
import { SlaCountdown } from '../components/SlaCountdown';
import { formatRelativeTime } from '../utils/formatters';
import { Ticket } from '../types';

interface AgentDashboardData {
  counts: {
    assignedTickets: number;
    openTickets: number;
    inProgressTickets: number;
    resolvedToday: number;
    overdueTickets: number;
    unassignedQueueCount: number;
  };
  priorityBreakdown: { priority: string; count: number }[];
  slaMonitoring: Ticket[];
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

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#d97706',
  MEDIUM: '#2563eb',
  LOW: '#64748b',
};

export const AgentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<AgentDashboardData | null>(null);
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
      breadcrumb="Agent Operations / Dashboard"
      primaryAction={{
        label: 'Open Queue Workspace',
        onClick: () => navigate('/agent/workspace'),
      }}
    >
      {loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
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
            {/* 5-Column Agent KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <p className="text-xs font-medium text-slate-500">Assigned Tickets</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
                  {data.counts.assignedTickets}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <p className="text-xs font-medium text-slate-500">Open / Assigned</p>
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
                <p className="text-xs font-medium text-slate-500">Resolved Today</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-emerald-700 tabular-nums">
                  {data.counts.resolvedToday}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">Overdue SLA</p>
                  {data.counts.overdueTickets > 0 && (
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  )}
                </div>
                <p
                  className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${
                    data.counts.overdueTickets > 0 ? 'text-red-700' : 'text-slate-900'
                  }`}
                >
                  {data.counts.overdueTickets}
                </p>
              </div>
            </div>

            {/* Workload Breakdown & SLA Monitoring */}
            <div className="grid lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Active Workload by Priority</h2>
                    <p className="text-xs text-slate-500">
                      {data.counts.unassignedQueueCount} unassigned tickets waiting in shared queue
                    </p>
                  </div>
                </div>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.priorityBreakdown}>
                      <XAxis dataKey="priority" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {data.priorityBreakdown.map((item) => (
                          <Cell
                            key={item.priority}
                            fill={PRIORITY_COLORS[item.priority] || '#334155'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">SLA Monitoring Queue</h2>
                  <button
                    onClick={() => navigate('/agent/workspace')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800"
                  >
                    Launch Workspace
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {data.slaMonitoring.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    All assigned tickets are resolved or closed.
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
                          <th className="py-2.5 px-4 text-right">SLA Countdown</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {data.slaMonitoring.map((t) => (
                          <tr
                            key={t.id}
                            onClick={() => navigate(`/agent/workspace?ticketId=${t.id}`)}
                            className="hover:bg-slate-50 cursor-pointer"
                          >
                            <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800">
                              {t.ticketNumber}
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-medium text-slate-900 line-clamp-1">{t.subject}</p>
                              <p className="text-xs text-slate-500">
                                {t.requesterName} · {t.categoryName}
                              </p>
                            </td>
                            <td className="py-3 px-4">
                              <PriorityLabel priority={t.priority} />
                            </td>
                            <td className="py-3 px-4">
                              <StatusLabel status={t.status} />
                            </td>
                            <td className="py-3 px-4 text-right">
                              <SlaCountdown
                                dueAt={t.resolutionDueAt}
                                status={t.status}
                                slaBreached={t.slaBreached}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-900">Recent Queue Activity</h2>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.recentActivity.length === 0 ? (
                  <p className="text-xs text-slate-500">No recent queue events.</p>
                ) : (
                  data.recentActivity.slice(0, 6).map((act) => (
                    <div
                      key={act.id}
                      onClick={() => navigate(`/agent/workspace?ticketId=${act.ticketId}`)}
                      className="p-3.5 border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-mono font-semibold text-slate-800">
                          {act.ticketNumber}
                        </span>
                        <span className="font-mono text-slate-400">
                          {formatRelativeTime(act.changedAt)}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-800 line-clamp-1">
                        {act.subject}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {act.toStatus} · {act.changedByName}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )
      )}
    </AppShell>
  );
};
