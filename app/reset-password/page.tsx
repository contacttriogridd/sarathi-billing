'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { AuthShell, SetupRequired } from '@/components/auth-shell';
import { Field, Spinner, TextInput } from '@/components/common';
import { friendlyError } from '@/lib/data';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data: d }) => { if (d.session) setReady(true); });
    const t = setTimeout(() => setReady((r) => r), 4000);
    return () => { data.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  if (!isSupabaseConfigured) return <SetupRequired kind="env" />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    toast.success('Password updated');
    router.replace('/');
  };

  return (
    <AuthShell>
      <div className="card-surface p-6 sm:p-8">
        <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-brand-navy/5 text-brand-navy"><KeyRound size={20} /></span>
        <h2 className="text-[24px] font-semibold tracking-tight text-brand-ink">Choose a new password</h2>
        {!ready ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Verifying your reset link… If nothing happens, request a new link.</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="New password"><TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required /></Field>
            <Field label="Confirm password"><TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></Field>
            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-navy text-sm font-semibold text-white transition hover:bg-brand-navy-2 disabled:opacity-60">{busy && <Spinner />}Update password</button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
