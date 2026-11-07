CREATE TABLE "ai"."question_validations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai"."question_validations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"draft_id" bigint NOT NULL,
	"job_id" uuid NOT NULL,
	"status" text NOT NULL,
	"reasons" text[] NOT NULL,
	"verdict" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_validations_draft_id_key" UNIQUE("draft_id"),
	CONSTRAINT "question_validations_status_check" CHECK ("ai"."question_validations"."status" in ('VALIDATED', 'REJECTED')),
	CONSTRAINT "question_validations_reasons_check" CHECK ("ai"."question_validations"."reasons" <@ array['ANSWER_MISMATCH', 'MULTIPLE_CORRECT', 'OFF_SKILL', 'ANSWER_LEAKED', 'WEAK_DISTRACTORS', 'UNCLEAR', 'RUBRIC_MISMATCH', 'DIFFICULTY_MISMATCH', 'DUPLICATE', 'VALIDATOR_REFUSAL']::text[]),
	CONSTRAINT "question_validations_rejected_check" CHECK (("ai"."question_validations"."status" = 'REJECTED') = (cardinality("ai"."question_validations"."reasons") > 0)),
	CONSTRAINT "question_validations_prompt_version_check" CHECK ("ai"."question_validations"."prompt_version" ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$')
);
--> statement-breakpoint
ALTER TABLE "core"."questions" DROP CONSTRAINT "questions_status_check";--> statement-breakpoint
ALTER TABLE "core"."question_banks" ADD COLUMN "status" text DEFAULT 'OPEN' NOT NULL;--> statement-breakpoint
-- Hand-added: a bank locked before the status column existed is LOCKED (question_banks_locked_check).
UPDATE "core"."question_banks" SET "status" = 'LOCKED' WHERE "locked_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."questions" ADD COLUMN "validation" jsonb;--> statement-breakpoint
ALTER TABLE "ai"."question_validations" ADD CONSTRAINT "question_validations_draft_id_question_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "ai"."question_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai"."question_validations" ADD CONSTRAINT "question_validations_job_id_jobs_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "ai"."jobs"("job_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_validations_job_id_idx" ON "ai"."question_validations" USING btree ("job_id");--> statement-breakpoint
ALTER TABLE "core"."question_banks" ADD CONSTRAINT "question_banks_status_check" CHECK ("core"."question_banks"."status" in ('OPEN', 'LOCKED'));--> statement-breakpoint
ALTER TABLE "core"."question_banks" ADD CONSTRAINT "question_banks_locked_check" CHECK (("core"."question_banks"."status" = 'LOCKED') = ("core"."question_banks"."locked_at" is not null));--> statement-breakpoint
ALTER TABLE "core"."questions" ADD CONSTRAINT "questions_validation_check" CHECK (("core"."questions"."status" = 'DRAFT') = ("core"."questions"."validation" is null));--> statement-breakpoint
ALTER TABLE "core"."questions" ADD CONSTRAINT "questions_status_check" CHECK ("core"."questions"."status" in ('DRAFT', 'VALIDATED', 'REJECTED', 'RETIRED'));