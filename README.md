# SARATHI ASSOCIATES — Construction Billing

Construction billing, quotations, estimates, invoices, payments and reports for
SARATHI ASSOCIATES, Anitha Complex, Perumanallur, Tiruppur.

- **Frontend:** Next.js 14 (React 18 + TypeScript), Tailwind CSS, shadcn/ui, Lucide, Recharts
- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security, Storage, Realtime)
- **PDF engine:** pdf-lib with embedded Noto Sans / Poppins / Noto Serif fonts, so the PDFs are real vector files with the ₹ symbol, not screenshots

---

## 1. One-time Supabase setup

1. Open **Supabase Dashboard → SQL Editor → New query**.
2. Paste the whole of `supabase/migrations/20261115120000_sarathi_billing_schema.sql` and click **Run**.
   The script is idempotent, so running it again is safe and never deletes data.
   **Already set up before the labour attendance feature (Nov 2026)?** Also run
   `supabase/migrations/20261123120000_labour_attendance.sql` once. Until then the
   *Services → Labour attendance* page shows a setup notice, and the rest of the app keeps working.
3. **Authentication → URL Configuration:**
   - *Site URL*: the address where the app is hosted, e.g. `https://billing.yourdomain.in` (or `http://localhost:3000` while testing).
   - *Redirect URLs*: add `<site-url>/reset-password` and `<site-url>/login`. Password-reset emails need this.
4. **Authentication → Sign In / Providers → Email:** decide whether new users must confirm their email.
   Supabase's built-in mailer sends only a few emails per hour. For daily use, either add your own SMTP
   (Authentication → Emails → SMTP settings) or turn off "Confirm email", since every new user still has to be approved by an admin anyway.

### First login = administrator

The **first account created becomes the active administrator**. Every later sign-up is created as
*staff* and **cannot see any billing data until an administrator approves it** in
**Settings → Team & access**.

| Role  | Can do |
|-------|--------|
| Admin | Everything: company settings, team approval and roles, deleting records, editing issued invoices, restoring backups |
| Staff | Create and edit customers, projects, quotations, estimates, draft invoices, payments, expenses, labourers, attendance and labour payments. Cannot delete, change settings or edit issued invoices |

These rules are enforced **in the database** (RLS policies and triggers), not only in the UI.

**Locked out of admin?** For example, an earlier test account became the admin. Sign in with your own account, then run `supabase/make_me_admin.sql` in the SQL Editor. It makes the most recently signed-in account an active admin and lists every account.

---

## 2. Run locally

```bash
npm install
cp .env.example .env      # then fill in your project URL and publishable key
npm run dev               # http://localhost:3000
```

`.env` needs only two values (Supabase → Settings → API Keys):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Use the **publishable** (or legacy *anon*) key. **Never** put the secret / service-role key in this app.
`NEXT_PUBLIC_` values are sent to the browser, and the app doesn't need the secret key.

## 3. Deploy

The project includes `netlify.toml`. On Netlify or Vercel, import the repository, set the two
environment variables above, and deploy. Then update the Supabase *Site URL* and *Redirect URLs* to the live domain.

## 4. Install as an app (PWA)

The app is a Progressive Web App: it installs on phones, tablets and computers with its own icon and opens full-screen.

Installing needs **HTTPS**, so on phones install from the deployed address (Netlify/Vercel give you HTTPS automatically).
`http://localhost` works for installing on the same computer only.

| Device | How to install |
|--------|----------------|
| Android (Chrome) | Open the site and tap **Install** on the banner on the dashboard, or ⋮ menu → **Install app** |
| iPhone / iPad (Safari) | Share button → **Add to Home Screen** → **Add**. The app's **Install** button shows these steps |
| Windows / Mac (Chrome or Edge) | Click the install icon in the address bar, or account menu → **Install app** |

- **Long-press shortcuts:** long-press the app icon for New invoice, Record payment, New quotation and Customers.
- **What gets cached:** the service worker (`public/sw.js`) caches app code, fonts and icons, so the app opens quickly.
- **Billing data is never cached:** it always comes live from Supabase. Without a connection the app shows an offline banner or an offline page, and nothing can be saved until you reconnect.
- **Updates:** after you deploy a new version, open copies of the app show **"A new version is ready — Update now"**.
- **Changing cached files:** if you change files in `public/` other than the hashed `_next` files (for example fonts or `pdf.worker.min.js`), bump `VERSION` in `public/sw.js`.
- **Development mode:** the service worker is turned off in `npm run dev` to avoid stale caches. Use `npm run build && npm start` to test it.

---

## Features

**Billing**
- Invoice types: Standard Tax Invoice, Construction Work Bill, Labour, Material, Contractor, Running Account (RA), Final, Advance Payment, Proforma
- Three billing modes:
  - **Standard:** qty × rate
  - **Measurement book:** Nos × L × B × H/D
  - **Stage-wise:** % of the contract value, with standard stages
