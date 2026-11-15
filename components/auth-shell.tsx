'use client';

import { CheckCircle2, Database, FileText, ShieldCheck, Wallet } from 'lucide-react';
import { BrandMark } from '@/components/common';

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
        <div className="relative flex items-center gap-3">
          <BrandMark size={42} className="bg-white/10" />
          <div>
            <p className="text-[17px] font-semibold tracking-wide">SARATHI ASSOCIATES</p>
            <p className="text-xs text-white/60">Construction and Building Services · Tiruppur</p>
          </div>
        </div>
        <div className="relative max-w-lg">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-brand-orange">Construction billing suite</p>
          <h1 className="text-[44px] font-semibold leading-[1.08] tracking-tight">Every bill, estimate and payment — in one calm place.</h1>
          <p className="mt-5 text-[15px] leading-7 text-white/70">RA bills, measurement-book billing, stage-wise invoices and GST — with beautiful PDFs you can print or send on WhatsApp in seconds.</p>
          <ul className="mt-9 grid gap-3 text-sm text-white/80">
            {[
              [FileText, 'Five professional invoice templates with your branding'],
              [Wallet, 'Payments, receipts and overdue tracking that update themselves'],
              [ShieldCheck, 'Admin & staff roles with a full audit trail'],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof FileText;
              return <li key={i} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><I size={16} /></span>{text as string}</li>;
            })}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">Anitha Complex, Perumanallur, Tiruppur, Tamil Nadu</p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px] animate-in-up">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark size={40} />
            <div>
              <p className="font-semibold tracking-wide text-brand-ink">SARATHI ASSOCIATES</p>
              <p className="text-xs text-muted-foreground">Construction billing</p>
            </div>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

export function SetupRequired({ kind }: { kind: 'env' | 'schema' }) {
  return (
    <AuthShell>
      <div className="card-surface p-7">
        <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-brand-orange/10 text-brand-orange-dark"><Database size={20} /></span>
        <h2 className="text-xl font-semibold text-brand-ink">{kind === 'env' ? 'Connect your Supabase project' : 'Set up the database'}</h2>
        {kind === 'env' ? (
          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-navy" />Copy <code className="rounded bg-slate-100 px-1">.env.example</code> to <code className="rounded bg-slate-100 px-1">.env</code>.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-navy" />Paste your project URL and <b>publishable</b> key from Supabase → Settings → API Keys.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-navy" />Restart the app.</li>
          </ol>
        ) : (
          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-navy" />Open Supabase Dashboard → <b>SQL Editor</b> → New query.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-navy" />Paste the contents of <code className="rounded bg-slate-100 px-1">supabase/migrations/20261115120000_sarathi_billing_schema.sql</code> and click <b>Run</b>.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-navy" />Reload this page and create the first (administrator) account.</li>
          </ol>
        )}
        <button onClick={() => window.location.reload()} className="mt-6 h-11 w-full rounded-xl bg-brand-navy text-sm font-semibold text-white transition hover:bg-brand-navy-2">I&apos;ve done this — reload</button>
      </div>
    </AuthShell>
  );
}
