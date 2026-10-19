import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, json, setCsrfToken } from './api';
import type { User } from './types';

interface AuthValue { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; }
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<{ user: User; csrfToken: string }>('/auth/me').then(data => { setUser(data.user); setCsrfToken(data.csrfToken); }).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);
  const value = useMemo<AuthValue>(() => ({
    user, loading,
    async login(email, password) {
      const data = await api<{ user: User; csrfToken: string }>('/auth/login', json('POST', { email, password }));
      setCsrfToken(data.csrfToken); setUser(data.user);
    },
    async logout() { try { await api('/auth/logout', json('POST', {})); } finally { setCsrfToken(''); setUser(null); } },
  }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider is missing.'); return value; }
