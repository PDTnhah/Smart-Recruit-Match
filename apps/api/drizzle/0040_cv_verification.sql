CREATE TABLE "core"."cv_verification_questions" (
	"id" bigint PRIMARY KEY DEFAULT nextval('core.questions_id_seq') NOT NULL,
	"verification_id" bigint NOT NULL,
	"no" smallint NOT NULL,
	"stem" text NOT NULL,
	"claim_ref" jsonb NOT NULL,
	"claim_label" text NOT NULL,
	"answer" text,
	"evaluation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_verification_questions_verification_no_key" UNIQUE("verification_id","no"),
	CONSTRAINT "cv_verification_questions_no_check" CHECK ("core"."cv_verification_questions"."no" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "core"."cv_verifications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."cv_verifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"preference_id" bigint NOT NULL,
	"cv_id" bigint NOT NULL,
	"cv_version" integer NOT NULL,
	"jd_id" bigint NOT NULL,
	"question_count" smallint NOT NULL,
	"session_id" bigint,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"job_id" uuid NOT NULL,
	"dispatched_at" timestamp with time zone,
	"model" text,
	"prompt_version" text,
	"error_code" text,
	"evaluation_status" text,
	"evaluation_job_id" uuid,
	"evaluation_requested_at" timestamp with time zone,
	"evaluation_dispatched_at" timestamp with time zone,
	"evaluation_model" text,
	"evaluation_prompt_version" text,
	"evaluation_error_code" text,
	"trust_x100" integer,
	"trust_level" text,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_verifications_preference_id_key" UNIQUE("preference_id"),
	CONSTRAINT "cv_verifications_session_id_key" UNIQUE("session_id"),
	CONSTRAINT "cv_verifications_job_id_key" UNIQUE("job_id"),
	CONSTRAINT "cv_verifications_evaluation_job_id_key" UNIQUE("evaluation_job_id"),
	CONSTRAINT "cv_verifications_status_check" CHECK ("core"."cv_verifications"."status" in ('RUNNING', 'READY', 'FAILED')),
	CONSTRAINT "cv_verifications_evaluation_status_check" CHECK ("core"."cv_verifications"."evaluation_status" in ('RUNNING', 'DONE', 'FAILED')),
	CONSTRAINT "cv_verifications_trust_level_check" CHECK ("core"."cv_verifications"."trust_level" in ('HIGH', 'MEDIUM', 'LOW')),
	CONSTRAINT "cv_verifications_counts_check" CHECK ("core"."cv_verifications"."question_count" between 2 and 3 and "core"."cv_verifications"."cv_version" > 0),
	CONSTRAINT "cv_verifications_ready_check" CHECK ("core"."cv_verifications"."status" <> 'READY' or ("core"."cv_verifications"."model" is not null and "core"."cv_verifications"."prompt_version" is not null)),
	CONSTRAINT "cv_verifications_failed_check" CHECK ("core"."cv_verifications"."status" <> 'FAILED' or "core"."cv_verifications"."error_code" is not null),
	CONSTRAINT "cv_verifications_session_check" CHECK ("core"."cv_verifications"."session_id" is null or "core"."cv_verifications"."status" = 'READY'),
	CONSTRAINT "cv_verifications_evaluation_session_check" CHECK ("core"."cv_verifications"."evaluation_status" is null or "core"."cv_verifications"."session_id" is not null),
	CONSTRAINT "cv_verifications_evaluation_job_check" CHECK (("core"."cv_verifications"."evaluation_status" is null) = ("core"."cv_verifications"."evaluation_job_id" is null) and ("core"."cv_verifications"."evaluation_job_id" is null) = ("core"."cv_verifications"."evaluation_requested_at" is null)),
	CONSTRAINT "cv_verifications_evaluation_failed_check" CHECK ("core"."cv_verifications"."evaluation_status" is distinct from 'FAILED' or "core"."cv_verifications"."evaluation_error_code" is not null),
	CONSTRAINT "cv_verifications_trust_check" CHECK (("core"."cv_verifications"."evaluation_status" is not distinct from 'DONE') = ("core"."cv_verifications"."trust_x100" is not null) and ("core"."cv_verifications"."trust_x100" is null) = ("core"."cv_verifications"."trust_level" is null) and "core"."cv_verifications"."trust_x100" between 0 and 100),
	CONSTRAINT "cv_verifications_prompt_version_check" CHECK ("core"."cv_verifications"."prompt_version" ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$'),
	CONSTRAINT "cv_verifications_evaluation_prompt_version_check" CHECK ("core"."cv_verifications"."evaluation_prompt_version" ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$')
);
--> statement-breakpoint
ALTER TABLE "ai"."jobs" DROP CONSTRAINT "jobs_type_check";--> statement-breakpoint
ALTER TABLE "ai"."llm_batches" DROP CONSTRAINT "llm_batches_job_type_check";--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD COLUMN "verification_question_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."question_banks" ADD COLUMN "cv_verification_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."question_banks" ADD COLUMN "cv_verification_count" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."cv_verification_questions" ADD CONSTRAINT "cv_verification_questions_verification_id_cv_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "core"."cv_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."cv_verifications" ADD CONSTRAINT "cv_verifications_preference_id_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "core"."preferences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."cv_verifications" ADD CONSTRAINT "cv_verifications_cv_id_cvs_id_fk" FOREIGN KEY ("cv_id") REFERENCES "core"."cvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."cv_verifications" ADD CONSTRAINT "cv_verifications_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "core"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."cv_verifications" ADD CONSTRAINT "cv_verifications_session_id_exam_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "core"."exam_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."question_banks" ADD CONSTRAINT "question_banks_cv_verification_count_check" CHECK ("core"."question_banks"."cv_verification_count" between 2 and 3);--> statement-breakpoint
ALTER TABLE "ai"."jobs" ADD CONSTRAINT "jobs_type_check" CHECK ("ai"."jobs"."type" in ('CV_PARSE', 'JD_ANALYZE', 'SKILL_NORMALIZE', 'MATCH', 'QUESTIONS_GENERATE', 'ESSAY_GRADE', 'CV_VERIFY_GENERATE', 'CV_VERIFY_EVALUATE'));--> statement-breakpoint
ALTER TABLE "ai"."llm_batches" ADD CONSTRAINT "llm_batches_job_type_check" CHECK ("ai"."llm_batches"."job_type" in ('CV_PARSE', 'JD_ANALYZE', 'SKILL_NORMALIZE', 'MATCH', 'QUESTIONS_GENERATE', 'ESSAY_GRADE', 'CV_VERIFY_GENERATE', 'CV_VERIFY_EVALUATE'));