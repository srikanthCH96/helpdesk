import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Plus, RefreshCw, ShieldAlert, UserCheck } from 'lucide-react';
import { AppShell } from '../layouts/AppShell';
import { apiClient, extractApiError } from '../services/api';
import {
  SlaRule,
  Ticket,
  TicketCategory,
  TicketEscalation,
  TicketPriority,
  User,
} from '../types';
import { PriorityLabel, StatusLabel } from '../components/StatusIndicators';
import { SlaCountdown } from '../components/SlaCountdown';
import { formatLocalDateTime } from '../utils/formatters';

export const AdminTicketsSlaPage: React.FC = () => {
  const [tab, setTab] = useState<'TICKETS' | 'CATEGORIES' | 'SLA'>('TICKETS');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [slaRules, setSlaRules] = useState<SlaRule[]>([]);
  const [breaches, setBreaches] = useState<Ticket[]>([]);
  const [escalations, setEscalations] = useState<TicketEscalation[]>([]);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Assign Modal
  const [assignTicket, setAssignTicket] = useState<Ticket | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number>(0);
  const [assignNotes, setAssignNotes] = useState('');

  // Category Form
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatPriority, setNewCatPriority] = useState<TicketPriority>('MEDIUM');

  // SLA Rule Edit Modal
  const [editingRule, setEditingRule] = useState<SlaRule | null>(null);

  const loadAll = useCallback(async () => {
    const [tRes, uRes, cRes, sRes, bRes, eRes] = await Promise.all([
      apiClient.get('/tickets', {
        params: { unassigned: unassignedOnly ? 'true' : undefined, pageSize: 50 },
      }),
      apiClient.get('/users', { params: { role: 'SUPPORT_AGENT', active: 'true' } }),
      apiClient.get('/categories'),
      apiClient.get('/sla/rules'),
      apiClient.get('/sla/breaches'),
      apiClient.get('/sla/escalations'),
    ]);

    setTickets(tRes.data.data.items || []);
    const ags: User[] = uRes.data.data || [];
    setAgents(ags);
    if (ags.length > 0 && !selectedAgentId) setSelectedAgentId(ags[0].id);
    setCategories(cRes.data.data || []);
    setSlaRules(sRes.data.data || []);
    setBreaches(bRes.data.data || []);
    setEscalations(eRes.data.data || []);
  }, [unassignedOnly, selectedAgentId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTicket || !selectedAgentId) return;
    try {
      await apiClient.post(`/tickets/${assignTicket.id}/assign`, {
        agentId: selectedAgentId,
        notes: assignNotes || 'Assigned via Ticket Administration console',
      });
      setAssignTicket(null);
      setAssignNotes('');
      setFeedback(`Ticket ${assignTicket.ticketNumber} assigned.`);
      await loadAll();
    } catch (err) {
      setFeedback(extractApiError(err));
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await apiClient.post('/categories', {
        name: newCatName.trim(),
        description: newCatDesc.trim(),
        defaultPriority: newCatPriority,
      });
      setNewCatName('');
      setNewCatDesc('');
      setFeedback(`Category "${newCatName}" created.`);
      await loadAll();
    } catch (err) {
      setFeedback(extractApiError(err));
    }
  };

  const handleToggleCategory = async (cat: TicketCategory) => {
    await apiClient.put(`/categories/${cat.id}`, { active: !cat.active });
    await loadAll();
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    try {
      await apiClient.put(`/sla/rules/${editingRule.id}`, editingRule);
      setEditingRule(null);
      setFeedback(`Updated SLA policy "${editingRule.name}".`);
      await loadAll();
    } catch (err) {
      setFeedback(extractApiError(err));
    }
  };

  const handleRunSlaCheck = async () => {
    const res = await apiClient.post('/sla/check-now');
    const r = res.data.data;
    setFeedback(
      `SLA check executed: ${r.warningsTriggered} warnings, ${r.breachesDetected} new breaches, ${r.escalationsCreated} escalations.`
    );
    await loadAll();
  };

  return (
    <AppShell
      breadcrumb="Administration / Ticket Governance & SLA Rules"
      primaryAction={{
        label: 'Run SLA Audit Cycle',
        onClick: handleRunSlaCheck,
      }}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            onClick={() => setTab('TICKETS')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === 'TICKETS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Ticket Assignment Queue ({tickets.length})
          </button>
          <button
            onClick={() => setTab('CATEGORIES')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === 'CATEGORIES' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Categories ({categories.length})
          </button>
          <button
            onClick={() => setTab('SLA')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === 'SLA' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            SLA Rules & Escalations ({breaches.length} breached)
          </button>
        </div>

        {tab === 'TICKETS' && (
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={unassignedOnly}
              onChange={(e) => setUnassignedOnly(e.target.checked)}
              className="rounded border-slate-300 text-blue-700"
            />
            Show Unassigned Tickets Only
          </label>
        )}
      </div>

      {feedback && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
          {feedback}
        </div>
      )}

      {tab === 'TICKETS' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">ID</th>
                  <th className="py-2.5 px-4">Subject & Requester</th>
                  <th className="py-2.5 px-4">Priority</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Assigned Agent</th>
                  <th className="py-2.5 px-4">SLA</th>
                  <th className="py-2.5 px-4 text-right">Assignment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800">
                      {t.ticketNumber}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900 line-clamp-1">{t.subject}</p>
                      <p className="text-xs text-slate-500">
                        {t.requesterName} · {t.categoryName} · {t.departmentName}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <PriorityLabel priority={t.priority} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusLabel status={t.status} />
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">
                      {t.assignedAgentName || (
                        <span className="text-amber-700 font-medium">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <SlaCountdown
                        dueAt={t.resolutionDueAt}
                        status={t.status}
                        slaBreached={t.slaBreached}
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setAssignTicket(t);
                          setSelectedAgentId(t.assignedAgentId || agents[0]?.id || 0);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded text-slate-700 hover:bg-slate-100"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        {t.assignedAgentId ? 'Reassign' : 'Assign'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'CATEGORIES' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-6 h-fit">
            <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-700" />
              Add Ticket Category
            </h2>
            <form onSubmit={handleAddCategory} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g., Security Compliance"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Default Priority
                </label>
                <select
                  value={newCatPriority}
                  onChange={(e) => setNewCatPriority(e.target.value as TicketPriority)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800"
              >
                Create Category
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Default Priority</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.description}</p>
                    </td>
                    <td className="py-3 px-4">
                      <PriorityLabel priority={c.defaultPriority} />
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {c.active ? 'Active' : 'Inactive'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleToggleCategory(c)}
                        className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded hover:bg-slate-100"
                      >
                        {c.active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'SLA' && (
        <div className="space-y-6">
          {/* SLA Rules Matrix */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Priority SLA Response, Resolution & Escalation Rules
              </h2>
              <button
                onClick={handleRunSlaCheck}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Check Breaches Now
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Policy Name</th>
                    <th className="py-2.5 px-4">Priority</th>
                    <th className="py-2.5 px-4 text-right">Response Target</th>
                    <th className="py-2.5 px-4 text-right">Resolution Target</th>
                    <th className="py-2.5 px-4 text-right">Esc. L1 / L2</th>
                    <th className="py-2.5 px-4">Calendar</th>
                    <th className="py-2.5 px-4 text-right">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {slaRules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">{r.name}</td>
                      <td className="py-3 px-4">
                        <PriorityLabel priority={r.priority} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                        {r.responseTimeMinutes}m
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                        {r.resolutionTimeMinutes}m
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                        {r.escalationLevel1Minutes}m / {r.escalationLevel2Minutes}m
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {r.businessHoursOnly ? 'Business Hours' : '24/7 Continuous'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setEditingRule({ ...r })}
                          className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded hover:bg-slate-100"
                        >
                          Configure
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Breaches & Escalations Split */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  SLA Breached & Overdue Tickets ({breaches.length})
                </h3>
              </div>
              {breaches.length === 0 ? (
                <p className="text-xs text-slate-500">Zero SLA breaches currently active.</p>
              ) : (
                <div className="space-y-2.5">
                  {breaches.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 border border-red-200 bg-red-50/50 rounded-md flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-red-800">
                          {b.ticketNumber} · Esc L{b.escalationLevel}
                        </p>
                        <p className="font-medium text-slate-900 truncate">{b.subject}</p>
                        <p className="text-slate-600">
                          Agent: {b.assignedAgentName || 'Unassigned'}
                        </p>
                      </div>
                      <SlaCountdown
                        dueAt={b.resolutionDueAt}
                        status={b.status}
                        slaBreached={b.slaBreached}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Escalation History ({escalations.length})
                </h3>
              </div>
              {escalations.length === 0 ? (
                <p className="text-xs text-slate-500">No escalations logged.</p>
              ) : (
                <div className="space-y-2.5">
                  {escalations.map((esc) => (
                    <div
                      key={esc.id}
                      className="p-3 border border-slate-200 rounded-md text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-slate-800">
                          {esc.ticketNumber} · Level {esc.level}
                        </span>
                        <span className="font-mono text-slate-400">
                          {formatLocalDateTime(esc.escalatedAt)}
                        </span>
                      </div>
                      <p className="text-slate-700">{esc.reason}</p>
                      <p className="text-slate-500">Escalated to: {esc.escalatedToName}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assign Agent Modal */}
      {assignTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleAssignSubmit}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4"
          >
            <h3 className="font-display text-base font-semibold text-slate-900">
              Assign {assignTicket.ticketNumber}
            </h3>
            <p className="text-xs text-slate-600">{assignTicket.subject}</p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Select Support Agent
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.fullName} ({ag.activeAssignedCount} active · {ag.availabilityStatus})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Assignment Notes
              </label>
              <input
                type="text"
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                placeholder="Priority triage assignment"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignTicket(null)}
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-md text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800"
              >
                Confirm Assignment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit SLA Rule Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRule}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4"
          >
            <h3 className="font-display text-base font-semibold text-slate-900">
              Configure {editingRule.name}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Response Target (mins)
                </label>
                <input
                  type="number"
                  min={5}
                  value={editingRule.responseTimeMinutes}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, responseTimeMinutes: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Resolution Target (mins)
                </label>
                <input
                  type="number"
                  min={15}
                  value={editingRule.resolutionTimeMinutes}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      resolutionTimeMinutes: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Escalation L1 (mins)
                </label>
                <input
                  type="number"
                  min={5}
                  value={editingRule.escalationLevel1Minutes}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      escalationLevel1Minutes: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Warning Alert Before (mins)
                </label>
                <input
                  type="number"
                  min={5}
                  value={editingRule.notifyBeforeMinutes}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, notifyBeforeMinutes: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={editingRule.businessHoursOnly}
                onChange={(e) =>
                  setEditingRule({ ...editingRule, businessHoursOnly: e.target.checked })
                }
              />
              Enforce during business hours only (skip weekends/holidays)
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-md text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800"
              >
                Save SLA Policy
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
};
