'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { AuthShell, SetupRequired } from '@/components/auth-shell';
import { Field, Spinner, TextInput } from '@/components/common';
import { friendlyError } from '@/lib/data';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!isSupabaseConfigured) return <SetupRequired kind="env" />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (err) setError(friendlyError(err));
    else setSent(true);
  };

  return (
    <AuthShell>
      <div className="card-surface p-6 sm:p-8">
        {sent ? (
          <div className="text-center">
            <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><MailCheck size={22} /></span>
            <h2 className="text-xl font-semibold text-brand-ink">Check your inbox</h2>
            <p className="mt-2 text-sm text-muted-foreground">If an account exists for <b>{email}</b>, we&apos;ve sent a link to reset the password. The link expires in one hour.</p>
          </div>
        ) : (
          <>
            <h2 className="text-[24px] font-semibold tracking-tight text-brand-ink">Reset your password</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Enter your account email and we&apos;ll send you a secure reset link.</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="Email"><TextInput required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" /></Field>
              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-navy text-sm font-semibold text-white transition hover:bg-brand-navy-2 disabled:opacity-60">{busy && <Spinner />}Send reset link</button>
            </form>
          </>
        )}
        <Link href="/login" className="mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-brand-navy-3 hover:underline"><ArrowLeft size={15} /> Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
