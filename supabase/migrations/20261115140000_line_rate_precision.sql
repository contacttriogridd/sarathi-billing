-- Run once in Supabase SQL Editor (safe to re-run).
-- Lets line-item rates keep 8 decimals, so typing a line Amount (e.g. 1,200 Sq.ft for Rs 1,80,000)
-- reproduces that amount exactly after saving.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoice_items' AND column_name = 'rate' AND numeric_scale < 8) THEN
    ALTER TABLE public.invoice_items ALTER COLUMN rate TYPE numeric(20,8);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quotation_items' AND column_name = 'rate' AND numeric_scale < 8) THEN
    ALTER TABLE public.quotation_items ALTER COLUMN rate TYPE numeric(20,8);
  END IF;
END $$;
