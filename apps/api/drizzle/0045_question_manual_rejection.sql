ALTER TABLE "core"."questions" DROP CONSTRAINT "questions_validation_check";--> statement-breakpoint
ALTER TABLE "core"."questions" ADD COLUMN "manual_rejection" jsonb;--> statement-breakpoint
ALTER TABLE "core"."questions" ADD CONSTRAINT "questions_manual_rejection_check" CHECK ("core"."questions"."manual_rejection" is null or "core"."questions"."status" in ('REJECTED', 'RETIRED'));--> statement-breakpoint
ALTER TABLE "core"."questions" ADD CONSTRAINT "questions_validation_check" CHECK ("core"."questions"."status" = 'RETIRED' or ("core"."questions"."status" = 'REJECTED' and "core"."questions"."manual_rejection" is not null) or (("core"."questions"."status" = 'DRAFT') = ("core"."questions"."validation" is null) and ("core"."questions"."status" <> 'REJECTED' or "core"."questions"."validation" ->> 'status' = 'REJECTED')));--> statement-breakpoint
-- Hand-written below (drizzle-kit cannot express views with options, grants or triggers). US-4.11
-- AC-3, AC-4, AD-4, AGENTS › Invariant 11, CONTEXT D60.
-- The Test Generator reads why CENTER rejected questions by hand through this view, never the table:
-- the reasons only, by draft, and only while the bank is not locked, as core.v_ai_question_banks.
CREATE OR REPLACE VIEW core.v_ai_question_rejections WITH (security_barrier) AS
  SELECT q.bank_id, q.draft_id, jsonb_build_array(q.manual_rejection ->> 'reason') AS reasons
  FROM core.questions q
  JOIN core.question_banks b ON b.id = q.bank_id
  WHERE q.status = 'REJECTED' AND q.manual_rejection IS NOT NULL AND b.locked_at IS NULL;
--> statement-breakpoint
GRANT SELECT ON core.v_ai_question_rejections TO ai_service;
--> statement-breakpoint
-- CENTER rejecting a question of a locked bank retires it and records why in the same UPDATE: only
-- then may `manual_rejection` change, from none. Everything else of 0043 stays.
CREATE OR REPLACE FUNCTION core.questions_locked_bank_guard() RETURNS trigger
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
    IF to_jsonb(NEW) - '{status,row_version,updated_at,manual_rejection}'::text[]
       IS DISTINCT FROM to_jsonb(OLD) - '{status,row_version,updated_at,manual_rejection}'::text[] THEN
      RAISE EXCEPTION 'question % of a locked bank: only its status may change', OLD.id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status IN ('DRAFT', 'VALIDATED') AND NEW.status = 'RETIRED') THEN
      RAISE EXCEPTION 'question % of a locked bank: % -> % is not allowed', OLD.id, OLD.status, NEW.status
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.manual_rejection IS DISTINCT FROM OLD.manual_rejection
       AND NOT (OLD.manual_rejection IS NULL AND NEW.status = 'RETIRED' AND OLD.status IN ('DRAFT', 'VALIDATED')) THEN
      RAISE EXCEPTION 'question % of a locked bank: a rejection is recorded only when it is retired', OLD.id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
