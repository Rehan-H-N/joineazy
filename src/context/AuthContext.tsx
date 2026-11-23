import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../types/api';
import type { UserRole } from '../shared/rules';

interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  age: number;
  role: UserRole;
  department: string;
  studentId?: string;
  facultyId?: string;
  officeRoom?: string;
}

interface RealtimeEventPayload {
  type: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  wsConnected: boolean;
  onlineCount: number;
  realtimeTick: number;
  lastEventType: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  loginDemo: (role: UserRole) => Promise<void>;
  logout: () => void;
  authFetch: <T = unknown>(url: string, init?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Keep JWT strictly in React memory (never localStorage or sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [realtimeTick, setRealtimeTick] = useState(0);
  const [lastEventType, setLastEventType] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setWsConnected(false);
    setOnlineCount(0);
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const authFetch = useCallback(
    async <T = unknown>(url: string, init: RequestInit = {}): Promise<T> => {
      const headers = new Headers(init.headers);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const response = await fetch(url, { ...init, headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && token) {
          logout();
        }
        throw new Error(typeof data.error === 'string' ? data.error : `Request failed (${response.status})`);
      }
      return data as T;
    },
    [token, logout]
  );

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Unable to sign in.');
    }
    setToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Unable to create account.');
    }
    setToken(data.token);
    setUser(data.user);
  }, []);

  const loginDemo = useCallback(async (role: UserRole) => {
    const res = await fetch('/api/auth/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Demo login failed.');
    }
    setToken(data.token);
    setUser(data.user);
  }, []);

  // Real-time WebSocket connection for live group collaboration & professor dashboard updates
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!cancelled) setWsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as RealtimeEventPayload;
          if (parsed.type === 'connected' || parsed.type === 'presence:update') {
            const list = (parsed as unknown as { onlineUsers?: unknown[]; payload?: { onlineUsers?: unknown[] } })
              .onlineUsers || parsed.payload?.onlineUsers;
            if (Array.isArray(list)) {
              setOnlineCount(list.length);
            }
          }
          if (
            parsed.type === 'assignment:updated' ||
            parsed.type === 'group:updated' ||
            parsed.type === 'submission:updated' ||
            parsed.type === 'grade:updated'
          ) {
            setLastEventType(parsed.type);
            setRealtimeTick((n) => n + 1);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setWsConnected(false);
        reconnectTimerRef.current = window.setTimeout(connect, 2500);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        wsConnected,
        onlineCount,
        realtimeTick,
        lastEventType,
        login,
        register,
        loginDemo,
        logout,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
