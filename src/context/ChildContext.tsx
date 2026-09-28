import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api';
import type { CalibrationProfile, ChildProfile, SessionRecord } from '../types';

interface ChildContextValue {
  child: ChildProfile | null;
  calibration: CalibrationProfile | null;
  lastSession: SessionRecord | null;
  setChild: (child: ChildProfile | null) => void;
  setCalibration: (profile: CalibrationProfile | null) => void;
  setLastSession: (session: SessionRecord | null) => void;
  refreshChild: () => Promise<void>;
  logout: () => void;
}

const storageKey = 'legkie-child';
const readChild = (): ChildProfile | null => {
  try {
    const value = sessionStorage.getItem(storageKey);
    return value ? (JSON.parse(value) as ChildProfile) : null;
  } catch {
    return null;
  }
};

const ChildContext = createContext<ChildContextValue | null>(null);

export function ChildProvider({ children }: { children: ReactNode }) {
  const [child, updateChild] = useState<ChildProfile | null>(readChild);
  const [calibration, setCalibration] = useState<CalibrationProfile | null>(null);
  const [lastSession, setLastSession] = useState<SessionRecord | null>(null);

  const setChild = useCallback((next: ChildProfile | null) => {
    updateChild(next);
    if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
    else sessionStorage.removeItem(storageKey);
  }, []);

  const refreshChild = useCallback(async () => {
    if (!child) return;
    setChild(await api.getChild(child.id));
  }, [child, setChild]);

  const logout = useCallback(() => {
    setChild(null);
    setCalibration(null);
    setLastSession(null);
  }, [setChild]);

  const value = useMemo(
    () => ({
      child,
      calibration,
      lastSession,
      setChild,
      setCalibration,
      setLastSession,
      refreshChild,
      logout,
    }),
    [child, calibration, lastSession, setChild, refreshChild, logout],
  );

  return <ChildContext.Provider value={value}>{children}</ChildContext.Provider>;
}

export function useChild(): ChildContextValue {
  const context = useContext(ChildContext);
  if (!context) throw new Error('useChild должен использоваться внутри ChildProvider');
  return context;
}
