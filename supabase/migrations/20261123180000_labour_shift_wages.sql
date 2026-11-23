/*
  SARATHI ASSOCIATES — Shift-based labour wages

  HOW TO APPLY
  ------------
  Supabase Dashboard → SQL Editor → paste this whole file → Run.
  Run it after 20261123120000_labour_attendance.sql. Safe to re-run; never deletes data.
  Running it again also repairs wages saved while an older version of the wage functions
  was active: every day is recalculated as shifts × rate per shift (+ overtime).
  Fresh installs get the same objects from the main schema file.

  WHAT CHANGES
  ------------
  * labour_attendance.shifts: shifts worked that day (0 = absent, 0.5, 1, 1.5, 2 … up to 3).
  * Wage for the day = shifts × rate per shift (labourers.daily_wage is the rate per shift)
                       + overtime hours × overtime rate (optional).
  * Existing attendance is converted: Present = 1 shift, Half day = ½ shift, Absent = 0,
    so amounts already recorded do not change.
  * status is kept in step automatically (0 = Absent, under 1 = Half day, 1 or more = Present),
    so an app still open from before the update keeps working.
  * Expense lines read e.g. "Mason wages · 1.5 shifts · 2 h OT".
*/

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
