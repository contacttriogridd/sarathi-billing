/*
  ONLY run this if the main schema script stops with:
    "Legacy prototype schema detected (company_settings.user_id)"

  It removes the tables created by the earlier single-user prototype so the
  production schema can be installed. ANY DATA IN THESE TABLES WILL BE LOST.
  On a brand-new Supabase project you never need this file.
*/
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.quotations CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.company_settings CASCADE;
