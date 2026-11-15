import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Download,
  Lock,
  Paperclip,
  Play,
  Search,
  Send,
  Upload,
  UserPlus,
} from 'lucide-react';
import { AppShell } from '../layouts/AppShell';
import { apiClient, API_BASE_URL, extractApiError, getStoredToken } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Ticket, TicketCategory } from '../types';
import { PriorityLabel, StatusLabel } from '../components/StatusIndicators';
import { SlaCountdown } from '../components/SlaCountdown';
import { formatBytes, formatLocalDateTime, formatRelativeTime } from '../utils/formatters';

export const AgentWorkspacePage: React.FC = () => {
  const { user, refreshNotifications } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedParamId = Number(searchParams.get('ticketId') || 0);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const [queueFilter, setQueueFilter] = useState<'ALL' | 'MINE' | 'UNASSIGNED'>('ALL');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const [loadingQueue, setLoadingQueue] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const [resolutionText, setResolutionText] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const res = await apiClient.get('/tickets', {
        params: {
          search,
          priority: priorityFilter,
          status: statusFilter,
          categoryId: categoryFilter,
          assignedToMe: queueFilter === 'MINE' ? 'true' : undefined,
          unassigned: queueFilter === 'UNASSIGNED' ? 'true' : undefined,
          pageSize: 50,
          sortBy: 'priority',
          sortDir: 'desc',
        },
      });
      const items: Ticket[] = res.data.data.items || [];
      setTickets(items);
      if (items.length > 0) {
        const match =
          items.find((t) => t.id === selectedParamId) ||
          items.find((t) => t.id === selectedTicket?.id) ||
          items[0];
        setSelectedTicket(match);
      } else {
        setSelectedTicket(null);
      }
    } finally {
      setLoadingQueue(false);
    }
  }, [search, priorityFilter, statusFilter, categoryFilter, queueFilter, selectedParamId, selectedTicket?.id]);

  useEffect(() => {
    apiClient.get('/categories').then((res) => setCategories(res.data.data || []));
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const selectTicket = (t: Ticket) => {
    setSelectedTicket(t);
    setSearchParams({ ticketId: String(t.id) });
    setFeedback(null);
  };

  const refreshSelected = (updated: Ticket) => {
    setSelectedTicket(updated);
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const handleAcceptAssignment = async () => {
    if (!selectedTicket || !user) return;
    try {
      const res = await apiClient.post(`/tickets/${selectedTicket.id}/assign`, {
        agentId: user.id,
        notes: 'Accepted from agent queue workspace',
      });
      refreshSelected(res.data.data);
      setFeedback('Ticket assigned to you.');
      await refreshNotifications();
    } catch (err) {
      setFeedback(extractApiError(err));
    }
  };

  const handleStatusChange = async (status: string, reason: string) => {
    if (!selectedTicket) return;
    try {
      const res = await apiClient.patch(`/tickets/${selectedTicket.id}/status`, { status, reason });
      refreshSelected(res.data.data);
      setFeedback(`Status updated to ${status}.`);
      await refreshNotifications();
    } catch (err) {
      setFeedback(extractApiError(err));
    }
  };

  const handleResolveTicket = async () => {
    if (!selectedTicket || !resolutionText.trim()) return;
    try {
      const res = await apiClient.post(`/tickets/${selectedTicket.id}/resolve`, {
        resolutionSummary: resolutionText.trim(),
      });
      refreshSelected(res.data.data);
      setShowResolveModal(false);
      setResolutionText('');
      setFeedback('Ticket resolved and requester notified.');
      await refreshNotifications();
    } catch (err) {
      setFeedback(extractApiError(err));
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !commentBody.trim()) return;
    try {
      const res = await apiClient.post(`/tickets/${selectedTicket.id}/comments`, {
        body: commentBody.trim(),
        internalNote,
      });
      refreshSelected(res.data.data);
      setCommentBody('');
      setFeedback(internalNote ? 'Internal note added.' : 'Public reply posted.');
      await refreshNotifications();
    } catch (err) {
      setFeedback(extractApiError(err));
    }
  };

  const handleUploadResolutionFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await apiClient.post(`/tickets/${selectedTicket.id}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      refreshSelected(res.data.data);
      setFeedback(`Uploaded ${file.name}`);
    } catch (err) {
      setFeedback(extractApiError(err));
    }
  };

  return (
    <AppShell breadcrumb="Agent Operations / 1440px Master-Detail Queue Workspace">
      <div className="grid lg:grid-cols-12 gap-5 min-h-[calc(100vh-11rem)]">
        {/* LEFT PANEL: Search, Filters & Queue */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg flex flex-col overflow-hidden max-h-[calc(100vh-11rem)]">
          <div className="p-3.5 border-b border-slate-200 space-y-2.5">
            {/* Queue Scope Tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-md">
              {(['ALL', 'MINE', 'UNASSIGNED'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setQueueFilter(tab)}
                  className={`py-1.5 text-xs font-medium rounded transition-colors ${
                    queueFilter === tab
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab === 'ALL' ? 'All Queue' : tab === 'MINE' ? 'My Assigned' : 'Unassigned'}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search queue by ID, subject, user..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-2 py-1.5 text-[11px] border border-slate-300 rounded bg-white"
              >
                <option value="ALL">Priority</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1.5 text-[11px] border border-slate-300 rounded bg-white"
              >
                <option value="ALL">Status</option>
                <option value="OPEN">Open</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2 py-1.5 text-[11px] border border-slate-300 rounded bg-white"
              >
                <option value="ALL">Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingQueue ? (
              <div className="p-6 text-center text-xs text-slate-500">Loading ticket queue...</div>
            ) : tickets.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No tickets match the current queue filters.
              </div>
            ) : (
              tickets.map((t) => {
                const isSelected = selectedTicket?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => selectTicket(t)}
                    className={`w-full text-left p-3.5 transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {t.ticketNumber}
                      </span>
                      <PriorityLabel priority={t.priority} />
                    </div>
                    <p className="text-xs font-semibold text-slate-900 line-clamp-1 mb-1">
                      {t.subject}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="truncate">
                        {t.requesterName} · {t.categoryName}
                      </span>
                      <span className="font-mono shrink-0">{formatRelativeTime(t.createdAt)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <StatusLabel status={t.status} />
                      <SlaCountdown
                        dueAt={t.resolutionDueAt}
                        status={t.status}
                        slaBreached={t.slaBreached}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Selected Ticket Detail & Actions */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg flex flex-col overflow-hidden max-h-[calc(100vh-11rem)]">
          {!selectedTicket ? (
            <div className="flex-1 flex items-center justify-center p-10 text-sm text-slate-500">
              Select a ticket from the queue on the left to inspect details and take action.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Top Action Toolbar */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-mono text-xs font-semibold text-slate-700">
                      {selectedTicket.ticketNumber}
                    </span>
                    <StatusLabel status={selectedTicket.status} />
                    <PriorityLabel priority={selectedTicket.priority} />
                    <SlaCountdown
                      dueAt={selectedTicket.resolutionDueAt}
                      status={selectedTicket.status}
                      slaBreached={selectedTicket.slaBreached}
                    />
                  </div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    {selectedTicket.subject}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {selectedTicket.assignedAgentId === null && (
                    <button
                      onClick={handleAcceptAssignment}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Accept Ticket
                    </button>
                  )}
                  {(selectedTicket.status === 'OPEN' || selectedTicket.status === 'ASSIGNED') && (
                    <button
                      onClick={() =>
                        handleStatusChange('IN_PROGRESS', 'Agent started diagnostics')
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Start Working
                    </button>
                  )}
                  {(selectedTicket.status === 'ASSIGNED' ||
                    selectedTicket.status === 'IN_PROGRESS') && (
                    <button
                      onClick={() => setShowResolveModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Resolve Ticket
                    </button>
                  )}
                </div>
              </div>

              {feedback && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                  {feedback}
                </div>
              )}

              {/* Requester & Assignment Metadata Grid */}
              <div className="grid sm:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-md text-xs">
                <div>
                  <p className="text-slate-500">Requester</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {selectedTicket.requesterName}
                  </p>
                  <p className="text-slate-500">{selectedTicket.requesterEmail}</p>
                </div>
                <div>
                  <p className="text-slate-500">Department & Category</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {selectedTicket.departmentName}
                  </p>
                  <p className="text-slate-500">{selectedTicket.categoryName}</p>
                </div>
                <div>
                  <p className="text-slate-500">Assigned Agent</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {selectedTicket.assignedAgentName || 'Unassigned'}
                  </p>
                  <p className="text-slate-500">
                    Escalation Level: {selectedTicket.escalationLevel}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Resolution SLA Due</p>
                  <p className="font-mono font-medium text-slate-900 mt-0.5">
                    {formatLocalDateTime(selectedTicket.resolutionDueAt)}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="text-xs font-semibold text-slate-800 mb-2">Issue Description</h3>
                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                  {selectedTicket.description}
                </p>
              </div>

              {/* Attachments */}
              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold text-slate-800">
                    Attachments ({selectedTicket.attachments.length})
                  </h3>
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    Attach Resolution File
                    <input type="file" onChange={handleUploadResolutionFile} className="hidden" />
                  </label>
                </div>
                {selectedTicket.attachments.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-2">
                    {selectedTicket.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`${API_BASE_URL}/tickets/attachments/${att.id}/download?token=${encodeURIComponent(
                          getStoredToken() || ''
                        )}`}
                        className="flex items-center justify-between p-2 border border-slate-200 rounded hover:bg-slate-50 text-xs"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate font-medium">{att.originalFileName}</span>
                          <span className="font-mono text-slate-400">
                            {formatBytes(att.sizeBytes)}
                          </span>
                        </span>
                        <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Comments & Internal Notes */}
              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-xs font-semibold text-slate-800 mb-3">
                  Comments & Internal Notes ({selectedTicket.comments.length})
                </h3>
                <div className="space-y-3 mb-4">
                  {selectedTicket.comments.map((c) => (
                    <div
                      key={c.id}
                      className={`p-3.5 rounded-md border text-sm ${
                        c.internalNote
                          ? 'bg-amber-50/70 border-amber-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                          {c.internalNote && <Lock className="w-3 h-3 text-amber-700" />}
                          {c.authorName}
                          <span className="font-normal text-slate-500">
                            · {c.internalNote ? 'Internal Note (Hidden from Employee)' : 'Public Reply'}
                          </span>
                        </span>
                        <span className="font-mono text-slate-400">
                          {formatLocalDateTime(c.createdAt)}
                        </span>
                      </div>
                      <p className="text-slate-700 whitespace-pre-line">{c.body}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handlePostComment} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInternalNote(false)}
                      className={`px-3 py-1.5 text-xs font-medium rounded border ${
                        !internalNote
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      Public Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => setInternalNote(true)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border ${
                        internalNote
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      <Lock className="w-3 h-3" />
                      Internal Note
                    </button>
                  </div>

                  <textarea
                    rows={3}
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder={
                      internalNote
                        ? 'Add private engineering diagnostics (visible to Agents & Admins only)...'
                        : 'Write a public reply to the employee...'
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {internalNote ? 'Save Internal Note' : 'Send Public Reply'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resolve Ticket Modal */}
      {showResolveModal && selectedTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Resolve {selectedTicket.ticketNumber}
            </h3>
            <p className="text-xs text-slate-600">
              Document the root cause and resolution steps. This summary will be shared with{' '}
              {selectedTicket.requesterName}.
            </p>
            <textarea
              rows={4}
              value={resolutionText}
              onChange={(e) => setResolutionText(e.target.value)}
              placeholder="e.g., Re-enrolled FIDO2 token in Okta Admin Console and verified NetSuite SSO assertion..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              required
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowResolveModal(false)}
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-md text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleResolveTicket}
                disabled={!resolutionText.trim()}
                className="px-4 py-2 text-xs font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50"
              >
                Mark as Resolved
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};
