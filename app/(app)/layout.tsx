'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, LogOut } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase';
import { DataProvider, useAuth } from '@/components/providers';
import { AppShell } from '@/components/app-shell';
import { AuthShell, SetupRequired } from '@/components/auth-shell';
import { BrandMark, Spinner } from '@/components/common';

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <BrandMark size={48} />
      <Spinner className="h-5 w-5 text-brand-navy" />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, profile, loading, signOut } = useAuth();

  useEffect(() => {
    if (isSupabaseConfigured && !loading && !session) router.replace('/login');
  }, [loading, session, router]);

  if (!isSupabaseConfigured) return <SetupRequired kind="env" />;
  if (loading || !session) return <Splash />;
  if (!profile) return <SetupRequired kind="schema" />;

  if (!profile.active) {
    return (
      <AuthShell>
        <div className="card-surface p-7 text-center">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-orange/10 text-brand-orange-dark"><Clock size={22} /></span>
          <h2 className="text-xl font-semibold text-brand-ink">Waiting for approval</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your account <b>{profile.email}</b> has been created. An administrator needs to activate it before you can see company billing data.
          </p>
          <div className="mt-6 grid gap-2">
            <button onClick={() => window.location.reload()} className="h-11 rounded-xl bg-brand-navy text-sm font-semibold text-white hover:bg-brand-navy-2">Check again</button>
            <button onClick={async () => { await signOut(); router.replace('/login'); }} className="flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100"><LogOut size={15} /> Sign out</button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <DataProvider>
      <AppShell>{children}</AppShell>
    </DataProvider>
  );
}
