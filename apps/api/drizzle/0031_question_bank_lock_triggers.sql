-- Hand-written (drizzle-kit cannot express triggers). US-4.2 AC-7, AGENTS › Invariant 11, CONTEXT D50.
-- A LOCKED question bank is final: exams are drawn from it as it was locked. Its questions are not
-- added, deleted or edited; a VALIDATED one may only become RETIRED (status, row_version and
-- updated_at are the only columns that change). The bank keeps its blueprint, JD, status and
-- locked_at; its version only rises, by one per question retired. api_service has no TRUNCATE.
CREATE FUNCTION core.questions_locked_bank_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_locked boolean := false;
  new_locked boolean := false;
BEGIN
  -- FOR SHARE waits for a lock of the bank in progress (and holds one back until commit), so a
  -- question cannot slip into a bank that another transaction is locking.
  IF TG_OP <> 'INSERT' THEN
    SELECT status = 'LOCKED' INTO old_locked FROM core.question_banks WHERE id = OLD.bank_id FOR SHARE;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status = 'LOCKED' INTO new_locked FROM core.question_banks WHERE id = NEW.bank_id FOR SHARE;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF coalesce(new_locked, false) THEN
      RAISE EXCEPTION 'question bank % is locked: INSERT into core.questions is not allowed', NEW.bank_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF coalesce(old_locked, false) THEN
      RAISE EXCEPTION 'question bank % is locked: DELETE from core.questions is not allowed', OLD.bank_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF coalesce(old_locked, false) OR coalesce(new_locked, false) THEN
    IF to_jsonb(NEW) - '{status,row_version,updated_at}'::text[]
       IS DISTINCT FROM to_jsonb(OLD) - '{status,row_version,updated_at}'::text[] THEN
      RAISE EXCEPTION 'question % of a locked bank: only its status may change', OLD.id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'VALIDATED' AND NEW.status = 'RETIRED') THEN
      RAISE EXCEPTION 'question % of a locked bank: % -> % is not allowed', OLD.id, OLD.status, NEW.status
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER questions_locked_bank_guard
  BEFORE INSERT OR UPDATE OR DELETE ON core.questions
  FOR EACH ROW EXECUTE FUNCTION core.questions_locked_bank_guard();
--> statement-breakpoint
CREATE FUNCTION core.question_banks_locked_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'LOCKED' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'question bank % is locked: DELETE is not allowed', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF to_jsonb(NEW) - '{version,row_version,updated_at}'::text[]
     IS DISTINCT FROM to_jsonb(OLD) - '{version,row_version,updated_at}'::text[] THEN
    RAISE EXCEPTION 'question bank % is locked: only its version may change', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.version < OLD.version THEN
    RAISE EXCEPTION 'question bank % is locked: version % may not go back to %', OLD.id, OLD.version, NEW.version
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER question_banks_locked_guard
  BEFORE UPDATE OR DELETE ON core.question_banks
  FOR EACH ROW EXECUTE FUNCTION core.question_banks_locked_guard();
--> statement-breakpoint
-- As for core.audit_logs (0001): keep the triggers firing under session_replication_role = replica.
ALTER TABLE core.questions ENABLE ALWAYS TRIGGER questions_locked_bank_guard;
--> statement-breakpoint
ALTER TABLE core.question_banks ENABLE ALWAYS TRIGGER question_banks_locked_guard;
--> statement-breakpoint
-- The Validator's verdicts are written once per draft (insert, on conflict do nothing), as
-- ai.llm_calls in 0008: take back the UPDATE and DELETE the default privileges of 0006 gave.
REVOKE UPDATE, DELETE ON ai.question_validations FROM ai_service;
--> statement-breakpoint
-- Missing cells stored before the Validator count no validated draft (MissingCell.validated).
UPDATE core.question_generation_runs
SET missing_cells = (
  SELECT jsonb_agg(cell || jsonb_build_object('validated', 0) ORDER BY position)
  FROM jsonb_array_elements(missing_cells) WITH ORDINALITY AS cells(cell, position)
)
WHERE missing_cells IS NOT NULL AND jsonb_array_length(missing_cells) > 0;