- RA bills: previous / this-bill / cumulative quantities and a running-account abstract (previous bills are suggested automatically)
- GST exclusive, inclusive or non-GST; CGST + SGST or IGST (auto-suggested from the customer's state)
- Per-item GST rates, exemptions and HSN/SAC codes
- Line discounts (% or ₹), additional charges, overall discount applied pro-rata before GST, and round-off
- Deductions: retention, TDS, advance recovery, material and custom deductions (% or ₹, on taxable value or total)
- Advance, previous payments, payments received and balance due
- Atomic, gap-free numbering, e.g. `SA/2026-27/0001` (format and prefixes configurable)
- Drafts autosave to the database; new documents are also kept on the device until first saved
- Quotations and estimates convert to invoices in one click; Proforma converts to a tax invoice

**PDF**
- Five templates (Classic Professional, Modern Minimal, Construction Corporate, Premium Blue, Simple Black & White), customisable globally or per document:
  - accent and highlight colours, font, table style, header layout
  - footer, signature labels, copy label
  - 20 show/hide toggles
- Logo, digital signature and company stamp; UPI scan-to-pay QR code with the balance pre-filled
- Long descriptions wrap; long invoices flow onto more pages with repeated table headers and "Page X of Y"
- DRAFT / CANCELLED watermarks and a PAID stamp
- Amount in words (Indian system) and a GST rate-wise summary
- Preview (renders on phones too), download, print, and WhatsApp sharing:
  - **Phones:** the PDF file is attached directly
  - **Desktop:** a private 30-day download link is included in the message
- Issued documents keep the company details from when they were issued, so later settings changes don't alter old bills

**Payments**
- Partial or full payments, several per invoice, with server-side checks that block over-payment
- Automatic balance and status (Draft, Sent, Partially Paid, Paid, Overdue, Cancelled)
- Payment receipts (PDF) and aging buckets
- WhatsApp and email reminders, plus a customer statement on WhatsApp

**Labour attendance** (menu: Services → Labour attendance)
- Labourers with Labour ID (LAB-0001…), trade, daily wage, overtime rate and usual site
- Daily attendance sheet: one tap for Present / Half day / Absent, "mark all present", per-site view, overtime and per-day wage overrides
- Each labourer's page: month calendar (tap any day to mark or correct it), wages earned, wages paid and advances, balance due, and a monthly statement PDF
- **Wages go into expenses automatically:** every attendance day that earns a wage becomes a *Labour* expense on its project, kept in sync by the database when the day is changed or removed. Project margins, the expense list and the profit reports include labour without any double entry
- Payments and advances to labourers settle their balance only; they are not added as another expense

**More**
- Dashboard with KPIs and charts that update live (Supabase Realtime)
- Customers, projects (budget vs billed, expenses and margin), expenses, and a reusable item catalogue
- Reports with PDF and Excel export: daily, monthly, annual (FY), customer-wise, project-wise, GST summary, GST register, paid / pending / overdue, profit & expense
- **Project report** for each project separately (Reports → Project report, or the *Report* button on a project): budget, billing, collections, monthly summary, invoices, payments, expenses by category, labour attendance & wages per labourer, and other expenses
- Labour wages & attendance report: man-days, overtime, wages, paid and balance per labourer, for all sites or one project
- Audit log for every create, edit, cancellation (with reason) and payment
- JSON backup and restore, ⌘/Ctrl K command palette, responsive desktop / tablet / mobile layouts

---

## Project layout

```
app/(app)/…            signed-in pages (dashboard, invoices, quotations, estimates, payments, …)
app/login, …           authentication pages
components/editor/     invoice / quotation editor, line items, PDF design panel
components/            app shell, providers, dialogs, PDF viewer, shared UI
lib/calc.ts            the billing calculation engine (single source of truth for app + PDF)
lib/pdf/               PDF engine, templates, receipt and report renderers
lib/data.ts            Supabase data access, backup / restore
supabase/migrations/   database schema, RLS, triggers, RPCs
public/fonts/          subset TrueType fonts (Latin + ₹) embedded in PDFs
```

### Data integrity in the database

- `save_invoice` / `save_quotation` RPCs save a document header and its line items in one transaction.
- `allocate_number` hands out document numbers atomically, so two users never get the same number.
- Payment triggers recalculate `amount_paid`, `balance_due` and `status`, and reject over-payments and payments on cancelled invoices.
- Guard triggers stop staff from editing issued invoices and stop anyone from removing the last administrator.
- A generic audit trigger records field-level changes, and the audit log can't be modified.
- Attendance triggers compute each day's wage and create, update or remove the matching Labour expense. These expenses can only change through attendance, so the two never drift apart.
