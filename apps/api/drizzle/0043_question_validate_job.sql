ALTER TABLE "core"."questions" DROP CONSTRAINT "questions_validation_check";--> statement-breakpoint
ALTER TABLE "ai"."jobs" DROP CONSTRAINT "jobs_type_check";--> statement-breakpoint
ALTER TABLE "ai"."llm_batches" DROP CONSTRAINT "llm_batches_job_type_check";--> statement-breakpoint
ALTER TABLE "core"."question_generation_runs" ADD COLUMN "kind" text DEFAULT 'GENERATE' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."question_generation_runs" ADD CONSTRAINT "question_generation_runs_kind_check" CHECK ("core"."question_generation_runs"."kind" in ('GENERATE', 'VALIDATE'));--> statement-breakpoint
ALTER TABLE "core"."questions" ADD CONSTRAINT "questions_validation_check" CHECK ("core"."questions"."status" = 'RETIRED' or ("core"."questions"."status" = 'DRAFT') = ("core"."questions"."validation" is null));--> statement-breakpoint
ALTER TABLE "ai"."jobs" ADD CONSTRAINT "jobs_type_check" CHECK ("ai"."jobs"."type" in ('CV_PARSE', 'JD_ANALYZE', 'SKILL_NORMALIZE', 'MATCH', 'QUESTIONS_GENERATE', 'QUESTIONS_VALIDATE', 'ESSAY_GRADE', 'CV_VERIFY_GENERATE', 'CV_VERIFY_EVALUATE'));--> statement-breakpoint
ALTER TABLE "ai"."llm_batches" ADD CONSTRAINT "llm_batches_job_type_check" CHECK ("ai"."llm_batches"."job_type" in ('CV_PARSE', 'JD_ANALYZE', 'SKILL_NORMALIZE', 'MATCH', 'QUESTIONS_GENERATE', 'QUESTIONS_VALIDATE', 'ESSAY_GRADE', 'CV_VERIFY_GENERATE', 'CV_VERIFY_EVALUATE'));--> statement-breakpoint
-- Hand-written below (drizzle-kit cannot express triggers). US-4.10 AC-4, AGENTS › Invariant 11,
-- CONTEXT D60. An exam draws the DRAFT questions of a locked bank too, so a DRAFT one may be retired
-- after locking, like a VALIDATED one. Everything else of 0031 stays: only the status changes, and
-- only to RETIRED.
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
    IF to_jsonb(NEW) - '{status,row_version,updated_at}'::text[]
       IS DISTINCT FROM to_jsonb(OLD) - '{status,row_version,updated_at}'::text[] THEN
      RAISE EXCEPTION 'question % of a locked bank: only its status may change', OLD.id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status IN ('DRAFT', 'VALIDATED') AND NEW.status = 'RETIRED') THEN
      RAISE EXCEPTION 'question % of a locked bank: % -> % is not allowed', OLD.id, OLD.status, NEW.status
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Missing cells stored before US-4.10 counted VALIDATED drafts only (MissingCell.usable).
UPDATE core.question_generation_runs
SET missing_cells = (
  SELECT jsonb_agg(cell || jsonb_build_object('usable', cell -> 'validated') ORDER BY position)
  FROM jsonb_array_elements(missing_cells) WITH ORDINALITY AS cells(cell, position)
)
WHERE missing_cells IS NOT NULL AND jsonb_array_length(missing_cells) > 0;
