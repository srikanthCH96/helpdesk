import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppShell } from '../layouts/AppShell';
import { apiClient, extractApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Department, Ticket, TicketCategory, TicketPriority } from '../types';
import { PriorityLabel, StatusLabel } from '../components/StatusIndicators';
import { SlaCountdown } from '../components/SlaCountdown';
import { formatBytes, formatLocalDateTime } from '../utils/formatters';

export const EmployeeTicketsPage: React.FC = () => {
  const { user, refreshNotifications } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'create' ? 'create' : 'list';

  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Create Ticket Form State
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number>(1);
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [departmentId, setDepartmentId] = useState<number>(user?.departmentId || 1);
  const [files, setFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // My Tickets List State
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    Promise.all([apiClient.get('/categories'), apiClient.get('/departments')]).then(
      ([catRes, deptRes]) => {
        const cats = (catRes.data.data || []).filter((c: TicketCategory) => c.active);
        setCategories(cats);
        if (cats.length > 0) setCategoryId(cats[0].id);
        setDepartments(deptRes.data.data || []);
      }
    );
  }, []);

  const fetchTickets = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await apiClient.get('/tickets', {
        params: {
          search,
          status: statusFilter,
          priority: priorityFilter,
          categoryId: categoryFilter,
          sortBy,
          sortDir,
          page,
          pageSize: 8,
        },
      });
      setTickets(res.data.data.items || []);
      setTotal(res.data.data.total || 0);
      setTotalPages(res.data.data.totalPages || 1);
    } finally {
      setLoadingList(false);
    }
  }, [search, statusFilter, priorityFilter, categoryFilter, sortBy, sortDir, page]);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchTickets();
    }
  }, [activeTab, fetchTickets]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    const valid = picked.filter((f) => f.size <= 10 * 1024 * 1024);
    if (valid.length < picked.length) {
      setCreateError('Some files exceeded the 10 MB size limit and were skipped.');
    }
    setFiles((prev) => [...prev, ...valid]);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    if (subject.trim().length < 5) {
      setCreateError('Subject must be at least 5 characters.');
      return;
    }
    if (description.trim().length < 15) {
      setCreateError('Please provide a clear issue description (minimum 15 characters).');
      return;
    }

    setCreating(true);
    try {
      const res = await apiClient.post('/tickets', {
        subject: subject.trim(),
        description: description.trim(),
        categoryId,
        priority,
        departmentId,
      });
      const created: Ticket = res.data.data;

      // Upload attachments sequentially if selected
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        await apiClient.post(`/tickets/${created.id}/attachments`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      await refreshNotifications();
      setSubject('');
      setDescription('');
      setFiles([]);
      setCreateSuccess(`Ticket ${created.ticketNumber} submitted successfully.`);
      setTimeout(() => {
        navigate(`/employee/tickets/${created.id}`);
      }, 600);
    } catch (err) {
      setCreateError(extractApiError(err, 'Could not submit ticket.'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell
      breadcrumb="Employee Portal / Create & My Tickets"
      primaryAction={
        activeTab === 'list'
          ? { label: 'New Ticket', onClick: () => setSearchParams({ tab: 'create' }) }
          : { label: 'My Tickets', onClick: () => setSearchParams({ tab: 'list' }) }
      }
    >
      {/* Tabs */}
      <div className="mb-6 flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        <button
          onClick={() => setSearchParams({ tab: 'list' })}
          className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'list'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          My Tickets ({total})
        </button>
        <button
          onClick={() => setSearchParams({ tab: 'create' })}
          className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'create'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Create New Ticket
        </button>
      </div>

      {activeTab === 'create' ? (
        <div className="max-w-3xl bg-white border border-slate-200 rounded-lg p-6 lg:p-8">
          <h2 className="font-display text-lg font-semibold text-slate-900 mb-1">
            Submit an IT Service Request
          </h2>
          <p className="text-xs text-slate-500 mb-6">
            Provide diagnostic context and attach screenshots or logs to accelerate triage.
          </p>

          {createError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          {createSuccess && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{createSuccess}</span>
            </div>
          )}

          <form onSubmit={handleCreateTicket} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Ticket Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Corporate VPN handshake timeout on macOS 15.2"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="LOW">Low (P4)</option>
                  <option value="MEDIUM">Medium (P3)</option>
                  <option value="HIGH">High (P2)</option>
                  <option value="CRITICAL">Critical (P1)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Department
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Detailed Description
              </label>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe steps to reproduce, error codes, affected device/application, and business impact..."
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                File Attachments (Max 10 MB per file · PNG, JPG, PDF, LOG, TXT, CSV, DOCX)
              </label>
              <label className="flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-lg p-5 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                <Upload className="w-5 h-5 text-slate-500 mb-1.5" />
                <span className="text-xs font-medium text-slate-700">
                  Click to select screenshots or diagnostic logs
                </span>
                <input
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.pdf,.txt,.log,.csv,.docx,.xlsx"
                  onChange={handleFilePick}
                  className="hidden"
                />
              </label>
              {files.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {files.map((f, idx) => (
                    <li
                      key={`${f.name}-${idx}`}
                      className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate font-medium text-slate-800">{f.name}</span>
                        <span className="font-mono text-slate-400 shrink-0">
                          {formatBytes(f.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-red-600 hover:text-red-800 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSearchParams({ tab: 'list' })}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50"
              >
                {creating ? 'Submitting Ticket...' : 'Submit Ticket'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-200 grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by ticket ID or subject..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => {
                const [sb, sd] = e.target.value.split(':');
                setSortBy(sb);
                setSortDir(sd as 'asc' | 'desc');
              }}
              className="px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="createdAt:desc">Newest First</option>
              <option value="createdAt:asc">Oldest First</option>
              <option value="priority:desc">Highest Priority</option>
              <option value="resolutionDueAt:asc">Nearest SLA Due</option>
            </select>
          </div>

          {loadingList ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading your tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-slate-600 mb-3">No tickets matched your filters.</p>
              <button
                onClick={() => setSearchParams({ tab: 'create' })}
                className="px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800"
              >
                Create Support Ticket
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Ticket</th>
                    <th className="py-2.5 px-4">Subject & Category</th>
                    <th className="py-2.5 px-4">Priority</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Assigned Agent</th>
                    <th className="py-2.5 px-4">SLA Target</th>
                    <th className="py-2.5 px-4 text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/employee/tickets/${t.id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">
                        {t.ticketNumber}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 line-clamp-1">{t.subject}</p>
                        <p className="text-xs text-slate-500">
                          {t.categoryName} · {t.departmentName}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <PriorityLabel priority={t.priority} />
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={t.status} />
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        {t.assignedAgentName || 'Unassigned'}
                      </td>
                      <td className="py-3 px-4">
                        <SlaCountdown
                          dueAt={t.resolutionDueAt}
                          status={t.status}
                          slaBreached={t.slaBreached}
                        />
                      </td>
                      <td className="py-3 px-4 text-right text-xs font-mono text-slate-500 whitespace-nowrap">
                        {formatLocalDateTime(t.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span className="font-mono tabular-nums">
              Page {page} of {totalPages} · {total} total tickets
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};
