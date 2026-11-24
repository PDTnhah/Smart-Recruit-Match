ALTER TABLE "core"."questions" ALTER COLUMN "draft_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."questions" ALTER COLUMN "model" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."questions" ALTER COLUMN "prompt_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."questions" ADD COLUMN "source" text DEFAULT 'AI' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."questions" ADD COLUMN "created_by" bigint;--> statement-breakpoint
ALTER TABLE "core"."questions" ADD CONSTRAINT "questions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."questions" ADD CONSTRAINT "questions_source_check" CHECK ("core"."questions"."source" in ('AI', 'MANUAL'));--> statement-breakpoint
ALTER TABLE "core"."questions" ADD CONSTRAINT "questions_author_check" CHECK (("core"."questions"."source" = 'AI' and "core"."questions"."draft_id" is not null and "core"."questions"."model" is not null and "core"."questions"."prompt_version" is not null and "core"."questions"."created_by" is null) or ("core"."questions"."source" = 'MANUAL' and "core"."questions"."draft_id" is null and "core"."questions"."model" is null and "core"."questions"."prompt_version" is null and "core"."questions"."created_by" is not null and "core"."questions"."validation" is null));--> statement-breakpoint
-- Hand-written below (drizzle-kit cannot express views with options or grants). US-4.13 AC-8, AC-9,
-- AD-4, CONTEXT D62.
-- The Test Generator counts the questions CENTER and HR added by hand and checks its drafts against
-- them through this view, never the table: the cell, the stem and the status only (no answer key,
-- no author), and only while the bank is not locked, as core.v_ai_question_banks.
CREATE OR REPLACE VIEW core.v_ai_manual_questions WITH (security_barrier) AS
  SELECT q.bank_id, q.id AS question_id, q.type, q.skill, q.difficulty, q.content ->> 'stem' AS stem, q.status
  FROM core.questions q
  JOIN core.question_banks b ON b.id = q.bank_id
  WHERE q.source = 'MANUAL' AND b.locked_at IS NULL;
--> statement-breakpoint
GRANT SELECT ON core.v_ai_manual_questions TO ai_service;
--> statement-breakpoint
-- A question added by hand has no draft: the Test Generator reads its rejection through
-- core.v_ai_manual_questions, so this view keeps to AI questions (same columns as 0045).
CREATE OR REPLACE VIEW core.v_ai_question_rejections WITH (security_barrier) AS
  SELECT q.bank_id, q.draft_id, jsonb_build_array(q.manual_rejection ->> 'reason') AS reasons
  FROM core.questions q
  JOIN core.question_banks b ON b.id = q.bank_id
  WHERE q.source = 'AI' AND q.status = 'REJECTED' AND q.manual_rejection IS NOT NULL AND b.locked_at IS NULL;
