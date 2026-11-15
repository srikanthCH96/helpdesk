import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiClient, extractApiError } from '../services/api';
import { Department } from '../types';

type AuthMode = 'LOGIN' | 'REGISTER' | 'FORGOT' | 'RESET' | 'RESET_SUCCESS';

function computePasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score === 2) return { score, label: 'Fair', color: 'bg-amber-500' };
  if (score === 3) return { score, label: 'Good', color: 'bg-blue-600' };
  return { score, label: 'Strong', color: 'bg-emerald-600' };
}

export const AuthPage: React.FC = () => {
  const { login, register, user } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<AuthMode>('LOGIN');
  const [departments, setDepartments] = useState<Department[]>([]);

  // Shared & Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Registration fields
  const [fullName, setFullName] = useState('');
  const [departmentId, setDepartmentId] = useState<number>(1);
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');

  // Reset Password fields
  const [resetToken, setResetToken] = useState('');
  const [previewResetToken, setPreviewResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      if (user.role === 'ADMIN') navigate('/admin/dashboard', { replace: true });
      else if (user.role === 'SUPPORT_AGENT') navigate('/agent/dashboard', { replace: true });
      else navigate('/employee/dashboard', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    apiClient
      .get('/departments')
      .then((res) => {
        const list = res.data.data || [];
        setDepartments(list);
        if (list.length > 0) setDepartmentId(list[0].id);
      })
      .catch(() => {});
  }, []);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setInfoMessage(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }
    setSubmitting(true);
    try {
      const logged = await login(email.trim(), password);
      if (logged.role === 'ADMIN') navigate('/admin/dashboard');
      else if (logged.role === 'SUPPORT_AGENT') navigate('/agent/dashboard');
      else navigate('/employee/dashboard');
    } catch (err) {
      setError(extractApiError(err, 'Invalid credentials.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Full name, corporate email, and password are required.');
      return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be at least 8 characters and include uppercase letters and numbers.');
      return;
    }
    setSubmitting(true);
    try {
      await register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        departmentId,
        jobTitle: jobTitle.trim() || 'Employee',
        phone: phone.trim(),
      });
      navigate('/employee/dashboard');
    } catch (err) {
      setError(extractApiError(err, 'Registration failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Please enter your registered corporate email.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post('/auth/forgot-password', { email: email.trim() });
      const token = res.data?.data?.previewResetToken;
      setPreviewResetToken(token || null);
      if (token) setResetToken(token);
      setInfoMessage(res.data.message);
      setMode('RESET');
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!resetToken.trim() || !newPassword) {
      setError('Reset token and new password are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/auth/reset-password', {
        token: resetToken.trim(),
        newPassword,
      });
      setMode('RESET_SUCCESS');
    } catch (err) {
      setError(extractApiError(err, 'Failed to reset password.'));
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemoAccount = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Enterprise@2026');
    setError(null);
  };

  const strength = computePasswordStrength(mode === 'RESET' ? newPassword : password);

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-slate-50">
      {/* Left Architectural Panel */}
      <div className="hidden lg:flex lg:col-span-5 relative bg-slate-900 text-white flex-col justify-between overflow-hidden">
        <img
          src="/src/assets/images/auth_enterprise_desk_1794745676586.jpg"
          alt="Enterprise IT Service Operations Center"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/65 to-slate-900/40" />

        <div className="relative z-10 p-10">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
            <span className="font-display text-lg font-semibold tracking-tight">
              HelpDesk Pro Enterprise Suite
            </span>
          </div>
        </div>

        <div className="relative z-10 p-10 space-y-6">
          <h2 className="font-display text-3xl font-semibold leading-tight text-balance">
            Enterprise IT Service Management built for accountable SLAs.
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed max-w-md">
            Unified incident triage, automated priority escalation, role-based access governance,
            and audit-ready compliance reporting across every business unit.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/15">
            <div>
              <p className="font-mono text-lg font-semibold tabular-nums">15m</p>
              <p className="text-xs text-slate-300">P1 Response Target</p>
            </div>
            <div>
              <p className="font-mono text-lg font-semibold tabular-nums">3 Roles</p>
              <p className="text-xs text-slate-300">Enforced RBAC</p>
            </div>
            <div>
              <p className="font-mono text-lg font-semibold tabular-nums">100%</p>
              <p className="text-xs text-slate-300">Audit Trail</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="lg:col-span-7 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-8">
          <div className="flex items-center gap-2 lg:hidden mb-6">
            <ShieldCheck className="w-5 h-5 text-blue-700" />
            <span className="font-display font-semibold text-base text-slate-900">
              HelpDesk Pro Enterprise
            </span>
          </div>

          {mode === 'LOGIN' && (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl font-semibold text-slate-900">Sign in</h1>
                <p className="text-sm text-slate-500 mt-1">
                  Access your employee portal, agent workspace, or admin console.
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Corporate Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@helpdeskpro.io"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-700">Password</label>
                    <button
                      type="button"
                      onClick={() => switchMode('FORGOT')}
                      className="text-xs font-medium text-blue-700 hover:text-blue-800"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full px-3 py-2 pr-10 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Sign In</span>
                </button>
              </form>

              {/* Quick Demo Role Selector for Testing */}
              <div className="mt-6 pt-5 border-t border-slate-200">
                <p className="text-xs font-medium text-slate-500 mb-2.5">
                  Demo Accounts (Password: <span className="font-mono">Enterprise@2026</span>)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('employee@helpdeskpro.io')}
                    className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors"
                  >
                    Employee
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('agent@helpdeskpro.io')}
                    className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors"
                  >
                    Support Agent
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('admin@helpdeskpro.io')}
                    className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors"
                  >
                    Administrator
                  </button>
                </div>
              </div>

              <p className="mt-6 text-center text-xs text-slate-600">
                New employee?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('REGISTER')}
                  className="font-semibold text-blue-700 hover:text-blue-800"
                >
                  Create an employee account
                </button>
              </p>
            </>
          )}

          {mode === 'REGISTER' && (
            <>
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => switchMode('LOGIN')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 mb-3"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to sign in
                </button>
                <h1 className="font-display text-2xl font-semibold text-slate-900">
                  Employee Registration
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  Register your corporate identity to submit and track IT service requests.
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jordan Taylor"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Corporate Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jordan.taylor@helpdeskpro.io"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
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
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Job Title
                    </label>
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="Product Analyst"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (415) 555-0180"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 chars, mixed case + number"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                  {password && (
                    <div className="mt-2">
                      <div className="flex gap-1 h-1.5">
                        {[1, 2, 3, 4].map((step) => (
                          <div
                            key={step}
                            className={`flex-1 rounded-sm ${
                              strength.score >= step ? strength.color : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Strength: <span className="font-medium text-slate-700">{strength.label}</span>
                      </p>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Create Account</span>
                </button>
              </form>
            </>
          )}

          {mode === 'FORGOT' && (
            <>
              <button
                type="button"
                onClick={() => switchMode('LOGIN')}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 mb-4"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </button>
              <h1 className="font-display text-2xl font-semibold text-slate-900">
                Forgot Password
              </h1>
              <p className="text-sm text-slate-500 mt-1 mb-5">
                Enter your corporate email to generate a secure single-use reset token.
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Corporate Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@helpdeskpro.io"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Request Reset Link</span>
                </button>
              </form>
            </>
          )}

          {mode === 'RESET' && (
            <>
              <button
                type="button"
                onClick={() => switchMode('LOGIN')}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 mb-4"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </button>
              <h1 className="font-display text-2xl font-semibold text-slate-900">
                Reset Password
              </h1>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                Enter your reset token and choose a strong new password.
              </p>

              {infoMessage && (
                <div className="mb-3 p-3 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-800">
                  {infoMessage}
                  {previewResetToken && (
                    <div className="mt-1.5 font-mono text-[11px] break-all">
                      Preview Token: {previewResetToken}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="mb-3 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Reset Token
                  </label>
                  <input
                    type="text"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                  {newPassword && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 flex gap-1 h-1.5">
                        {[1, 2, 3, 4].map((step) => (
                          <div
                            key={step}
                            className={`flex-1 rounded-sm ${
                              strength.score >= step ? strength.color : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] text-slate-600">{strength.label}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50"
                >
                  {submitting ? 'Updating Password...' : 'Update Password'}
                </button>
              </form>
            </>
          )}

          {mode === 'RESET_SUCCESS' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-700">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h1 className="font-display text-xl font-semibold text-slate-900">
                Password Reset Complete
              </h1>
              <p className="text-sm text-slate-600">
                Your credentials have been updated. You may now sign in with your new password.
              </p>
              <button
                type="button"
                onClick={() => switchMode('LOGIN')}
                className="w-full py-2.5 px-4 text-sm font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800"
              >
                Return to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
