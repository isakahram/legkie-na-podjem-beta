import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { UserDto } from '../types';

interface AuthState {
  user: UserDto | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  isDemo: boolean;
  /** Разрешены ли изменения данных: демо-роль работает только на чтение. */
  canMutate: boolean;
  login: (email: string, password: string) => Promise<void>;
  startDemo: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: UserDto) => void;
}

const SpecialistAuthContext = createContext<AuthState | null>(null);

export function SpecialistAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');

  const refresh = useCallback(async () => {
    try {
      const response = await api.v1.me();
      setUser(response.user);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.v1.login({ email, password });
    setUser(response.user);
    setStatus('authenticated');
  }, []);

  const startDemo = useCallback(async () => {
    const response = await api.v1.startDemoSession();
    setUser(response.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.v1.logout();
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo<AuthState>(() => {
    const isDemo = user?.role === 'demo_specialist';
    return {
      user,
      status,
      isDemo,
      canMutate: status === 'authenticated' && !isDemo,
      login,
      startDemo,
      logout,
      refresh,
      setUser,
    };
  }, [login, logout, refresh, startDemo, status, user]);

  return <SpecialistAuthContext.Provider value={value}>{children}</SpecialistAuthContext.Provider>;
}

export function useSpecialistAuth(): AuthState {
  const context = useContext(SpecialistAuthContext);
  if (!context) throw new Error('useSpecialistAuth используется вне SpecialistAuthProvider');
  return context;
}

/** Имя специалиста для шапки: профиль, иначе email. */
export function specialistName(user: UserDto | null): string {
  if (!user) return '';
  return user.displayName?.trim() || user.email.split('@')[0];
}

/** Инициалы для аватара в шапке. */
export function specialistInitials(user: UserDto | null): string {
  const name = specialistName(user);
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '—';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}
