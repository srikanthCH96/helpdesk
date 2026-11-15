import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, clearStoredTokens, getStoredToken, setStoredTokens } from '../services/api';
import { NotificationItem, User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: {
    fullName: string;
    email: string;
    password: string;
    departmentId: number;
    jobTitle: string;
    phone: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: number) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshNotifications = useCallback(async () => {
    if (!getStoredToken()) return;
    try {
      const res = await apiClient.get('/notifications');
      setNotifications(res.data.data.items || []);
      setUnreadCount(res.data.data.unreadCount || 0);
    } catch {
      // Ignore background notification fetch failures
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiClient
      .get('/auth/me')
      .then((res) => {
        setUser(res.data.data);
        refreshNotifications();
      })
      .catch(() => {
        clearStoredTokens();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [refreshNotifications]);

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(refreshNotifications, 25_000);
    return () => clearInterval(timer);
  }, [user, refreshNotifications]);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await apiClient.post('/auth/login', { email, password });
    const { accessToken, refreshToken, user: loggedUser } = res.data.data;
    setStoredTokens(accessToken, refreshToken);
    setUser(loggedUser);
    await refreshNotifications();
    return loggedUser;
  };

  const register = async (payload: {
    fullName: string;
    email: string;
    password: string;
    departmentId: number;
    jobTitle: string;
    phone: string;
  }): Promise<User> => {
    const res = await apiClient.post('/auth/register', payload);
    const { accessToken, refreshToken, user: createdUser } = res.data.data;
    setStoredTokens(accessToken, refreshToken);
    setUser(createdUser);
    await refreshNotifications();
    return createdUser;
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      clearStoredTokens();
      setUser(null);
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  const markNotificationRead = async (id: number) => {
    await apiClient.patch(`/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllNotificationsRead = async () => {
    await apiClient.patch('/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        notifications,
        unreadCount,
        login,
        register,
        logout,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
