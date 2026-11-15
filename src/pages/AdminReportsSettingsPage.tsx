import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Save, ShieldCheck } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AppShell } from '../layouts/AppShell';
import { apiClient, API_BASE_URL, extractApiError, getStoredToken } from '../services/api';
import { AuditLogItem, SystemSettings, Ticket } from '../types';
import { formatLocalDateTime } from '../utils/formatters';

interface AgentReportRow {
  agentId: number;
  agentName: string;
  email: string;
  assignedCount: number;
  resolvedCount: number;
  breachedCount: number;
  avgResolutionMinutes: number;
  slaCompliancePct: number;
}

interface DeptReportRow {
  departmentId: number;
  departmentName: string;
  code: string;
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  slaCompliancePct: number;
}

interface SlaReportRow {
  priority: string;
  targetResponseMinutes: number;
  targetResolutionMinutes: number;
  totalTickets: number;
  breachedTickets: number;
  compliancePct: number;
}

export const AdminReportsSettingsPage: React.FC = () => {
  const [tab, setTab] = useState<'REPORTS' | 'SETTINGS' | 'SECURITY'>('REPORTS');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [ticketsReport, setTicketsReport] = useState<Ticket[]>([]);
  const [deptReport, setDeptReport] = useState<DeptReportRow[]>([]);
  const [agentReport, setAgentReport] = useState<AgentReportRow[]>([]);
  const [slaReport, setSlaReport] = useState<SlaReportRow[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadReportsAndSettings = useCallback(async () => {
    const [tRes, aRes, sRes, cfgRes, logRes] = await Promise.all([
      apiClient.get('/reports/tickets', { params: { fromDate, toDate } }),
      apiClient.get('/reports/agents'),
      apiClient.get('/reports/sla'),
      apiClient.get('/settings'),
      apiClient.get('/settings/audit-logs'),
    ]);
    setTicketsReport(tRes.data.data.tickets || []);
    setDeptReport(tRes.data.data.byDepartment || []);
    setAgentReport(aRes.data.data || []);
    setSlaReport(sRes.data.data || []);
    setSettings(cfgRes.data.data);
    setAuditLogs(logRes.data.data || []);
  }, [fromDate, toDate]);

  useEffect(() => {
    loadReportsAndSettings();
  }, [loadReportsAndSettings]);

  const handleExportCsv = () => {
    const token = getStoredToken() || '';
    window.open(`${API_BASE_URL}/reports/export/csv?token=${encodeURIComponent(token)}`, '_blank');
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('HelpDesk Pro Enterprise — Executive Service & SLA Report', 14, 16);
    doc.setFontSize(10);
    doc.text(`Generated UTC: ${new Date().toISOString()}`, 14, 23);

    autoTable(doc, {
      startY: 28,
      head: [['Ticket #', 'Subject', 'Priority', 'Status', 'Department', 'Assigned Agent', 'SLA']],
      body: ticketsReport.map((t) => [
        t.ticketNumber,
        t.subject.slice(0, 48),
        t.priority,
        t.status,
        t.departmentName,
        t.assignedAgentName || 'Unassigned',
        t.slaBreached ? 'BREACHED' : 'COMPLIANT',
      ]),
      styles: { fontSize: 8 },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 90;
    autoTable(doc, {
      startY: finalY + 10,
      head: [['Agent', 'Assigned', 'Resolved', 'Breaches', 'Avg Resolution (m)', 'Compliance %']],
      body: agentReport.map((a) => [
        a.agentName,
        String(a.assignedCount),
        String(a.resolvedCount),
        String(a.breachedCount),
        `${a.avgResolutionMinutes}m`,
        `${a.slaCompliancePct}%`,
      ]),
      styles: { fontSize: 8 },
    });

    doc.save('helpdesk-pro-executive-report.pdf');
    setFeedback('Exported executive PDF report.');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      const res = await apiClient.put('/settings', settings);
      setSettings(res.data.data);
      setFeedback('System settings persisted and audited.');
    } catch (err) {
      setFeedback(extractApiError(err));
    }
  };

  return (
    <AppShell
      breadcrumb="Administration / Reports, Exports & System Settings"
      primaryAction={{
        label: 'Export PDF Report',
        onClick: handleExportPdf,
      }}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            onClick={() => setTab('REPORTS')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === 'REPORTS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Reports & Exports
          </button>
          <button
            onClick={() => setTab('SETTINGS')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === 'SETTINGS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Company & Email Settings
          </button>
          <button
            onClick={() => setTab('SECURITY')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === 'SECURITY' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Security, Roles & Audit Logs
          </button>
        </div>

        {tab === 'REPORTS' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
              aria-label="From date"
            />
            <span className="text-xs text-slate-500">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
              aria-label="To date"
            />
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              CSV Export
            </button>
            <button
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              <FileText className="w-3.5 h-3.5" />
              PDF Export
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
          {feedback}
        </div>
      )}

      {tab === 'REPORTS' && (
        <div className="space-y-6">
          {/* SLA Compliance Report */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">SLA Compliance by Priority</h2>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Priority</th>
                  <th className="py-2.5 px-4 text-right">Response Target</th>
                  <th className="py-2.5 px-4 text-right">Resolution Target</th>
                  <th className="py-2.5 px-4 text-right">Total Tickets</th>
                  <th className="py-2.5 px-4 text-right">Breached</th>
                  <th className="py-2.5 px-4 text-right">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {slaReport.map((row) => (
                  <tr key={row.priority} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-slate-900">{row.priority}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {row.targetResponseMinutes}m
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {row.targetResolutionMinutes}m
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {row.totalTickets}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-red-700">
                      {row.breachedTickets}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {row.compliancePct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Department & Agent Reports */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">Department Service Report</h2>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Department</th>
                    <th className="py-2.5 px-4 text-right">Total</th>
                    <th className="py-2.5 px-4 text-right">Open</th>
                    <th className="py-2.5 px-4 text-right">Resolved</th>
                    <th className="py-2.5 px-4 text-right">SLA %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {deptReport.map((d) => (
                    <tr key={d.departmentId} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{d.departmentName}</p>
                        <p className="text-[11px] font-mono text-slate-500">{d.code}</p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {d.totalTickets}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {d.openTickets}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {d.resolvedTickets}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {d.slaCompliancePct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">
                  Agent Performance & Resolution Time
                </h2>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Agent</th>
                    <th className="py-2.5 px-4 text-right">Assigned</th>
                    <th className="py-2.5 px-4 text-right">Resolved</th>
                    <th className="py-2.5 px-4 text-right">Avg Time</th>
                    <th className="py-2.5 px-4 text-right">SLA %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {agentReport.map((a) => (
                    <tr key={a.agentId} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">{a.agentName}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {a.assignedCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {a.resolvedCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {a.avgResolutionMinutes}m
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {a.slaCompliancePct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'SETTINGS' && settings && (
        <form
          onSubmit={handleSaveSettings}
          className="max-w-3xl bg-white border border-slate-200 rounded-lg p-6 space-y-6"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-3">
              Company & Business Calendar Settings
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  value={settings.companyName}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Primary Support Email
                </label>
                <input
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Business Hours Start (UTC)
                </label>
                <input
                  type="time"
                  value={settings.businessHoursStart}
                  onChange={(e) => setSettings({ ...settings, businessHoursStart: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Business Hours End (UTC)
                </label>
                <input
                  type="time"
                  value={settings.businessHoursEnd}
                  onChange={(e) => setSettings({ ...settings, businessHoursEnd: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">
              SMTP Email & Object Storage Configuration
            </h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={settings.smtpHost}
                  onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">SMTP Port</label>
                <input
                  type="number"
                  value={settings.smtpPort}
                  onChange={(e) => setSettings({ ...settings, smtpPort: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">From Address</label>
                <input
                  type="email"
                  value={settings.smtpFrom}
                  onChange={(e) => setSettings({ ...settings, smtpFrom: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Storage Adapter:{' '}
              <span className="font-mono font-medium text-slate-700">
                {settings.s3Configured ? `AWS S3 (${settings.s3Bucket})` : 'Local Dev Storage Adapter'}
              </span>{' '}
              · SMTP Passwords & AWS Keys are configured strictly via server environment variables.
            </p>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-200">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800"
            >
              <Save className="w-3.5 h-3.5" />
              Save Configuration
            </button>
          </div>
        </form>
      )}

      {tab === 'SECURITY' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-blue-700" />
              <h2 className="text-sm font-semibold text-slate-900">
                Role-Based Access Control (RBAC) Matrix
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2.5 px-4">Capability</th>
                    <th className="py-2.5 px-4">Employee</th>
                    <th className="py-2.5 px-4">Support Agent</th>
                    <th className="py-2.5 px-4">Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ['Create Tickets & Upload Attachments', 'Allowed', 'Allowed', 'Allowed'],
                    ['View Other Employees Private Tickets', 'Blocked', 'Assigned Only', 'Allowed'],
                    ['Internal Engineering Notes', 'Hidden', 'Allowed', 'Allowed'],
                    ['Accept Queue & Resolve Tickets', 'Blocked', 'Allowed', 'Allowed'],
                    ['Manage Users, Categories & SLA Rules', 'Blocked', 'Blocked', 'Allowed'],
                    ['Export Reports & Modify System Settings', 'Blocked', 'Read Reports', 'Allowed'],
                  ].map(([cap, emp, ag, adm]) => (
                    <tr key={cap}>
                      <td className="py-2.5 px-4 font-medium text-slate-800">{cap}</td>
                      <td className="py-2.5 px-4 text-slate-600">{emp}</td>
                      <td className="py-2.5 px-4 text-slate-600">{ag}</td>
                      <td className="py-2.5 px-4 font-medium text-emerald-700">{adm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Security Audit Log ({auditLogs.length} events)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2.5 px-4">Timestamp (Local)</th>
                    <th className="py-2.5 px-4">Actor</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Entity</th>
                    <th className="py-2.5 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.slice(0, 25).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {formatLocalDateTime(log.createdAt)}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-800">{log.actorEmail}</td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-800">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">
                        {log.entityType} · {log.entityId}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};
