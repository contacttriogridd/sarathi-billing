import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Sarathi Associates — Construction Billing',
    short_name: 'Sarathi Billing',
    description: 'Invoices, quotations, estimates, payments and reports for SARATHI ASSOCIATES.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f5f7fa',
    theme_color: '#10294a',
    lang: 'en-IN',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'New invoice', short_name: 'Invoice', url: '/invoices/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Record payment', short_name: 'Payment', url: '/payments?record=1', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'New quotation', short_name: 'Quotation', url: '/quotations/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Customers', url: '/customers', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
