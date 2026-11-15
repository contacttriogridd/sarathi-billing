'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, PlusSquare, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Install prompt store (the browser fires `beforeinstallprompt` once, often
// before the app shell mounts, so it is captured at the root and kept here).
// ---------------------------------------------------------------------------

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferredPrompt: InstallEvent | null = null;
const listeners = new Set<() => void>();
const setPrompt = (e: InstallEvent | null) => { deferredPrompt = e; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

const detectIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const detectStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function useInstallApp() {
  const prompt = useSyncExternalStore(subscribe, () => deferredPrompt, () => null);
  const [env, setEnv] = useState({ ios: false, standalone: false });
  useEffect(() => { setEnv({ ios: detectIos(), standalone: detectStandalone() }); }, []);
  return {
    /** Chrome / Edge / Android: native install dialog is available */
    canPrompt: Boolean(prompt),
    /** iPhone / iPad Safari: needs manual "Add to Home Screen" */
    needsIosSteps: env.ios && !env.standalone,
    installed: env.standalone,
    install: async () => {
      if (!deferredPrompt) return 'unavailable' as const;
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setPrompt(null);
      return outcome;
    },
  };
}

/** Mounted once in the root layout: registers the service worker and captures install events. */
export function PwaRegister() {
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallEvent); };
    const onInstalled = () => { setPrompt(null); toast.success('Sarathi Billing is installed — open it from your home screen or apps list.'); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV !== 'production') {
        // avoid stale caches while developing
        navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => undefined);
      } else {
        const hadController = Boolean(navigator.serviceWorker.controller);
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!hadController || reloading) return;
          reloading = true;
          window.location.reload();
        });
        const offerUpdate = (worker: ServiceWorker) => {
          toast('A new version of Sarathi Billing is ready', {
            duration: Infinity,
            action: { label: 'Update now', onClick: () => worker.postMessage('SKIP_WAITING') },
          });
        };
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
          if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
          reg.addEventListener('updatefound', () => {
            const worker = reg.installing;
            worker?.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
            });
          });
          // look for new versions hourly and whenever the app comes back to the foreground
          const check = () => { reg.update().catch(() => undefined); };
          window.setInterval(check, 60 * 60 * 1000);
          document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
        }).catch(() => undefined);
      }
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return null;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export function IosInstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const steps = [
    { icon: Share, text: <>Tap the <b>Share</b> button in Safari&apos;s toolbar (the square with an arrow).</> },
    { icon: PlusSquare, text: <>Scroll down and tap <b>Add to Home Screen</b>.</> },
    { icon: Smartphone, text: <>Tap <b>Add</b>. Sarathi Billing now opens full-screen from your home screen.</> },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Install on iPhone / iPad</DialogTitle>
          <DialogDescription>Apple installs web apps from Safari&apos;s share menu.</DialogDescription>
        </DialogHeader>
        <ol className="mt-2 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-700">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-navy/5 text-brand-navy"><s.icon size={18} /></span>
              <span className="pt-1.5">{s.text}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">Using Chrome on iPhone? Open this page in Safari first.</p>
      </DialogContent>
    </Dialog>
  );
}

const DISMISS_KEY = 'sarathi:install-dismissed-at';

/** Dismissible card inviting the user to install the app (shown at most once a month). */
export function InstallBanner() {
  const { canPrompt, needsIosSteps, installed, install } = useInstallApp();
  const [hidden, setHidden] = useState(true);
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
      setHidden(Date.now() - at < 30 * 86400000);
    } catch { setHidden(false); }
  }, []);

  if (installed || hidden || (!canPrompt && !needsIosSteps)) return <IosInstallDialog open={iosOpen} onOpenChange={setIosOpen} />;

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  };

  return (
    <>
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-brand-navy/10 bg-white p-3 pr-2 shadow-sm sm:p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-ink">Install Sarathi Billing</p>
          <p className="text-xs text-muted-foreground">Open it from your home screen like a regular app — full-screen and faster.</p>
        </div>
        <button
          onClick={async () => {
            if (canPrompt) { const r = await install(); if (r === 'accepted') dismiss(); }
            else setIosOpen(true);
          }}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white"
        >
          <Download size={15} />Install
        </button>
        <button onClick={dismiss} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Not now"><X size={16} /></button>
      </div>
      <IosInstallDialog open={iosOpen} onOpenChange={setIosOpen} />
    </>
  );
}

/** Thin banner shown while the device has no internet connection. */
export function ConnectionBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    if (online) return;
    return () => { toast.success('Back online'); };
  }, [online]);
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-white">
      <WifiOff size={14} /> You&apos;re offline — you can view open screens, but changes can&apos;t be saved until you reconnect.
    </div>
  );
}
