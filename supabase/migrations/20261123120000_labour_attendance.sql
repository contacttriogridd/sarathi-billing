/*
  SARATHI ASSOCIATES — Labour attendance (menu: Services → Labour attendance)

  HOW TO APPLY
  ------------
  Supabase Dashboard → SQL Editor → paste this whole file → Run.
  Run it once on a database that already has the main schema
  (20261115120000_sarathi_billing_schema.sql). It is idempotent: re-running it is safe
  and never deletes data. Fresh installs get the same objects from the main schema file.

  Wages are shift-based (section 9): wage for a day = shifts × rate per shift + overtime.
  Running this file at any time also repairs wages saved by an older version.

  WHAT IT ADDS
  ------------
  * labourers          every worker: Labour ID (LAB-0001…), trade, daily wage, overtime rate, usual site
  * labour_attendance  one row per labourer per day: Present / Half day / Absent + overtime hours.
                       The day's wage is worked out in the database from the rates saved on the row.
  * labour_payments    wages paid and advances given, so each labourer has a running balance
  * expenses.attendance_id
                       every attendance day that earns wages becomes a "Labour" expense on its
                       project automatically. It is updated when the attendance changes and removed
                       when the day is marked Absent or deleted, so project margins, the expense list
                       and the profit reports always include labour cost.
                       These expenses can only be changed through attendance.
*/

-- ---------------------------------------------------------------------------
-- 1. Labourers
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.labour_code_seq START 1;

CREATE TABLE IF NOT EXISTS public.labourers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labour_code text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  phone text NOT NULL DEFAULT '',
  trade text NOT NULL DEFAULT 'Helper',
  daily_wage numeric(12,2) NOT NULL DEFAULT 0 CHECK (daily_wage >= 0),
  overtime_rate numeric(12,2) NOT NULL DEFAULT 0 CHECK (overtime_rate >= 0),
  default_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  joined_on date,
  active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Labour ID is generated when left blank, skipping codes already used (e.g. after a restore).
CREATE OR REPLACE FUNCTION public.labourer_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_code text;
BEGIN
  NEW.name := trim(NEW.name);
  IF NEW.labour_code IS NULL OR trim(NEW.labour_code) = '' THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.labour_code := OLD.labour_code;
    ELSE
      LOOP
        v_code := 'LAB-' || lpad(nextval('public.labour_code_seq')::text, 4, '0');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.labourers WHERE labour_code = v_code);
      END LOOP;
      NEW.labour_code := v_code;
    END IF;
  ELSE
    NEW.labour_code := upper(trim(NEW.labour_code));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS labourers_before_write ON public.labourers;
CREATE TRIGGER labourers_before_write BEFORE INSERT OR UPDATE ON public.labourers
  FOR EACH ROW EXECUTE FUNCTION public.labourer_before_write();

-- ---------------------------------------------------------------------------
-- 2. Attendance (one row per labourer per day)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.labour_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labourer_id uuid NOT NULL REFERENCES public.labourers(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'Present' CHECK (status IN ('Present', 'Half day', 'Absent')),
  overtime_hours numeric(5,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0 AND overtime_hours <= 24),
  -- rates are copied from the labourer when the day is first marked, so later wage changes don't rewrite history
  daily_wage numeric(12,2) NOT NULL CHECK (daily_wage >= 0),
  overtime_rate numeric(12,2) NOT NULL CHECK (overtime_rate >= 0),
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  notes text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT labour_attendance_one_per_day UNIQUE (labourer_id, work_date)
);

-- Fills missing rates from the labourer and computes the day's wage:
--   Present = 1 day, Half day = 0.5 day, Absent = 0, plus overtime hours × overtime rate.
CREATE OR REPLACE FUNCTION public.attendance_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_wage numeric;
  v_ot numeric;
