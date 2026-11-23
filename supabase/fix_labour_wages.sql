-- SARATHI ASSOCIATES — FIX LABOUR WAGES (shift basis)
-- Paste this whole query into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once. It never deletes attendance, labourers or payments.
-- Wage for a day = shifts × wage per shift (+ overtime hours × overtime rate).

-- 1. shifts column (0 = absent, 0.5, 1, 1.5, 2 … up to 3)
ALTER TABLE public.labour_attendance ADD COLUMN IF NOT EXISTS shifts numeric(4,2);

-- 2. remove every old status-based wage formula, in any schema
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.proname = 'labour_expense_description'
       AND pg_get_function_identity_arguments(p.oid) LIKE '%p_status%'
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $$;

-- 3. shift-based wage formula
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

-- marker the app can read, to confirm this fix reached the database the app uses
CREATE OR REPLACE FUNCTION public.labour_wage_formula()
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'shifts x wage per shift (fix 2026-11-23)'::text $$;

-- 4. connect the formula to the tables (replaces whatever the triggers pointed to before)
DROP TRIGGER IF EXISTS labour_attendance_before_write ON public.labour_attendance;
CREATE TRIGGER labour_attendance_before_write BEFORE INSERT OR UPDATE ON public.labour_attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_before_write();
DROP TRIGGER IF EXISTS labour_attendance_sync_expense ON public.labour_attendance;
CREATE TRIGGER labour_attendance_sync_expense AFTER INSERT OR UPDATE ON public.labour_attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_sync_expense();
DROP TRIGGER IF EXISTS labourers_sync_expenses ON public.labourers;
CREATE TRIGGER labourers_sync_expenses AFTER UPDATE ON public.labourers
  FOR EACH ROW EXECUTE FUNCTION public.labourer_sync_expenses();

-- 5. days marked before shifts existed: Present = 1, Half day = ½, Absent = 0
UPDATE public.labour_attendance
   SET shifts = CASE status WHEN 'Present' THEN 1 WHEN 'Half day' THEN 0.5 ELSE 0 END
 WHERE shifts IS NULL;

-- 6. repair every day whose wage, status or expense line does not match its shifts
UPDATE public.labour_attendance AS a
   SET shifts = a.shifts
  FROM public.labourers l
 WHERE l.id = a.labourer_id
   AND (a.amount IS DISTINCT FROM round(a.daily_wage * GREATEST(a.shifts, 0) + CASE WHEN a.shifts > 0 THEN a.overtime_hours ELSE 0 END * a.overtime_rate, 2)
        OR a.status IS DISTINCT FROM (CASE WHEN a.shifts <= 0 THEN 'Absent' WHEN a.shifts < 1 THEN 'Half day' ELSE 'Present' END)
        OR (a.amount > 0 AND NOT EXISTS (
              SELECT 1 FROM public.expenses e
               WHERE e.attendance_id = a.id AND e.amount = a.amount
                 AND e.description = public.labour_expense_description(l.trade, a.shifts, a.overtime_hours))));

-- 7. keep shifts required and within 0–3
ALTER TABLE public.labour_attendance ALTER COLUMN shifts SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'labour_attendance_shifts_check') THEN
    ALTER TABLE public.labour_attendance ADD CONSTRAINT labour_attendance_shifts_check CHECK (shifts >= 0 AND shifts <= 3);
  END IF;
END $$;

-- 8. let the app see the new functions straight away
NOTIFY pgrst, 'reload schema';

-- 9. result: you should see FIXED and days_still_wrong = 0
SELECT CASE
         WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'labour_expense_description'
                       AND pg_get_function_identity_arguments(oid) LIKE '%p_status%')
           THEN 'NOT FIXED: an old wage formula is still installed'
         ELSE 'FIXED: labour wages = shifts × wage per shift'
       END AS result,
       (SELECT count(*) FROM public.labour_attendance) AS attendance_days,
       (SELECT count(*) FROM public.labour_attendance
         WHERE amount IS DISTINCT FROM round(daily_wage * GREATEST(shifts, 0)
                 + CASE WHEN shifts > 0 THEN overtime_hours ELSE 0 END * overtime_rate, 2)) AS days_still_wrong,
       (SELECT string_agg(t.tgname || ' → ' || t.tgfoid::regproc::text, ', ' ORDER BY t.tgname)
          FROM pg_trigger t WHERE t.tgrelid = 'public.labour_attendance'::regclass AND NOT t.tgisinternal) AS attendance_triggers;
