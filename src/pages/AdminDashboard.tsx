import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { AppShell } from '../layouts/AppShell';
import { apiClient, extractApiError } from '../services/api';

interface AdminDashboardData {
  counts: {
    totalEmployees: number;
    totalAgents: number;
    totalTickets: number;
    openTickets: number;
    inProgressTickets: number;
    resolvedTickets: number;
    slaCompliancePct: number;
    breachedTickets: number;
  };
  categoryDistribution: { name: string; count: number }[];
  priorityDistribution: { name: string; count: number }[];
  agentPerformance: {
    agentId: number;
    agentName: string;
    availabilityStatus: string;
    assignedCount: number;
    resolvedCount: number;
    breachedCount: number;
    avgResolutionMinutes: number;
    slaCompliancePct: number;
  }[];
  trend: { day: string; created: number; resolved: number }[];
}

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminDashboardData | null>(null);
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
      breadcrumb="Administration / Executive Operations Dashboard"
      primaryAction={{
        label: 'Ticket & SLA Console',
        onClick: () => navigate('/admin/tickets-sla'),
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
            {/* 7-Metric Executive KPI Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3.5">
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <p className="text-[11px] font-medium text-slate-500">Employees</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {data.counts.totalEmployees}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <p className="text-[11px] font-medium text-slate-500">Support Agents</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {data.counts.totalAgents}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <p className="text-[11px] font-medium text-slate-500">Total Tickets</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {data.counts.totalTickets}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <p className="text-[11px] font-medium text-slate-500">Open</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-blue-700 tabular-nums">
                  {data.counts.openTickets}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <p className="text-[11px] font-medium text-slate-500">In Progress</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-amber-600 tabular-nums">
                  {data.counts.inProgressTickets}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <p className="text-[11px] font-medium text-slate-500">Resolved</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
                  {data.counts.resolvedTickets}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <p className="text-[11px] font-medium text-slate-500">SLA Compliance</p>
                <p
                  className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
                    data.counts.slaCompliancePct >= 90 ? 'text-emerald-700' : 'text-amber-600'
                  }`}
                >
                  {data.counts.slaCompliancePct}%
                </p>
              </div>
            </div>

            {/* Ticket Trend + Category/Priority Analytics */}
            <div className="grid lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-1">
                  7-Day Ticket Volume vs. Resolution
                </h2>
                <p className="text-xs text-slate-500 mb-4">
                  Intake compared against completed service requests
                </p>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="created"
                        name="Created"
                        stroke="#1d4ed8"
                        fill="#dbeafe"
                      />
                      <Area
                        type="monotone"
                        dataKey="resolved"
                        name="Resolved"
                        stroke="#15803d"
                        fill="#dcfce7"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-3 bg-white border border-slate-200 rounded-lg p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">Category Distribution</h2>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.categoryDistribution} layout="vertical">
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={85}
                        tick={{ fontSize: 11, fill: '#475569' }}
                      />
                      <Tooltip />
                      <Bar dataKey="count" fill="#1e293b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-3 bg-white border border-slate-200 rounded-lg p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">Priority Distribution</h2>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.priorityDistribution}>
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Agent Performance Matrix */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Agent Performance Summary</h2>
                <button
                  onClick={() => navigate('/admin/reports-settings')}
                  className="text-xs font-medium text-blue-700 hover:text-blue-800"
                >
                  Export Full Reports
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <th className="py-2.5 px-4">Support Agent</th>
                      <th className="py-2.5 px-4">Availability</th>
                      <th className="py-2.5 px-4 text-right">Assigned</th>
                      <th className="py-2.5 px-4 text-right">Resolved</th>
                      <th className="py-2.5 px-4 text-right">SLA Breaches</th>
                      <th className="py-2.5 px-4 text-right">Avg Resolution</th>
                      <th className="py-2.5 px-4 text-right">SLA Compliance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {data.agentPerformance.map((ag) => (
                      <tr key={ag.agentId} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-900">{ag.agentName}</td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {ag.availabilityStatus}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {ag.assignedCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {ag.resolvedCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-red-700">
                          {ag.breachedCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {ag.avgResolutionMinutes}m
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {ag.slaCompliancePct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}
    </AppShell>
  );
};
