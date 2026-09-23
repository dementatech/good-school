'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

import { endSession, loadIdentity } from '@/lib/auth/identity';
import { useRealtimeSocket } from '@/lib/realtime/useRealtimeSocket';
import { playMessageSound, playNotificationSound } from '@/lib/realtime/sound';

export interface User {
  id: string;
  staffId: string;
  name: string;
  /** Always sent by /api/auth/login and /api/auth/me; optional only because
      older callers construct a User without it. */
  email?: string;
  role: string;
  school: string;
  logoUrl?: string | null;
  schoolId?: string | null;
  className?: string | null;
  /** Only ever set for a teacher right now — see backend's `/me` route. */
  photoUrl?: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  mustChangePassword: boolean;
  login: (user: User & { mustChangePassword?: boolean }) => void;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  const lastCheckRef = useRef(0);

  // In a browser the session lives server-side (real Supabase Auth cookies, set
  // by /api/auth/login) and this rehydrates React state from it on load. In
  // TERECO Collect there is no network to ask, so the identity comes from the
  // local database instead — see lib/auth/identity.ts.
  //
  // `loadIdentity` has its own timeout, so this always settles: a stalled
  // request resolves to signed-out and PortalGate sends the visitor to /auth.
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const { user: nextUser, mustChangePassword: mustChange } = await loadIdentity(signal);
      if (signal?.aborted) return;
      lastCheckRef.current = Date.now();
      setUser(nextUser);
      setIsAuthenticated(nextUser !== null);
      setMustChangePassword(mustChange);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Kicked off asynchronously so no state is set synchronously in the effect
    // body — `loading` already starts true and is cleared when the request
    // settles.
    void (async () => {
      if (!controller.signal.aborted) await refresh(controller.signal);
    })();
    return () => controller.abort();
  }, [refresh]);

  // Re-check the session whenever the tab comes back to the foreground or is
  // restored from the bfcache. A backgrounded tab drops its connection to the
  // server; on resume the in-flight `/me` (if any) can be dead, so without this
  // a stuck loader never clears itself, and a session that expired while away
  // keeps rendering the portal shell until the next navigation. This does NOT
  // set `loading`, so a healthy session revalidates silently in the background.
  useEffect(() => {
    const REVALIDATE_AFTER_MS = 10_000;
    const maybeRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheckRef.current < REVALIDATE_AFTER_MS) return;
      void refresh();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void refresh();
    };
    document.addEventListener('visibilitychange', maybeRefresh);
    window.addEventListener('focus', maybeRefresh);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh);
      window.removeEventListener('focus', maybeRefresh);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [refresh]);

  const login = (loggedInUser: User & { mustChangePassword?: boolean }) => {
    lastCheckRef.current = Date.now();
    setUser(loggedInUser);
    setIsAuthenticated(true);
    setMustChangePassword(!!loggedInUser.mustChangePassword);
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    setMustChangePassword(false);
    void endSession();
  };

  // One socket, mounted exactly once for the whole app (AuthProvider wraps
  // everything) — deliberately not left to NotificationBell or the
  // per-page hooks below, since a portal renders more than one of those at
  // once (desktop + mobile bell) and each holds its own connection; playing
  // a sound from every one of them would double it up.
  //
  // Also where a super_admin disabling this account or suspending its
  // school actually kicks an open tab out immediately, instead of leaving
  // it signed in until the next click happens to hit a 401 — see
  // backend/src/modules/admin/api/routes.ts and
  // backend/src/modules/schools/api/routes.ts for where that gets pushed.
  useRealtimeSocket((event) => {
    if (event.type === 'force_signout') logout();
    else if (event.type === 'message') playMessageSound();
    else if (event.type === 'notification') playNotificationSound();
  }, isAuthenticated);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, mustChangePassword, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
