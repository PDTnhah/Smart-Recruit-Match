CREATE TABLE "core"."essay_grading_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."essay_grading_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"campaign_id" bigint NOT NULL,
	"job_id" uuid NOT NULL,
	"dispatched_at" timestamp with time zone,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" bigint,
	"session_count" integer NOT NULL,
	"prompt_version" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "essay_grading_runs_job_id_key" UNIQUE("job_id"),
	CONSTRAINT "essay_grading_runs_status_check" CHECK ("core"."essay_grading_runs"."status" in ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'STALE')),
	CONSTRAINT "essay_grading_runs_actor_kind_check" CHECK ("core"."essay_grading_runs"."actor_kind" in ('USER', 'SYSTEM')),
	CONSTRAINT "essay_grading_runs_finished_check" CHECK (("core"."essay_grading_runs"."status" = 'RUNNING') = ("core"."essay_grading_runs"."finished_at" is null)),
	CONSTRAINT "essay_grading_runs_actor_check" CHECK (("core"."essay_grading_runs"."actor_kind" = 'USER') = ("core"."essay_grading_runs"."actor_id" is not null)),
	CONSTRAINT "essay_grading_runs_error_check" CHECK ("core"."essay_grading_runs"."status" not in ('FAILED', 'STALE') or "core"."essay_grading_runs"."error_code" is not null),
	CONSTRAINT "essay_grading_runs_session_count_check" CHECK ("core"."essay_grading_runs"."session_count" > 0),
	CONSTRAINT "essay_grading_runs_prompt_version_check" CHECK ("core"."essay_grading_runs"."prompt_version" ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$')
);
--> statement-breakpoint
ALTER TABLE "core"."notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "core"."preferences" ADD COLUMN "s_final" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD COLUMN "auto_score" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD COLUMN "ai_grading" jsonb;--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD COLUMN "needs_human" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD COLUMN "needs_human_reasons" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD COLUMN "final_score" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD COLUMN "essay_run_id" bigint;--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD COLUMN "score_a" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD COLUMN "score_b" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD COLUMN "s_test" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD COLUMN "skill_scores" jsonb;--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD COLUMN "flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD COLUMN "results_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."essay_grading_runs" ADD CONSTRAINT "essay_grading_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "core"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."essay_grading_runs" ADD CONSTRAINT "essay_grading_runs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "essay_grading_runs_campaign_id_status_idx" ON "core"."essay_grading_runs" USING btree ("campaign_id","status");--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD CONSTRAINT "exam_sessions_essay_run_id_essay_grading_runs_id_fk" FOREIGN KEY ("essay_run_id") REFERENCES "core"."essay_grading_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_answers_needs_human_idx" ON "core"."exam_answers" USING btree ("session_id") WHERE "core"."exam_answers"."needs_human" and "core"."exam_answers"."final_score" is null;--> statement-breakpoint
CREATE INDEX "exam_sessions_unpublished_bank_idx" ON "core"."exam_sessions" USING btree ("bank_id") WHERE "core"."exam_sessions"."results_published_at" is null;--> statement-breakpoint
ALTER TABLE "core"."notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("core"."notifications"."type" in ('CAMPAIGN_OPENED', 'HR_INVITED', 'DEADLINE_REMINDER', 'JD_REQUIREMENTS_READY', 'JD_ANALYSIS_FAILED', 'JD_REQUIREMENTS_VERSIONED', 'CV_PROFILE_READY', 'CV_ANALYSIS_FAILED', 'CV_NEEDS_ATTENTION', 'PREFERENCES_AUTO_ASSIGNED', 'JD_LOW_PREFERENCES', 'EXAM_NOT_TAKEN', 'EXAM_RESULT_PUBLISHED'));--> statement-breakpoint
ALTER TABLE "core"."preferences" ADD CONSTRAINT "preferences_s_final_check" CHECK ("core"."preferences"."s_final" between 0 and 100);--> statement-breakpoint
ALTER TABLE "core"."preferences" ADD CONSTRAINT "preferences_s_final_status_check" CHECK (("core"."preferences"."status" <> 'PENDING_TEST' or "core"."preferences"."s_final" is null) and ("core"."preferences"."status" <> 'TEST_GRADED' or "core"."preferences"."s_final" is not null));--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD CONSTRAINT "exam_answers_scores_check" CHECK ("core"."exam_answers"."auto_score" >= 0 and "core"."exam_answers"."final_score" >= 0);--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD CONSTRAINT "exam_answers_needs_human_reasons_check" CHECK ("core"."exam_answers"."needs_human_reasons" <@ array['RUNS_DIVERGE', 'LOW_CONFIDENCE', 'FLAGGED', 'AI_FAILED', 'NEAR_THRESHOLD']::text[]);--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD CONSTRAINT "exam_answers_needs_human_check" CHECK ("core"."exam_answers"."needs_human" = (cardinality("core"."exam_answers"."needs_human_reasons") > 0));--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD CONSTRAINT "exam_sessions_scores_check" CHECK ("core"."exam_sessions"."score_a" between 0 and 100 and "core"."exam_sessions"."score_b" between 0 and 100 and "core"."exam_sessions"."s_test" between 0 and 100);--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD CONSTRAINT "exam_sessions_results_check" CHECK (("core"."exam_sessions"."results_published_at" is null) = ("core"."exam_sessions"."s_test" is null) and ("core"."exam_sessions"."s_test" is null) = ("core"."exam_sessions"."score_a" is null) and ("core"."exam_sessions"."s_test" is null) = ("core"."exam_sessions"."score_b" is null) and ("core"."exam_sessions"."s_test" is null) = ("core"."exam_sessions"."skill_scores" is null));--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD CONSTRAINT "exam_sessions_results_closed_check" CHECK ("core"."exam_sessions"."results_published_at" is null or "core"."exam_sessions"."status" <> 'IN_PROGRESS');--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD CONSTRAINT "exam_sessions_flags_check" CHECK (jsonb_typeof("core"."exam_sessions"."flags") = 'array');