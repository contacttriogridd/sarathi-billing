'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle, Bell, BookOpen, ChevronDown, Download, ClipboardList, FileCheck2, FilePlus2, FileSpreadsheet, FolderKanban, Home, LayoutDashboard,
  LogOut, Menu, Plus, ReceiptIndianRupee, Search, Settings, TrendingUp, UserPlus, Users, Wallet, WalletCards,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useData } from '@/components/providers';
import { BrandMark } from '@/components/common';
import { ConnectionBanner, IosInstallDialog, useInstallApp } from '@/components/pwa';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { invoiceStatus, daysOverdue } from '@/lib/status';
import { addDays, fmtDate, inr, initials, todayISO } from '@/lib/format';

type NavItem = { href: string; label: string; icon: typeof Home; adminOnly?: boolean };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  { group: 'Billing', items: [
    { href: '/invoices', label: 'Invoices', icon: ReceiptIndianRupee },
    { href: '/quotations', label: 'Quotations', icon: FileCheck2 },
    { href: '/estimates', label: 'Estimates', icon: ClipboardList },
    { href: '/payments', label: 'Payments', icon: Wallet },
  ] },
  { group: 'Business', items: [
    { href: '/customers', label: 'Customers', icon: Users },
    { href: '/projects', label: 'Projects', icon: FolderKanban },
    { href: '/expenses', label: 'Expenses', icon: WalletCards },
    { href: '/catalog', label: 'Item catalogue', icon: BookOpen },
  ] },
  { group: 'Insights', items: [{ href: '/reports', label: 'Reports', icon: TrendingUp }] },
];

