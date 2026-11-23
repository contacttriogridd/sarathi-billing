'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { LABOUR_OUTDATED_MESSAGE, LABOUR_SETUP_MESSAGE, friendlyError, isMissingLabourSchema, loaders, type CollectionKey } from '@/lib/data';
import { wageMismatch } from '@/lib/labour';
import type { Attendance, CatalogItem, CompanySettings, Customer, Expense, Invoice, Labourer, LabourPayment, Payment, Profile, Project, Quotation } from '@/lib/types';

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
  labourers: Labourer[];
  attendance: Attendance[];
  labourPayments: LabourPayment[];
};

type DataContextValue = Collections & {
  loading: boolean;
  error: string | null;
  refresh: (...keys: CollectionKey[]) => Promise<void>;
  customerById: Map<string, Customer>;
  projectById: Map<string, Project>;
  invoiceById: Map<string, Invoice>;
  labourerById: Map<string, Labourer>;
  attendanceById: Map<string, Attendance>;
  /** false until the labour database updates have been run, or while its wage calculation is out of date */
  labourReady: boolean;
  /** what to do when labourReady is false */
  labourIssue: string | null;
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

// Subscribed on their own channel so a database without the labour update keeps live updates for everything else.
const LABOUR_TABLE_TO_KEYS: Record<string, CollectionKey[]> = {
  labourers: ['labourers'],
  labour_attendance: ['attendance', 'expenses'],
  labour_payments: ['labourPayments'],
};
const LABOUR_KEYS: CollectionKey[] = ['labourers', 'attendance', 'labourPayments'];

const EMPTY: Collections = {
  settings: DEFAULT_SETTINGS, customers: [], projects: [], invoices: [], quotations: [], payments: [], expenses: [], catalog: [], profiles: [],
  labourers: [], attendance: [], labourPayments: [],
};

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Collections>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labourReady, setLabourReady] = useState(true);
  const pending = useRef(new Set<CollectionKey>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (...keys: CollectionKey[]) => {
    const list = keys.length ? Array.from(new Set(keys)) : (Object.keys(loaders) as CollectionKey[]);
    // Each collection loads independently, so one failing table never blanks the whole workspace.
    const results = await Promise.allSettled(list.map((k) => loaders[k]()));
    setData((prev) => {
      const next = { ...prev } as Record<string, unknown>;
      list.forEach((k, i) => { const r = results[i]; if (r.status === 'fulfilled') next[k] = r.value; });
      return next as Collections;
    });
    const failures = results.map((r, i) => ({ key: list[i], r })).filter((x): x is { key: CollectionKey; r: PromiseRejectedResult } => x.r.status === 'rejected');
    const labourMissing = failures.some((f) => isMissingLabourSchema(f.r.reason));
    if (labourMissing) setLabourReady(false);
    else if (list.some((k) => LABOUR_KEYS.includes(k)) && !failures.some((f) => LABOUR_KEYS.includes(f.key))) setLabourReady(true);
    // a missing labour update is reported on the labour pages, not as a workspace-wide error
    const blocking = failures.find((f) => !isMissingLabourSchema(f.r.reason));
    setError(blocking ? friendlyError(blocking.r.reason) : null);
  }, []);

  useEffect(() => {
    let mounted = true;
    refresh().finally(() => { if (mounted) setLoading(false); });

    const queue = (keys: CollectionKey[]) => {
      keys.forEach((k) => pending.current.add(k));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const next = Array.from(pending.current);
        pending.current.clear();
        void refresh(...next);
      }, 500);
    };
    const subscribe = (name: string, tables: Record<string, CollectionKey[]>) => {
      const ch = supabase.channel(name);
      Object.keys(tables).forEach((table) => {
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => queue(tables[table]));
      });
      ch.subscribe();
      return ch;
    };
    const channel = subscribe('workspace-changes', TABLE_TO_KEYS);
    const labourChannel = subscribe('labour-changes', LABOUR_TABLE_TO_KEYS);

    const onFocus = () => { if (document.visibilityState === 'visible') void refresh('invoices', 'payments'); };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onFocus);
      void supabase.removeChannel(channel);
      void supabase.removeChannel(labourChannel);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  // wages are computed by the database; any day that isn't shifts × rate means its wage functions are outdated
  const wagesOutdated = useMemo(() => data.attendance.some(wageMismatch), [data.attendance]);

  const value = useMemo<DataContextValue>(() => ({
    ...data,
    loading,
    error,
    refresh,
    customerById: new Map(data.customers.map((c) => [c.id, c])),
    projectById: new Map(data.projects.map((p) => [p.id, p])),
    invoiceById: new Map(data.invoices.map((i) => [i.id, i])),
    labourerById: new Map(data.labourers.map((l) => [l.id, l])),
    attendanceById: new Map(data.attendance.map((a) => [a.id, a])),
    labourReady: labourReady && !wagesOutdated,
    labourIssue: !labourReady ? LABOUR_SETUP_MESSAGE : wagesOutdated ? LABOUR_OUTDATED_MESSAGE : null,
  }), [data, loading, error, refresh, labourReady, wagesOutdated]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
};
