import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/components/providers';
import { PwaRegister } from '@/components/pwa';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Sarathi Associates · Construction Billing',
  description: 'Construction billing, quotations, invoices and payment management for SARATHI ASSOCIATES, Tiruppur.',
  applicationName: 'Sarathi Billing',
  appleWebApp: { capable: true, title: 'Sarathi Billing', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#10294a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={inter.variable}>
      <body className="font-sans">
        <PwaRegister />
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </body>
    </html>
  );
}
