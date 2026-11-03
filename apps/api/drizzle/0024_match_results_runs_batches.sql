CREATE TABLE "core"."match_results" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."match_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"campaign_id" bigint NOT NULL,
	"student_id" bigint NOT NULL,
	"cv_id" bigint NOT NULL,
	"cv_version" integer NOT NULL,
	"jd_id" bigint NOT NULL,
	"jd_version" integer NOT NULL,
	"rules_version" text NOT NULL,
	"eligible" boolean NOT NULL,
	"ineligible_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"facts" jsonb NOT NULL,
	"criteria" jsonb,
	"skill_fit" numeric(5, 2),
	"skipped_by_prefilter" boolean DEFAULT false NOT NULL,
	"assessment" jsonb,
	"prompt_version" text,
	"model" text,
	"s_cv" numeric(5, 2),
	"scv_breakdown" jsonb,
	"needs_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_results_pair_versions_key" UNIQUE NULLS NOT DISTINCT("cv_id","jd_id","cv_version","jd_version","rules_version","prompt_version"),
	CONSTRAINT "match_results_versions_check" CHECK ("core"."match_results"."cv_version" > 0 and "core"."match_results"."jd_version" > 0),
	CONSTRAINT "match_results_eligible_check" CHECK ("core"."match_results"."eligible" = ("core"."match_results"."criteria" is not null) and "core"."match_results"."eligible" = ("core"."match_results"."skill_fit" is not null) and "core"."match_results"."eligible" = (jsonb_array_length("core"."match_results"."ineligible_reasons") = 0)),
	CONSTRAINT "match_results_skipped_check" CHECK (not "core"."match_results"."skipped_by_prefilter" or "core"."match_results"."eligible"),
	CONSTRAINT "match_results_llm_part_check" CHECK (("core"."match_results"."prompt_version" is null) = ("core"."match_results"."model" is null) and ("core"."match_results"."prompt_version" is null) = ("core"."match_results"."assessment" is null) and ("core"."match_results"."prompt_version" is null) = ("core"."match_results"."s_cv" is null) and ("core"."match_results"."s_cv" is null) = ("core"."match_results"."scv_breakdown" is null)),
	CONSTRAINT "match_results_llm_sent_check" CHECK ("core"."match_results"."prompt_version" is null or ("core"."match_results"."eligible" and not "core"."match_results"."skipped_by_prefilter")),
	CONSTRAINT "match_results_needs_review_check" CHECK (not "core"."match_results"."needs_review" or ("core"."match_results"."eligible" and "core"."match_results"."prompt_version" is null)),
	CONSTRAINT "match_results_s_cv_check" CHECK ("core"."match_results"."s_cv" between 0 and 100),
	CONSTRAINT "match_results_skill_fit_check" CHECK ("core"."match_results"."skill_fit" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "core"."match_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."match_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"campaign_id" bigint NOT NULL,
	"job_id" uuid,
	"dispatched_at" timestamp with time zone,
	"status" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" bigint,
	"rules_version" text NOT NULL,
	"prompt_version" text,
	"pairs_total" integer NOT NULL,
	"pairs_ineligible" integer NOT NULL,
	"pairs_skipped" integer NOT NULL,
	"pairs_cached" integer NOT NULL,
	"pairs_sent" integer NOT NULL,
	"pairs_scored" integer DEFAULT 0 NOT NULL,
	"pairs_failed" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "match_runs_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "match_runs_status_check" CHECK ("core"."match_runs"."status" in ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED')),
	CONSTRAINT "match_runs_actor_kind_check" CHECK ("core"."match_runs"."actor_kind" in ('USER', 'SYSTEM')),
	CONSTRAINT "match_runs_finished_check" CHECK (("core"."match_runs"."status" = 'RUNNING') = ("core"."match_runs"."finished_at" is null)),
	CONSTRAINT "match_runs_actor_check" CHECK (("core"."match_runs"."actor_kind" = 'USER') = ("core"."match_runs"."actor_id" is not null)),
	CONSTRAINT "match_runs_job_check" CHECK (("core"."match_runs"."job_id" is null) = ("core"."match_runs"."pairs_sent" = 0)),
	CONSTRAINT "match_runs_dispatched_check" CHECK ("core"."match_runs"."dispatched_at" is null or "core"."match_runs"."job_id" is not null),
	CONSTRAINT "match_runs_failed_check" CHECK ("core"."match_runs"."status" <> 'FAILED' or "core"."match_runs"."error_code" is not null),
	CONSTRAINT "match_runs_counts_check" CHECK (least("core"."match_runs"."pairs_total", "core"."match_runs"."pairs_ineligible", "core"."match_runs"."pairs_skipped", "core"."match_runs"."pairs_cached", "core"."match_runs"."pairs_sent", "core"."match_runs"."pairs_scored", "core"."match_runs"."pairs_failed") >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai"."llm_batches" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai"."llm_batches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"job_payload" jsonb NOT NULL,
	"agent" text NOT NULL,
	"prompt_version" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"round" integer NOT NULL,
	"part" integer NOT NULL,
	"status" text NOT NULL,
	"provider_batch_id" text,
	"request_count" integer NOT NULL,
	"failures" jsonb,
	"error_message" text,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"next_poll_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "llm_batches_job_round_part_key" UNIQUE("job_id","round","part"),
	CONSTRAINT "llm_batches_provider_batch_key" UNIQUE("provider","provider_batch_id"),
	CONSTRAINT "llm_batches_job_type_check" CHECK ("ai"."llm_batches"."job_type" in ('CV_PARSE', 'JD_ANALYZE', 'SKILL_NORMALIZE', 'MATCH')),
	CONSTRAINT "llm_batches_status_check" CHECK ("ai"."llm_batches"."status" in ('PREPARING', 'SUBMITTED', 'PROCESSED', 'FAILED')),
	CONSTRAINT "llm_batches_provider_check" CHECK ("ai"."llm_batches"."provider" in ('GEMINI', 'ANTHROPIC', 'FIXTURE')),
	CONSTRAINT "llm_batches_prompt_version_check" CHECK ("ai"."llm_batches"."prompt_version" ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$'),
	CONSTRAINT "llm_batches_round_check" CHECK ("ai"."llm_batches"."round" between 1 and 3),
	CONSTRAINT "llm_batches_part_check" CHECK ("ai"."llm_batches"."part" >= 1),
	CONSTRAINT "llm_batches_request_count_check" CHECK ("ai"."llm_batches"."request_count" > 0),
	CONSTRAINT "llm_batches_provider_batch_id_check" CHECK ("ai"."llm_batches"."status" = 'FAILED' or ("ai"."llm_batches"."status" = 'PREPARING') = ("ai"."llm_batches"."provider_batch_id" is null)),
	CONSTRAINT "llm_batches_finished_check" CHECK (("ai"."llm_batches"."status" in ('PROCESSED', 'FAILED')) = ("ai"."llm_batches"."finished_at" is not null)),
	CONSTRAINT "llm_batches_error_check" CHECK ("ai"."llm_batches"."status" <> 'FAILED' or "ai"."llm_batches"."error_message" is not null)
);
--> statement-breakpoint
ALTER TABLE "ai"."jobs" DROP CONSTRAINT "jobs_type_check";--> statement-breakpoint
ALTER TABLE "ai"."llm_calls" ADD COLUMN "batch_id" bigint;--> statement-breakpoint
ALTER TABLE "core"."match_results" ADD CONSTRAINT "match_results_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "core"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."match_results" ADD CONSTRAINT "match_results_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."match_results" ADD CONSTRAINT "match_results_cv_id_cvs_id_fk" FOREIGN KEY ("cv_id") REFERENCES "core"."cvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."match_results" ADD CONSTRAINT "match_results_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "core"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."match_runs" ADD CONSTRAINT "match_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "core"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."match_runs" ADD CONSTRAINT "match_runs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai"."llm_batches" ADD CONSTRAINT "llm_batches_job_id_jobs_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "ai"."jobs"("job_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_results_jd_id_s_cv_idx" ON "core"."match_results" USING btree ("jd_id","s_cv" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "match_results_campaign_id_idx" ON "core"."match_results" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_runs_campaign_running_key" ON "core"."match_runs" USING btree ("campaign_id") WHERE "core"."match_runs"."status" = 'RUNNING';--> statement-breakpoint
CREATE INDEX "match_runs_campaign_id_idx" ON "core"."match_runs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "llm_batches_due_idx" ON "ai"."llm_batches" USING btree ("next_poll_at") WHERE "ai"."llm_batches"."status" in ('PREPARING', 'SUBMITTED');--> statement-breakpoint
ALTER TABLE "ai"."llm_calls" ADD CONSTRAINT "llm_calls_batch_id_llm_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "ai"."llm_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_calls_batch_id_idx" ON "ai"."llm_calls" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "ai"."jobs" ADD CONSTRAINT "jobs_type_check" CHECK ("ai"."jobs"."type" in ('CV_PARSE', 'JD_ANALYZE', 'SKILL_NORMALIZE', 'MATCH'));