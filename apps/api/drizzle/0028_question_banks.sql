CREATE TABLE "core"."question_banks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."question_banks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"campaign_id" bigint NOT NULL,
	"jd_id" bigint NOT NULL,
	"jd_version" integer NOT NULL,
	"blueprint" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"locked_at" timestamp with time zone,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_banks_jd_id_key" UNIQUE("jd_id"),
	CONSTRAINT "question_banks_versions_check" CHECK ("core"."question_banks"."jd_version" > 0 and "core"."question_banks"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "core"."question_generation_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."question_generation_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bank_id" bigint NOT NULL,
	"job_id" uuid NOT NULL,
	"dispatched_at" timestamp with time zone,
	"status" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" bigint,
	"missing_cells" jsonb,
	"questions_received" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "question_generation_runs_job_id_key" UNIQUE("job_id"),
	CONSTRAINT "question_generation_runs_status_check" CHECK ("core"."question_generation_runs"."status" in ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED')),
	CONSTRAINT "question_generation_runs_actor_kind_check" CHECK ("core"."question_generation_runs"."actor_kind" in ('USER', 'SYSTEM')),
	CONSTRAINT "question_generation_runs_finished_check" CHECK (("core"."question_generation_runs"."status" = 'RUNNING') = ("core"."question_generation_runs"."finished_at" is null)),
	CONSTRAINT "question_generation_runs_actor_check" CHECK (("core"."question_generation_runs"."actor_kind" = 'USER') = ("core"."question_generation_runs"."actor_id" is not null)),
	CONSTRAINT "question_generation_runs_failed_check" CHECK ("core"."question_generation_runs"."status" <> 'FAILED' or "core"."question_generation_runs"."error_code" is not null),
	CONSTRAINT "question_generation_runs_received_check" CHECK ("core"."question_generation_runs"."questions_received" >= 0)
);
--> statement-breakpoint
CREATE TABLE "core"."questions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."questions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bank_id" bigint NOT NULL,
	"draft_id" bigint NOT NULL,
	"type" text NOT NULL,
	"skill" text NOT NULL,
	"difficulty" text NOT NULL,
	"content" jsonb NOT NULL,
	"answer_key" jsonb NOT NULL,
	"rubric" jsonb,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_draft_id_key" UNIQUE("draft_id"),
	CONSTRAINT "questions_type_check" CHECK ("core"."questions"."type" in ('MCQ', 'ESSAY')),
	CONSTRAINT "questions_difficulty_check" CHECK ("core"."questions"."difficulty" in ('EASY', 'MEDIUM', 'HARD')),
	CONSTRAINT "questions_status_check" CHECK ("core"."questions"."status" in ('DRAFT')),
	CONSTRAINT "questions_rubric_check" CHECK (("core"."questions"."type" = 'ESSAY') = ("core"."questions"."rubric" is not null)),
	CONSTRAINT "questions_version_check" CHECK ("core"."questions"."version" > 0),
	CONSTRAINT "questions_prompt_version_check" CHECK ("core"."questions"."prompt_version" ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$')
);
--> statement-breakpoint
CREATE TABLE "ai"."question_drafts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai"."question_drafts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bank_id" bigint NOT NULL,
	"job_id" uuid NOT NULL,
	"type" text NOT NULL,
	"skill" text NOT NULL,
	"skill_key" text NOT NULL,
	"difficulty" text NOT NULL,
	"stem_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_drafts_bank_stem_key" UNIQUE("bank_id","stem_key"),
	CONSTRAINT "question_drafts_type_check" CHECK ("ai"."question_drafts"."type" in ('MCQ', 'ESSAY')),
	CONSTRAINT "question_drafts_difficulty_check" CHECK ("ai"."question_drafts"."difficulty" in ('EASY', 'MEDIUM', 'HARD')),
	CONSTRAINT "question_drafts_prompt_version_check" CHECK ("ai"."question_drafts"."prompt_version" ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$')
);
--> statement-breakpoint
ALTER TABLE "ai"."jobs" DROP CONSTRAINT "jobs_type_check";--> statement-breakpoint
ALTER TABLE "ai"."llm_batches" DROP CONSTRAINT "llm_batches_job_type_check";--> statement-breakpoint
ALTER TABLE "core"."question_banks" ADD CONSTRAINT "question_banks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "core"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."question_banks" ADD CONSTRAINT "question_banks_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "core"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."question_generation_runs" ADD CONSTRAINT "question_generation_runs_bank_id_question_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "core"."question_banks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."question_generation_runs" ADD CONSTRAINT "question_generation_runs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."questions" ADD CONSTRAINT "questions_bank_id_question_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "core"."question_banks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai"."question_drafts" ADD CONSTRAINT "question_drafts_job_id_jobs_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "ai"."jobs"("job_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_banks_campaign_id_idx" ON "core"."question_banks" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_generation_runs_bank_running_key" ON "core"."question_generation_runs" USING btree ("bank_id") WHERE "core"."question_generation_runs"."status" = 'RUNNING';--> statement-breakpoint
CREATE INDEX "question_generation_runs_bank_id_idx" ON "core"."question_generation_runs" USING btree ("bank_id");--> statement-breakpoint
CREATE INDEX "questions_bank_cell_status_idx" ON "core"."questions" USING btree ("bank_id","skill","difficulty","status");--> statement-breakpoint
CREATE INDEX "question_drafts_job_id_idx" ON "ai"."question_drafts" USING btree ("job_id");--> statement-breakpoint
ALTER TABLE "ai"."jobs" ADD CONSTRAINT "jobs_type_check" CHECK ("ai"."jobs"."type" in ('CV_PARSE', 'JD_ANALYZE', 'SKILL_NORMALIZE', 'MATCH', 'QUESTIONS_GENERATE'));--> statement-breakpoint
ALTER TABLE "ai"."llm_batches" ADD CONSTRAINT "llm_batches_job_type_check" CHECK ("ai"."llm_batches"."job_type" in ('CV_PARSE', 'JD_ANALYZE', 'SKILL_NORMALIZE', 'MATCH', 'QUESTIONS_GENERATE'));