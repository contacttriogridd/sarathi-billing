import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Offline · Sarathi Billing' };

/** Served by the service worker when a page is opened without a network connection. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div className="max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={72} height={72} className="mx-auto mb-6 rounded-2xl shadow-lg" />
        <h1 className="text-2xl font-semibold tracking-tight text-brand-ink">You&apos;re offline</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Sarathi Billing needs an internet connection to load and save invoices, payments and customers. Please check your mobile data or Wi-Fi.
        </p>
        <a href="/" className="mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-brand-navy px-6 text-sm font-semibold text-white">Try again</a>
      </div>
    </main>
  );
}
