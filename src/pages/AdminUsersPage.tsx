import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Edit2, Plus, Power, Search, UserPlus } from 'lucide-react';
import { AppShell } from '../layouts/AppShell';
import { apiClient, extractApiError } from '../services/api';
import { Department, RoleName, User } from '../types';

export const AdminUsersPage: React.FC = () => {
  const [tab, setTab] = useState<'EMPLOYEES' | 'AGENTS' | 'DEPARTMENTS'>('EMPLOYEES');
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Add/Edit User Modal
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<RoleName>('EMPLOYEE');
  const [formDeptId, setFormDeptId] = useState<number>(1);
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAvailability, setFormAvailability] = useState<'AVAILABLE' | 'BUSY' | 'OFFLINE'>(
    'AVAILABLE'
  );
  const [formMaxTickets, setFormMaxTickets] = useState<number>(10);

  // Add Department Modal
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptManager, setDeptManager] = useState('');
  const [deptDesc, setDeptDesc] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, dRes] = await Promise.all([
        apiClient.get('/users', { params: { search } }),
        apiClient.get('/departments'),
      ]);
      setUsers(uRes.data.data || []);
      setDepartments(dRes.data.data || []);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = (defaultRole: RoleName) => {
    setEditingUser(null);
    setFormFullName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole(defaultRole);
    setFormDeptId(departments[0]?.id || 1);
    setFormJobTitle('');
    setFormPhone('');
    setFormAvailability('AVAILABLE');
    setFormMaxTickets(defaultRole === 'SUPPORT_AGENT' ? 12 : 0);
    setUserModalOpen(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setFormFullName(u.fullName);
    setFormEmail(u.email);
    setFormPassword('');
    setFormRole(u.role);
    setFormDeptId(u.departmentId);
    setFormJobTitle(u.jobTitle);
    setFormPhone(u.phone);
    setFormAvailability(u.availabilityStatus);
    setFormMaxTickets(u.maxConcurrentTickets || 10);
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      if (editingUser) {
        await apiClient.put(`/users/${editingUser.id}`, {
          fullName: formFullName,
          role: formRole,
          departmentId: formDeptId,
          jobTitle: formJobTitle,
          phone: formPhone,
          availabilityStatus: formAvailability,
          maxConcurrentTickets: formMaxTickets,
        });
        setFeedback(`Updated user ${formFullName}.`);
      } else {
        await apiClient.post('/users', {
          fullName: formFullName,
          email: formEmail,
          password: formPassword || 'Enterprise@2026',
          role: formRole,
          departmentId: formDeptId,
          jobTitle: formJobTitle,
          phone: formPhone,
          availabilityStatus: formAvailability,
          maxConcurrentTickets: formMaxTickets,
        });
        setFeedback(`Created user ${formFullName}.`);
      }
      setUserModalOpen(false);
      await loadData();
    } catch (err) {
      setFeedback(extractApiError(err));
    }
  };

  const handleToggleActive = async (u: User) => {
    try {
      await apiClient.patch(`/users/${u.id}/status`, { active: !u.active });
      setFeedback(`${u.fullName} is now ${!u.active ? 'active' : 'deactivated'}.`);
      await loadData();
    } catch (err) {
      setFeedback(extractApiError(err));
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/departments', {
        name: deptName,
        code: deptCode,
        managerName: deptManager,
        description: deptDesc,
      });
      setDeptModalOpen(false);
      setDeptName('');
      setDeptCode('');
      setDeptManager('');
      setDeptDesc('');
      setFeedback(`Department ${deptName} added.`);
      await loadData();
    } catch (err) {
      setFeedback(extractApiError(err));
    }
  };

  const employeeList = users.filter((u) => u.role === 'EMPLOYEE');
  const agentList = users.filter((u) => u.role === 'SUPPORT_AGENT' || u.role === 'ADMIN');

  return (
    <AppShell
      breadcrumb="Administration / Employees, Support Agents & Departments"
      primaryAction={{
        label: tab === 'DEPARTMENTS' ? 'Add Department' : tab === 'AGENTS' ? 'Add Agent' : 'Add Employee',
        onClick: () =>
          tab === 'DEPARTMENTS'
            ? setDeptModalOpen(true)
            : openCreateModal(tab === 'AGENTS' ? 'SUPPORT_AGENT' : 'EMPLOYEE'),
      }}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            onClick={() => setTab('EMPLOYEES')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === 'EMPLOYEES' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Employee Directory ({employeeList.length})
          </button>
          <button
            onClick={() => setTab('AGENTS')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === 'AGENTS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Support Agents & Admins ({agentList.length})
          </button>
          <button
            onClick={() => setTab('DEPARTMENTS')}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === 'DEPARTMENTS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Departments ({departments.length})
          </button>
        </div>

        {tab !== 'DEPARTMENTS' && (
          <div className="relative w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search directory..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        )}
      </div>

      {feedback && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
          {feedback}
        </div>
      )}

      {tab !== 'DEPARTMENTS' ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading directory...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Name & Email</th>
                    <th className="py-2.5 px-4">Role & Title</th>
                    <th className="py-2.5 px-4">Department</th>
                    {tab === 'AGENTS' && <th className="py-2.5 px-4">Availability & Load</th>}
                    <th className="py-2.5 px-4">Account Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {(tab === 'EMPLOYEES' ? employeeList : agentList).map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{u.fullName}</p>
                        <p className="text-xs font-mono text-slate-500">{u.email}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-xs font-medium text-slate-800">{u.role}</p>
                        <p className="text-xs text-slate-500">{u.jobTitle}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">{u.departmentName}</td>
                      {tab === 'AGENTS' && (
                        <td className="py-3 px-4 text-xs">
                          <p className="font-medium text-slate-800">{u.availabilityStatus}</p>
                          <p className="font-mono text-slate-500 tabular-nums">
                            {u.activeAssignedCount} / {u.maxConcurrentTickets || 12} tickets
                          </p>
                        </td>
                      )}
                      <td className="py-3 px-4 text-xs">
                        <span
                          className={`inline-block px-2 py-0.5 rounded border font-medium ${
                            u.active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {u.active ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => openEditModal(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded text-slate-700 hover:bg-slate-100"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border rounded ${
                            u.active
                              ? 'border-red-200 text-red-700 hover:bg-red-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((d) => (
            <div key={d.id} className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-blue-700">{d.code}</span>
                <Building2 className="w-4 h-4 text-slate-400" />
              </div>
              <h3 className="font-display text-base font-semibold text-slate-900">{d.name}</h3>
              <p className="text-xs text-slate-600">{d.description || 'Enterprise business unit'}</p>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Lead: {d.managerName}</span>
                <span className="font-mono tabular-nums">
                  {d.memberCount ?? 0} users · {d.openTicketCount ?? 0} open
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* User Add/Edit Modal */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveUser}
            className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-700" />
              <h3 className="font-display text-base font-semibold text-slate-900">
                {editingUser ? `Edit ${editingUser.fullName}` : 'Add Directory Account'}
              </h3>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  disabled={Boolean(editingUser)}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-100"
                  required
                />
              </div>
            </div>

            {!editingUser && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Initial Password (optional, defaults to Enterprise@2026)
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as RoleName)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="SUPPORT_AGENT">Support Agent</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
                <select
                  value={formDeptId}
                  onChange={(e) => setFormDeptId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={formJobTitle}
                  onChange={(e) => setFormJobTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
            </div>

            {formRole !== 'EMPLOYEE' && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Availability
                  </label>
                  <select
                    value={formAvailability}
                    onChange={(e) =>
                      setFormAvailability(e.target.value as 'AVAILABLE' | 'BUSY' | 'OFFLINE')
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="BUSY">Busy</option>
                    <option value="OFFLINE">Offline</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Max Concurrent Tickets
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={formMaxTickets}
                    onChange={(e) => setFormMaxTickets(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-md text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800"
              >
                {editingUser ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Department Modal */}
      {deptModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateDepartment}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-700" />
              <h3 className="font-display text-base font-semibold text-slate-900">
                Create Department
              </h3>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Department Name
              </label>
              <input
                type="text"
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Code</label>
                <input
                  type="text"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  placeholder="SEC-OPS"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Manager</label>
                <input
                  type="text"
                  value={deptManager}
                  onChange={(e) => setDeptManager(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={deptDesc}
                onChange={(e) => setDeptDesc(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeptModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-md text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800"
              >
                Create Department
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
};
