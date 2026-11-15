'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { friendlyError, loaders, type CollectionKey } from '@/lib/data';
import type { CatalogItem, CompanySettings, Customer, Expense, Invoice, Payment, Profile, Project, Quotation } from '@/lib/types';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (active) setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // Defer Supabase calls out of the auth callback (avoids the client's auth-lock deadlock).
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(() => { void loadProfile(next); }, 0);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    loading,
    isAdmin: Boolean(profile?.active && profile.role === 'admin'),
    refreshProfile: () => loadProfile(session),
    signOut: async () => { await supabase.auth.signOut(); setProfile(null); },
  }), [session, profile, loading, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

// ---------------------------------------------------------------------------
// Workspace data
// ---------------------------------------------------------------------------

type Collections = {
  settings: CompanySettings;
  customers: Customer[];
  projects: Project[];
  invoices: Invoice[];
  quotations: Quotation[];
  payments: Payment[];
  expenses: Expense[];
  catalog: CatalogItem[];
  profiles: Profile[];
};

type DataContextValue = Collections & {
  loading: boolean;
  error: string | null;
  refresh: (...keys: CollectionKey[]) => Promise<void>;
  customerById: Map<string, Customer>;
  projectById: Map<string, Project>;
  invoiceById: Map<string, Invoice>;
};

const DataContext = createContext<DataContextValue | null>(null);

const TABLE_TO_KEYS: Record<string, CollectionKey[]> = {
  company_settings: ['settings'],
  customers: ['customers'],
  projects: ['projects'],
  invoices: ['invoices'],
  quotations: ['quotations'],
  payments: ['payments', 'invoices'],
  expenses: ['expenses'],
  catalog_items: ['catalog'],
};

const EMPTY: Collections = {
  settings: DEFAULT_SETTINGS, customers: [], projects: [], invoices: [], quotations: [], payments: [], expenses: [], catalog: [], profiles: [],
};

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Collections>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(new Set<CollectionKey>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (...keys: CollectionKey[]) => {
    const list = keys.length ? Array.from(new Set(keys)) : (Object.keys(loaders) as CollectionKey[]);
    try {
      const results = await Promise.all(list.map((k) => loaders[k]()));
      setData((prev) => {
        const next = { ...prev } as Record<string, unknown>;
        list.forEach((k, i) => { next[k] = results[i]; });
        return next as Collections;
      });
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    refresh().finally(() => { if (mounted) setLoading(false); });

    const channel = supabase.channel('workspace-changes');
    Object.keys(TABLE_TO_KEYS).forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        TABLE_TO_KEYS[table].forEach((k) => pending.current.add(k));
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const keys = Array.from(pending.current);
          pending.current.clear();
          void refresh(...keys);
        }, 500);
      });
    });
    channel.subscribe();

    const onFocus = () => { if (document.visibilityState === 'visible') void refresh('invoices', 'payments'); };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onFocus);
      void supabase.removeChannel(channel);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  const value = useMemo<DataContextValue>(() => ({
    ...data,
    loading,
    error,
    refresh,
    customerById: new Map(data.customers.map((c) => [c.id, c])),
    projectById: new Map(data.projects.map((p) => [p.id, p])),
    invoiceById: new Map(data.invoices.map((i) => [i.id, i])),
  }), [data, loading, error, refresh]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
};