const QUICK = [
  { href: '/invoices/new', label: 'New invoice', icon: FilePlus2, hint: 'Tax invoice, RA bill, work bill…' },
  { href: '/estimates/new', label: 'New estimate', icon: ClipboardList, hint: 'Approximate project cost' },
  { href: '/quotations/new', label: 'New quotation', icon: FileCheck2, hint: 'Formal price offer' },
  { href: '/customers?new=1', label: 'Add customer', icon: UserPlus, hint: 'Client contact & GSTIN' },
  { href: '/payments?record=1', label: 'Record payment', icon: Wallet, hint: 'Against any open invoice' },
];

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut, isAdmin } = useAuth();
  const { invoices, customers, projects, quotations, profiles, settings, error } = useData();
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [iosInstallOpen, setIosInstallOpen] = useState(false);
  const installer = useInstallApp();

  useEffect(() => { setMenuOpen(false); setCreateOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const alerts = useMemo(() => {
    const today = todayISO();
    const soon = addDays(today, 3);
    const overdue = invoices.filter((i) => invoiceStatus(i) === 'Overdue').sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
    const dueSoon = invoices.filter((i) => (i.status === 'Sent' || i.status === 'Partially Paid') && i.due_date && i.due_date >= today && i.due_date <= soon);
    const pendingUsers = isAdmin ? profiles.filter((p) => !p.active) : [];
    return { overdue, dueSoon, pendingUsers, count: overdue.length + dueSoon.length + pendingUsers.length };
  }, [invoices, profiles, isAdmin]);

  const customerName = (id: string | null) => (id ? customers.find((c) => c.id === id)?.name : '') ?? '';
  const go = (href: string) => { setPaletteOpen(false); router.push(href); };

  const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4 scrollbar-thin">
      {NAV.map((section) => (
        <div key={section.group}>
          <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/40">{section.group}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={onNavigate} className={cn('group flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition', active ? 'bg-white text-brand-navy shadow-sm' : 'text-white/75 hover:bg-white/10 hover:text-white')}>
                    <item.icon size={17} className={cn(active ? 'text-brand-orange' : 'text-white/60 group-hover:text-white')} />
                    {item.label}
                    {item.href === '/invoices' && alerts.overdue.length > 0 && <span className={cn('ml-auto rounded-full px-1.5 text-[11px] font-semibold', active ? 'bg-red-50 text-red-600' : 'bg-red-500/90 text-white')}>{alerts.overdue.length}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="mt-auto">
        <Link href="/settings" onClick={onNavigate} className={cn('group flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition', isActive(pathname, '/settings') ? 'bg-white text-brand-navy' : 'text-white/75 hover:bg-white/10 hover:text-white')}>
          <Settings size={17} className={isActive(pathname, '/settings') ? 'text-brand-orange' : 'text-white/60'} /> Settings
          {alerts.pendingUsers.length > 0 && <span className="ml-auto rounded-full bg-brand-orange px-1.5 text-[11px] font-semibold text-white">{alerts.pendingUsers.length}</span>}
        </Link>
      </div>
    </nav>
  );

  const Brand = () => (
    <Link href="/" className="flex items-center gap-3 px-5 py-5">
      {settings.logo_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={settings.logo_url} alt="" className="h-9 w-9 rounded-lg bg-white object-contain p-0.5" />
        : <BrandMark size={36} className="bg-white/10" />}
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold tracking-wide text-white">{settings.company_name || 'SARATHI ASSOCIATES'}</p>
        <p className="text-[11px] text-white/50">Construction billing</p>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-brand-navy lg:flex">
        <Brand />
        <Sidebar />
      </aside>

      <div className="lg:pl-[248px]">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 sm:h-16 sm:px-6 lg:px-8">
            <button onClick={() => setMenuOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl text-brand-ink hover:bg-slate-100 lg:hidden" aria-label="Open menu"><Menu size={20} /></button>
            <Link href="/" className="flex items-center gap-2 lg:hidden"><BrandMark size={30} /><span className="text-sm font-semibold tracking-wide text-brand-ink">SARATHI</span></Link>
            <button onClick={() => setPaletteOpen(true)} className="ml-2 hidden h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-border bg-white px-3.5 text-sm text-slate-400 transition hover:border-slate-300 sm:flex">
              <Search size={16} /> Search invoices, customers, projects…
              <kbd className="ml-auto rounded-md border bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Ctrl K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => setPaletteOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl text-brand-ink hover:bg-slate-100 sm:hidden" aria-label="Search"><Search size={19} /></button>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="relative grid h-10 w-10 place-items-center rounded-xl text-brand-ink hover:bg-slate-100" aria-label="Notifications">
                    <Bell size={19} />
                    {alerts.count > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{alerts.count > 9 ? '9+' : alerts.count}</span>}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[340px] rounded-2xl p-0">
                  <div className="border-b px-4 py-3"><p className="text-sm font-semibold">Notifications</p><p className="text-xs text-muted-foreground">Payments that need your attention</p></div>
                  <div className="max-h-[380px] overflow-y-auto p-2">
                    {alerts.count === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>}
                    {alerts.pendingUsers.map((p) => (
                      <Link key={p.id} href="/settings?tab=team" className="flex gap-3 rounded-xl p-2.5 hover:bg-slate-50">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-orange/10 text-brand-orange-dark"><UserPlus size={15} /></span>
                        <span className="min-w-0 text-sm"><b className="font-medium">{p.full_name || p.email}</b> is waiting for access approval</span>
                      </Link>
                    ))}
                    {alerts.overdue.slice(0, 8).map((inv) => (
                      <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex gap-3 rounded-xl p-2.5 hover:bg-slate-50">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600"><AlertTriangle size={15} /></span>
                        <span className="min-w-0 text-sm">
                          <span className="block truncate font-medium">{inv.invoice_number} · {customerName(inv.customer_id)}</span>
                          <span className="text-xs text-muted-foreground">{inr(inv.balance_due)} overdue by {daysOverdue(inv)} days</span>
                        </span>
                      </Link>
                    ))}
                    {alerts.dueSoon.slice(0, 6).map((inv) => (
                      <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex gap-3 rounded-xl p-2.5 hover:bg-slate-50">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600"><Bell size={15} /></span>
                        <span className="min-w-0 text-sm">
                          <span className="block truncate font-medium">{inv.invoice_number} · {customerName(inv.customer_id)}</span>
                          <span className="text-xs text-muted-foreground">{inr(inv.balance_due)} due {fmtDate(inv.due_date)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                  {alerts.overdue.length > 0 && <Link href="/payments?tab=pending" className="block border-t px-4 py-2.5 text-center text-sm font-medium text-brand-navy-3 hover:bg-slate-50">View all pending payments</Link>}
                </PopoverContent>
              </Popover>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="hidden h-10 items-center gap-1.5 rounded-xl bg-brand-orange px-3.5 text-sm font-semibold text-white shadow-sm shadow-brand-orange/30 transition hover:bg-brand-orange-dark sm:flex"><Plus size={17} /> New <ChevronDown size={14} className="opacity-80" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5">
                  {QUICK.map((q) => (
                    <DropdownMenuItem key={q.href} onSelect={() => router.push(q.href)} className="gap-3 rounded-lg py-2">
                      <q.icon size={16} className="text-brand-navy" /><span><span className="block text-sm font-medium">{q.label}</span><span className="block text-xs text-muted-foreground">{q.hint}</span></span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-brand-navy text-xs font-semibold text-white ring-2 ring-white" aria-label="Account">{initials(profile?.full_name || profile?.email || '?')}</button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 rounded-xl">
                  <DropdownMenuLabel className="font-normal">
                    <p className="truncate text-sm font-semibold">{profile?.full_name || 'Team member'}</p>
                    <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
                    <span className="mt-1.5 inline-block rounded-full bg-brand-navy/5 px-2 py-0.5 text-[11px] font-semibold capitalize text-brand-navy">{profile?.role}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => router.push('/settings')}><Settings size={15} className="mr-2" /> Settings</DropdownMenuItem>
                  {(installer.canPrompt || installer.needsIosSteps) && (
                    <DropdownMenuItem onSelect={() => { if (installer.canPrompt) void installer.install(); else setIosInstallOpen(true); }}><Download size={15} className="mr-2" /> Install app</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={async () => { await signOut(); router.replace('/login'); }} className="text-red-600 focus:text-red-600"><LogOut size={15} className="mr-2" /> Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <ConnectionBanner />
        {error && (
          <div className="mx-auto max-w-[1400px] px-4 pt-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><AlertTriangle size={16} /> {error}</div>
          </div>
        )}

        <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-12">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur-md lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          {[
            { href: '/', label: 'Home', icon: Home },
            { href: '/invoices', label: 'Invoices', icon: ReceiptIndianRupee },
          ].map((item) => (
            <Link key={item.href} href={item.href} className={cn('flex flex-col items-center gap-1 text-[11px] font-medium', isActive(pathname, item.href) ? 'text-brand-navy' : 'text-slate-400')}>
              <item.icon size={21} />{item.label}
            </Link>
          ))}
          <button onClick={() => setCreateOpen(true)} className="mx-auto -mt-6 grid h-14 w-14 place-items-center rounded-2xl bg-brand-orange text-white shadow-lg shadow-brand-orange/40 transition active:scale-95" aria-label="Create"><Plus size={26} /></button>
          <Link href="/customers" className={cn('flex flex-col items-center gap-1 text-[11px] font-medium', isActive(pathname, '/customers') ? 'text-brand-navy' : 'text-slate-400')}><Users size={21} />Customers</Link>
          <button onClick={() => setMenuOpen(true)} className="flex flex-col items-center gap-1 text-[11px] font-medium text-slate-400"><Menu size={21} />More</button>
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="flex w-[280px] flex-col border-0 bg-brand-navy p-0 text-white [&>button]:text-white">
          <SheetHeader className="sr-only"><SheetTitle>Navigation</SheetTitle></SheetHeader>
          <Brand />
          <Sidebar onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-8 pt-3">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
          <SheetHeader className="mb-2 text-left"><SheetTitle>Create</SheetTitle></SheetHeader>
          <div className="grid gap-1.5">
            {QUICK.map((q) => (
              <button key={q.href} onClick={() => { setCreateOpen(false); router.push(q.href); }} className="flex items-center gap-3.5 rounded-2xl p-3 text-left transition active:bg-slate-100">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-navy/5 text-brand-navy"><q.icon size={20} /></span>
                <span><span className="block text-[15px] font-semibold text-brand-ink">{q.label}</span><span className="block text-xs text-muted-foreground">{q.hint}</span></span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <IosInstallDialog open={iosInstallOpen} onOpenChange={setIosInstallOpen} />

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Search invoices, customers, projects or type a command…" />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Quick actions">
            {QUICK.map((q) => <CommandItem key={q.href} value={`action ${q.label}`} onSelect={() => go(q.href)}><q.icon className="mr-2 h-4 w-4" />{q.label}</CommandItem>)}
            <CommandItem value="action reports" onSelect={() => go('/reports')}><FileSpreadsheet className="mr-2 h-4 w-4" />Open reports</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Invoices">
            {invoices.slice(0, 300).map((inv) => (
              <CommandItem key={inv.id} value={`invoice ${inv.invoice_number} ${customerName(inv.customer_id)} ${inv.id}`} onSelect={() => go(`/invoices/${inv.id}`)}>
                <ReceiptIndianRupee className="mr-2 h-4 w-4 text-slate-400" /><span className="truncate">{inv.invoice_number}</span><span className="ml-2 truncate text-xs text-muted-foreground">{customerName(inv.customer_id)}</span><span className="num ml-auto text-xs">{inr(inv.grand_total)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Customers">
            {customers.slice(0, 300).map((c) => (
              <CommandItem key={c.id} value={`customer ${c.name} ${c.phone} ${c.id}`} onSelect={() => go(`/customers/${c.id}`)}><Users className="mr-2 h-4 w-4 text-slate-400" />{c.name}<span className="ml-2 text-xs text-muted-foreground">{c.phone}</span></CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Projects">
            {projects.slice(0, 300).map((p) => (
              <CommandItem key={p.id} value={`project ${p.project_name} ${p.project_code} ${p.location} ${p.id}`} onSelect={() => go(`/projects/${p.id}`)}><FolderKanban className="mr-2 h-4 w-4 text-slate-400" />{p.project_name}<span className="ml-2 text-xs text-muted-foreground">{p.project_code}</span></CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Quotations & estimates">
            {quotations.slice(0, 200).map((q) => (
              <CommandItem key={q.id} value={`quote ${q.quotation_number} ${customerName(q.customer_id)} ${q.id}`} onSelect={() => go(`/${q.doc_kind === 'estimate' ? 'estimates' : 'quotations'}/${q.id}`)}><FileCheck2 className="mr-2 h-4 w-4 text-slate-400" />{q.quotation_number}<span className="ml-2 truncate text-xs text-muted-foreground">{customerName(q.customer_id)}</span></CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