BEGIN
  IF NEW.daily_wage IS NULL OR NEW.overtime_rate IS NULL THEN
    SELECT daily_wage, overtime_rate INTO v_wage, v_ot FROM public.labourers WHERE id = NEW.labourer_id;
    NEW.daily_wage := COALESCE(NEW.daily_wage, v_wage, 0);
    NEW.overtime_rate := COALESCE(NEW.overtime_rate, v_ot, 0);
  END IF;
  NEW.overtime_hours := COALESCE(NEW.overtime_hours, 0);
  IF NEW.status = 'Absent' THEN
    NEW.overtime_hours := 0;
  END IF;
  NEW.notes := COALESCE(NEW.notes, '');
  NEW.amount := round(
    NEW.daily_wage * (CASE NEW.status WHEN 'Present' THEN 1 WHEN 'Half day' THEN 0.5 ELSE 0 END)
    + NEW.overtime_hours * NEW.overtime_rate, 2);
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS labour_attendance_before_write ON public.labour_attendance;
CREATE TRIGGER labour_attendance_before_write BEFORE INSERT OR UPDATE ON public.labour_attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_before_write();

-- ---------------------------------------------------------------------------
-- 3. Labour payments (wages paid / advances) — settle the labourer's balance.
--    They are NOT expenses: the wages are already counted from attendance.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.labour_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labourer_id uuid NOT NULL REFERENCES public.labourers(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  kind text NOT NULL DEFAULT 'Wages' CHECK (kind IN ('Wages', 'Advance')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'Cash',
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. Attendance → expenses
-- ---------------------------------------------------------------------------
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS attendance_id uuid REFERENCES public.labour_attendance(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_attendance_uidx ON public.expenses (attendance_id);

CREATE OR REPLACE FUNCTION public.labour_expense_description(p_trade text, p_status text, p_ot numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT concat_ws(' · ',
    COALESCE(NULLIF(trim(p_trade), ''), 'Labour') || ' wages',
    p_status,
    CASE WHEN COALESCE(p_ot, 0) > 0 THEN regexp_replace(round(p_ot, 2)::text, '\.?0+$', '') || ' h OT' END);
$$;

-- Creates / updates / removes the Labour expense that mirrors an attendance day.
CREATE OR REPLACE FUNCTION public.attendance_sync_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_trade text;
  v_code text;
BEGIN
  IF NEW.amount <= 0 THEN
    DELETE FROM public.expenses WHERE attendance_id = NEW.id;
    RETURN NEW;
  END IF;
  SELECT name, trade, labour_code INTO v_name, v_trade, v_code FROM public.labourers WHERE id = NEW.labourer_id;
  INSERT INTO public.expenses (expense_date, category, project_id, vendor, description, amount, payment_method, reference, notes, attendance_id, created_by)
  VALUES (NEW.work_date, 'Labour', NEW.project_id, COALESCE(v_name, ''), public.labour_expense_description(v_trade, NEW.status, NEW.overtime_hours),
          NEW.amount, 'Attendance', COALESCE(v_code, ''), NEW.notes, NEW.id, NEW.created_by)
  ON CONFLICT (attendance_id) DO UPDATE SET
    expense_date = EXCLUDED.expense_date,
    category = 'Labour',
    project_id = EXCLUDED.project_id,
    vendor = EXCLUDED.vendor,
    description = EXCLUDED.description,
    amount = EXCLUDED.amount,
    reference = EXCLUDED.reference,
    notes = EXCLUDED.notes;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS labour_attendance_sync_expense ON public.labour_attendance;
CREATE TRIGGER labour_attendance_sync_expense AFTER INSERT OR UPDATE ON public.labour_attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_sync_expense();
-- (deleting an attendance row removes its expense through ON DELETE CASCADE)

-- Renaming a labourer or changing their trade / Labour ID updates their expense lines.
CREATE OR REPLACE FUNCTION public.labourer_sync_expenses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.trade IS DISTINCT FROM OLD.trade OR NEW.labour_code IS DISTINCT FROM OLD.labour_code THEN
    UPDATE public.expenses e
       SET vendor = NEW.name,
           reference = NEW.labour_code,
           description = public.labour_expense_description(NEW.trade, a.status, a.overtime_hours)
      FROM public.labour_attendance a
     WHERE a.id = e.attendance_id AND a.labourer_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS labourers_sync_expenses ON public.labourers;
CREATE TRIGGER labourers_sync_expenses AFTER UPDATE ON public.labourers
  FOR EACH ROW EXECUTE FUNCTION public.labourer_sync_expenses();

-- Attendance expenses may only be written by the triggers above (nested trigger depth),
-- never directly, so they can't drift away from the attendance register.
CREATE OR REPLACE FUNCTION public.guard_attendance_expense()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'INSERT' AND NEW.attendance_id IS NOT NULL THEN
    RAISE EXCEPTION 'Labour expenses are created automatically from attendance.';
  ELSIF TG_OP = 'UPDATE' AND (OLD.attendance_id IS NOT NULL OR NEW.attendance_id IS NOT NULL) THEN
    RAISE EXCEPTION 'This expense comes from labour attendance. Change the attendance entry instead.';
  ELSIF TG_OP = 'DELETE' AND OLD.attendance_id IS NOT NULL THEN
    RAISE EXCEPTION 'This expense comes from labour attendance. Mark the day Absent or remove the attendance entry instead.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS expenses_attendance_guard ON public.expenses;
CREATE TRIGGER expenses_attendance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_expense();

-- ---------------------------------------------------------------------------
-- 5. Indexes & updated_at
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS labourers_name_idx ON public.labourers (lower(name));
CREATE INDEX IF NOT EXISTS labour_attendance_date_idx ON public.labour_attendance (work_date DESC);
CREATE INDEX IF NOT EXISTS labour_attendance_project_idx ON public.labour_attendance (project_id, work_date);
CREATE INDEX IF NOT EXISTS labour_payments_labourer_idx ON public.labour_payments (labourer_id, payment_date DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['labourers', 'labour_payments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Audit trail
--    Labourers and labour payments are audited. Attendance and its mirrored expenses are
--    not, so twenty marks a day don't bury invoices and payments in the activity feed
--    (attendance rows keep created_by / updated_by instead).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changes jsonb;
  v_action text;
  v_label text;
  v_id uuid;
  v_email text := '';
  v_skip text[] := ARRAY['updated_at', 'snapshot', 'tax_breakdown', 'pdf_options', 'charges', 'deductions', 'stage_details', 'ra_details', 'logo_url', 'signature_url', 'stamp_url',
                     'invoice_next_number', 'quotation_next_number', 'estimate_next_number', 'receipt_next_number'];
BEGIN
  IF TG_TABLE_NAME = 'invoices' AND TG_OP = 'UPDATE' AND current_setting('app.invoice_recalc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME = 'expenses' AND (COALESCE(v_new, v_old) ->> 'attendance_id') IS NOT NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
      INTO v_changes
      FROM jsonb_each(v_new) n
      JOIN jsonb_each(v_old) o USING (key)
     WHERE n.value IS DISTINCT FROM o.value
       AND NOT (n.key = ANY (v_skip))
       AND length(n.value::text) < 400
       AND length(o.value::text) < 400;
    IF v_changes IS NULL THEN
      RETURN NEW;
    END IF;
    IF v_new ->> 'status' IS DISTINCT FROM v_old ->> 'status' THEN
      v_action := CASE WHEN v_new ->> 'status' = 'Cancelled' THEN 'cancelled' ELSE 'status_changed' END;
    ELSE
      v_action := 'updated';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_changes := '{}'::jsonb;
  ELSE
    v_action := 'deleted';
    v_changes := '{}'::jsonb;
  END IF;

  v_label := COALESCE(v_new, v_old) ->> TG_ARGV[0];
  BEGIN
    v_id := (COALESCE(v_new, v_old) ->> 'id')::uuid;
  EXCEPTION WHEN others THEN
    v_id := NULL;
  END;
  SELECT COALESCE(email, '') INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.audit_logs (entity_type, entity_id, entity_label, action, details, actor_id, actor_email)
  VALUES (TG_TABLE_NAME, v_id, COALESCE(v_label, ''), v_action,
          jsonb_build_object('changes', v_changes,
                             'amount', COALESCE(v_new, v_old) -> 'amount',
                             'grand_total', COALESCE(v_new, v_old) -> 'grand_total',
                             'invoice_id', COALESCE(v_new, v_old) -> 'invoice_id',
                             'customer_id', COALESCE(v_new, v_old) -> 'customer_id'),
          auth.uid(), COALESCE(v_email, ''));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS labourers_audit ON public.labourers;
CREATE TRIGGER labourers_audit AFTER INSERT OR UPDATE OR DELETE ON public.labourers
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('name');
DROP TRIGGER IF EXISTS labour_payments_audit ON public.labour_payments;
CREATE TRIGGER labour_payments_audit AFTER INSERT OR UPDATE OR DELETE ON public.labour_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('kind');

-- ---------------------------------------------------------------------------
-- 7. Row Level Security: members read / add / edit, admins delete
-- ---------------------------------------------------------------------------
ALTER TABLE public.labourers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labour_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labour_payments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['labourers', 'labour_attendance', 'labour_payments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (public.is_member())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_member())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated USING (public.is_member()) WITH CHECK (public.is_member())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_delete ON public.%I FOR DELETE TO authenticated USING (public.is_admin())', t, t);
  END LOOP;
END $$;

REVOKE ALL ON public.labourers, public.labour_attendance, public.labour_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labourers, public.labour_attendance, public.labour_payments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.labour_code_seq TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Realtime
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['labourers', 'labour_attendance', 'labour_payments'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
-- ---------------------------------------------------------------------------
-- 9. Shift-based wages (same as 20261123180000_labour_shift_wages.sql; replaces
--    the wage functions above so re-running this file never undoes shift wages)
-- ---------------------------------------------------------------------------
ALTER TABLE public.labour_attendance ADD COLUMN IF NOT EXISTS shifts numeric(4,2);

CREATE OR REPLACE FUNCTION public.labour_shift_text(p_shifts numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(round(COALESCE(p_shifts, 0), 2)::text, '\.?0+$', '')
         || CASE WHEN COALESCE(p_shifts, 0) = 1 THEN ' shift' ELSE ' shifts' END;
$$;

CREATE OR REPLACE FUNCTION public.labour_expense_description(p_trade text, p_shifts numeric, p_ot numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT concat_ws(' · ',
    COALESCE(NULLIF(trim(p_trade), ''), 'Labour') || ' wages',
    public.labour_shift_text(p_shifts),
    CASE WHEN COALESCE(p_ot, 0) > 0 THEN regexp_replace(round(p_ot, 2)::text, '\.?0+$', '') || ' h OT' END);
$$;

-- Shifts drive the wage. Rows written without shifts (or an older app that changes only
-- the status) get shifts from the status: Present = 1, Half day = 0.5, Absent = 0.
CREATE OR REPLACE FUNCTION public.attendance_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_wage numeric;
  v_ot numeric;
BEGIN
  IF NEW.daily_wage IS NULL OR NEW.overtime_rate IS NULL THEN
    SELECT daily_wage, overtime_rate INTO v_wage, v_ot FROM public.labourers WHERE id = NEW.labourer_id;
    NEW.daily_wage := COALESCE(NEW.daily_wage, v_wage, 0);
    NEW.overtime_rate := COALESCE(NEW.overtime_rate, v_ot, 0);
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.shifts IS NULL THEN
      NEW.shifts := CASE NEW.status WHEN 'Present' THEN 1 WHEN 'Half day' THEN 0.5 ELSE 0 END;
    END IF;
  ELSIF NEW.shifts IS NULL OR (NEW.shifts = OLD.shifts AND NEW.status IS DISTINCT FROM OLD.status) THEN
    NEW.shifts := CASE NEW.status WHEN 'Present' THEN 1 WHEN 'Half day' THEN 0.5 ELSE 0 END;
  END IF;
  NEW.status := CASE WHEN NEW.shifts <= 0 THEN 'Absent' WHEN NEW.shifts < 1 THEN 'Half day' ELSE 'Present' END;
  NEW.overtime_hours := COALESCE(NEW.overtime_hours, 0);
  IF NEW.shifts <= 0 THEN
    NEW.overtime_hours := 0;
  END IF;
  NEW.notes := COALESCE(NEW.notes, '');
  NEW.amount := round(NEW.daily_wage * GREATEST(NEW.shifts, 0) + NEW.overtime_hours * NEW.overtime_rate, 2);
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.attendance_sync_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_trade text;
  v_code text;
BEGIN
  IF NEW.amount <= 0 THEN
    DELETE FROM public.expenses WHERE attendance_id = NEW.id;
    RETURN NEW;
  END IF;
  SELECT name, trade, labour_code INTO v_name, v_trade, v_code FROM public.labourers WHERE id = NEW.labourer_id;
  INSERT INTO public.expenses (expense_date, category, project_id, vendor, description, amount, payment_method, reference, notes, attendance_id, created_by)
  VALUES (NEW.work_date, 'Labour', NEW.project_id, COALESCE(v_name, ''), public.labour_expense_description(v_trade, NEW.shifts, NEW.overtime_hours),
          NEW.amount, 'Attendance', COALESCE(v_code, ''), NEW.notes, NEW.id, NEW.created_by)
  ON CONFLICT (attendance_id) DO UPDATE SET
    expense_date = EXCLUDED.expense_date,
    category = 'Labour',
    project_id = EXCLUDED.project_id,
    vendor = EXCLUDED.vendor,
    description = EXCLUDED.description,
    amount = EXCLUDED.amount,
    reference = EXCLUDED.reference,
    notes = EXCLUDED.notes;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.labourer_sync_expenses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.trade IS DISTINCT FROM OLD.trade OR NEW.labour_code IS DISTINCT FROM OLD.labour_code THEN
    UPDATE public.expenses e
       SET vendor = NEW.name,
           reference = NEW.labour_code,
           description = public.labour_expense_description(NEW.trade, a.shifts, a.overtime_hours)
      FROM public.labour_attendance a
     WHERE a.id = e.attendance_id AND a.labourer_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

-- the status-based description is no longer used
DROP FUNCTION IF EXISTS public.labour_expense_description(text, text, numeric);

-- convert attendance marked before this update (also refreshes the expense descriptions)
UPDATE public.labour_attendance
   SET shifts = CASE status WHEN 'Present' THEN 1 WHEN 'Half day' THEN 0.5 ELSE 0 END
 WHERE shifts IS NULL;

-- Repair: days saved while an older, status-based version of the wage functions was active
-- (for example after re-running an earlier script) were paid as 1 shift whatever was tapped.
-- Recompute the wage, status and expense line of every day that doesn't match its shifts.
UPDATE public.labour_attendance AS a
   SET shifts = a.shifts
  FROM public.labourers l
 WHERE l.id = a.labourer_id
   AND a.shifts IS NOT NULL
   AND (a.amount IS DISTINCT FROM round(a.daily_wage * GREATEST(a.shifts, 0) + CASE WHEN a.shifts > 0 THEN a.overtime_hours ELSE 0 END * a.overtime_rate, 2)
        OR a.status IS DISTINCT FROM (CASE WHEN a.shifts <= 0 THEN 'Absent' WHEN a.shifts < 1 THEN 'Half day' ELSE 'Present' END)
        OR (a.amount > 0 AND NOT EXISTS (
              SELECT 1 FROM public.expenses e
               WHERE e.attendance_id = a.id AND e.amount = a.amount
                 AND e.description = public.labour_expense_description(l.trade, a.shifts, a.overtime_hours))));

ALTER TABLE public.labour_attendance ALTER COLUMN shifts SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'labour_attendance_shifts_check') THEN
    ALTER TABLE public.labour_attendance ADD CONSTRAINT labour_attendance_shifts_check CHECK (shifts >= 0 AND shifts <= 3);
  END IF;
END $$;
