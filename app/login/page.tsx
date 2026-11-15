'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/components/providers';
import { AuthShell, SetupRequired } from '@/components/auth-shell';
import { Field, Spinner, TextInput } from '@/components/common';
import { friendlyError } from '@/lib/data';

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  useEffect(() => { if (!loading && session) router.replace('/'); }, [loading, session, router]);

  if (!isSupabaseConfigured) return <SetupRequired kind="env" />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.replace('/');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/login` },
        });
        if (error) throw error;
        if (data.session) router.replace('/');
        else setMessage({ tone: 'info', text: 'Account created. Please confirm your email address using the link we sent, then sign in.' });
      }
    } catch (err) {
      const msg = friendlyError(err);
      setMessage({ tone: 'error', text: /Invalid login/i.test(msg) ? 'Incorrect email or password.' : /Email not confirmed/i.test(msg) ? 'Please confirm your email address first — check your inbox.' : msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="card-surface p-6 sm:p-8">
        <p className="label-eyebrow text-brand-orange">{mode === 'login' ? 'Welcome back' : 'New account'}</p>
        <h2 className="mt-2 text-[26px] font-semibold tracking-tight text-brand-ink">{mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {mode === 'login' ? 'Use the email and password registered for your team.' : 'The very first account becomes the administrator. Later accounts need approval from an admin.'}
        </p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          {mode === 'signup' && (
            <Field label="Full name">
              <div className="relative"><UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><TextInput required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="pl-10" autoComplete="name" /></div>
            </Field>
          )}
          <Field label="Email">
            <div className="relative"><Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><TextInput required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="pl-10" autoComplete="email" /></div>
          </Field>
          <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
            <div className="relative">
              <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <TextInput required minLength={mode === 'signup' ? 8 : 6} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-10 pr-11" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </Field>
          {mode === 'login' && <div className="-mt-1 text-right"><Link href="/forgot-password" className="text-[13px] font-medium text-brand-navy-3 hover:underline">Forgot password?</Link></div>}
          {message && <p className={message.tone === 'error' ? 'rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700' : 'rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-800'}>{message.text}</p>}
          <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-navy text-sm font-semibold text-white shadow-lg shadow-brand-navy/20 transition hover:bg-brand-navy-2 disabled:opacity-60">
            {busy ? <Spinner /> : null}{mode === 'login' ? 'Sign in' : 'Create account'}{!busy && <ArrowRight size={16} />}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === 'login' ? 'New team member? ' : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(null); }} className="font-semibold text-brand-navy-3 hover:underline">{mode === 'login' ? 'Create an account' : 'Sign in'}</button>
        </p>
      </div>
    </AuthShell>
  );
}
