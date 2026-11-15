import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Paperclip,
  RotateCcw,
  Send,
  Upload,
} from 'lucide-react';
import { AppShell } from '../layouts/AppShell';
import { apiClient, API_BASE_URL, extractApiError, getStoredToken } from '../services/api';
import { Ticket } from '../types';
import { PriorityLabel, StatusLabel } from '../components/StatusIndicators';
import { SlaCountdown } from '../components/SlaCountdown';
import { formatBytes, formatLocalDateTime } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

export const EmployeeTicketDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refreshNotifications } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadTicket = useCallback(async () => {
    try {
      const res = await apiClient.get(`/tickets/${id}`);
      setTicket(res.data.data);
      setError(null);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load ticket details.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim() || !ticket) return;
    setSubmittingComment(true);
    try {
      const res = await apiClient.post(`/tickets/${ticket.id}/comments`, {
        body: commentBody.trim(),
        internalNote: false,
      });
      setTicket(res.data.data);
      setCommentBody('');
      await refreshNotifications();
    } catch (err) {
      setActionMsg(extractApiError(err));
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ticket) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await apiClient.post(`/tickets/${ticket.id}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTicket(res.data.data);
      setActionMsg(`Uploaded ${file.name}`);
    } catch (err) {
      setActionMsg(extractApiError(err));
    }
  };

  const handleReopen = async () => {
    if (!ticket) return;
    try {
      const res = await apiClient.post(`/tickets/${ticket.id}/reopen`, {
        reason: reopenReason.trim() || 'Issue persists after resolution',
      });
      setTicket(res.data.data);
      setShowReopenModal(false);
      setReopenReason('');
      await refreshNotifications();
    } catch (err) {
      setActionMsg(extractApiError(err));
    }
  };

  const handleCloseTicket = async () => {
    if (!ticket) return;
    try {
      const res = await apiClient.patch(`/tickets/${ticket.id}/status`, {
        status: 'CLOSED',
        reason: 'Employee confirmed resolution',
      });
      setTicket(res.data.data);
    } catch (err) {
      setActionMsg(extractApiError(err));
    }
  };

  return (
    <AppShell breadcrumb={`Employee Portal / Ticket ${ticket?.ticketNumber || ''}`}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <button
          onClick={() => navigate('/employee/tickets?tab=list')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Tickets
        </button>

        {ticket && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') && (
          <div className="flex items-center gap-2">
            {ticket.status === 'RESOLVED' && (
              <button
                onClick={handleCloseTicket}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirm & Close
              </button>
            )}
            <button
              onClick={() => setShowReopenModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reopen Ticket
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      ) : (
        ticket && (
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Main Description & Comments */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <div className="flex flex-wrap items-center gap-2.5 mb-3">
                  <span className="font-mono text-xs font-semibold text-slate-600">
                    {ticket.ticketNumber}
                  </span>
                  <StatusLabel status={ticket.status} />
                  <PriorityLabel priority={ticket.priority} />
                </div>
                <h2 className="font-display text-xl font-semibold text-slate-900 mb-3">
                  {ticket.subject}
                </h2>
                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                  {ticket.description}
                </p>

                {ticket.resolutionSummary && (
                  <div className="mt-5 p-4 bg-emerald-50 border border-emerald-200 rounded-md">
                    <p className="text-xs font-semibold text-emerald-900 mb-1">
                      Resolution Summary
                    </p>
                    <p className="text-xs text-emerald-800">{ticket.resolutionSummary}</p>
                  </div>
                )}

                {actionMsg && (
                  <div className="mt-4 p-2.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                    {actionMsg}
                  </div>
                )}

                {/* Attachments */}
                <div className="mt-6 pt-5 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-slate-800">
                      Attachments ({ticket.attachments.length})
                    </h3>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      Upload File
                      <input type="file" onChange={handleUploadAttachment} className="hidden" />
                    </label>
                  </div>
                  {ticket.attachments.length === 0 ? (
                    <p className="text-xs text-slate-500">No files attached to this ticket.</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-2.5">
                      {ticket.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={`${API_BASE_URL}/tickets/attachments/${att.id}/download?token=${encodeURIComponent(
                            getStoredToken() || ''
                          )}`}
                          className="flex items-center justify-between p-2.5 border border-slate-200 rounded hover:bg-slate-50 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 truncate">
                                {att.originalFileName}
                              </p>
                              <p className="text-[11px] font-mono text-slate-400">
                                {formatBytes(att.sizeBytes)}
                              </p>
                            </div>
                          </div>
                          <Download className="w-4 h-4 text-slate-500 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Conversation Thread */}
              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">
                  Communication Thread ({ticket.comments.length})
                </h3>
                <div className="space-y-4 mb-6">
                  {ticket.comments.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No comments yet. Send a message below to update the support team.
                    </p>
                  ) : (
                    ticket.comments.map((c) => (
                      <div
                        key={c.id}
                        className="p-4 rounded-md border border-slate-200 bg-slate-50/70"
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold text-slate-900">
                            {c.authorName}{' '}
                            <span className="font-normal text-slate-500">
                              · {c.authorRole === 'EMPLOYEE' ? 'Requester' : 'Support Team'}
                            </span>
                          </span>
                          <span className="font-mono text-slate-400">
                            {formatLocalDateTime(c.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-line">{c.body}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleAddComment} className="space-y-3">
                  <textarea
                    rows={3}
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Write a reply or share additional troubleshooting details..."
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submittingComment}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {submittingComment ? 'Posting...' : 'Post Reply'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Sidebar Metadata & Status History */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3.5 text-xs">
                <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
                  Ticket Metadata
                </h3>
                <div className="flex justify-between">
                  <span className="text-slate-500">Requester</span>
                  <span className="font-medium text-slate-900">{ticket.requesterName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Department</span>
                  <span className="font-medium text-slate-900">{ticket.departmentName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Category</span>
                  <span className="font-medium text-slate-900">{ticket.categoryName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Assigned Agent</span>
                  <span className="font-medium text-slate-900">
                    {ticket.assignedAgentName || 'Awaiting Assignment'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Resolution SLA</span>
                  <SlaCountdown
                    dueAt={ticket.resolutionDueAt}
                    status={ticket.status}
                    slaBreached={ticket.slaBreached}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Created</span>
                  <span className="font-mono text-slate-700">
                    {formatLocalDateTime(ticket.createdAt)}
                  </span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200 mb-3">
                  Status History & Timeline
                </h3>
                <div className="space-y-3">
                  {ticket.statusHistory.map((h) => (
                    <div key={h.id} className="text-xs border-b border-slate-100 pb-2.5 last:border-0">
                      <div className="flex items-center justify-between font-medium text-slate-900">
                        <span>
                          {h.fromStatus ? `${h.fromStatus} -> ${h.toStatus}` : h.toStatus}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {formatLocalDateTime(h.changedAt)}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-0.5">{h.reason}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">By {h.changedByName}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {showReopenModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Reopen Ticket {ticket?.ticketNumber}
            </h3>
            <p className="text-xs text-slate-600">
              Explain why this issue requires further investigation from the support team.
            </p>
            <textarea
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="e.g., Error 403 returned again after restarting session..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReopenModal(false)}
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-md text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleReopen}
                className="px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800"
              >
                Confirm Reopen
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};
