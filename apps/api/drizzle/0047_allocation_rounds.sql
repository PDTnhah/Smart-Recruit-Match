CREATE TABLE "core"."allocation_rounds" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."allocation_rounds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"campaign_id" bigint NOT NULL,
	"round_no" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"engine_result" jsonb NOT NULL,
	"adjustments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ran_at" timestamp with time zone NOT NULL,
	"ran_by" bigint,
	"published_at" timestamp with time zone,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_rounds_campaign_round_key" UNIQUE("campaign_id","round_no"),
	CONSTRAINT "allocation_rounds_status_check" CHECK ("core"."allocation_rounds"."status" in ('DRAFT', 'PUBLISHED')),
	CONSTRAINT "allocation_rounds_round_no_check" CHECK ("core"."allocation_rounds"."round_no" >= 1),
	CONSTRAINT "allocation_rounds_published_check" CHECK (("core"."allocation_rounds"."status" = 'PUBLISHED') = ("core"."allocation_rounds"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "core"."nominations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."nominations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"round_id" bigint NOT NULL,
	"campaign_id" bigint NOT NULL,
	"student_id" bigint NOT NULL,
	"jd_id" bigint NOT NULL,
	"preference_id" bigint NOT NULL,
	"s_final" numeric(5, 2) NOT NULL,
	"rank" integer NOT NULL,
	"status" text DEFAULT 'NOMINATED' NOT NULL,
	"override_reason" text,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nominations_round_student_key" UNIQUE("round_id","student_id"),
	CONSTRAINT "nominations_status_check" CHECK ("core"."nominations"."status" in ('NOMINATED', 'INTERVIEW', 'HR_REJECTED', 'PASSED', 'RESERVE', 'INTERVIEW_FAILED', 'ACCEPTED', 'DECLINED', 'CLOSED')),
	CONSTRAINT "nominations_s_final_check" CHECK ("core"."nominations"."s_final" between 0 and 100),
	CONSTRAINT "nominations_rank_check" CHECK ("core"."nominations"."rank" >= 1),
	CONSTRAINT "nominations_override_reason_check" CHECK ("core"."nominations"."override_reason" is null or length(trim("core"."nominations"."override_reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "core"."notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "core"."allocation_rounds" ADD CONSTRAINT "allocation_rounds_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "core"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."allocation_rounds" ADD CONSTRAINT "allocation_rounds_ran_by_users_id_fk" FOREIGN KEY ("ran_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."nominations" ADD CONSTRAINT "nominations_round_id_allocation_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "core"."allocation_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."nominations" ADD CONSTRAINT "nominations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "core"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."nominations" ADD CONSTRAINT "nominations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."nominations" ADD CONSTRAINT "nominations_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "core"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."nominations" ADD CONSTRAINT "nominations_preference_id_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "core"."preferences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nominations_active_student_key" ON "core"."nominations" USING btree ("campaign_id","student_id") WHERE "core"."nominations"."status" in ('NOMINATED', 'INTERVIEW', 'PASSED', 'RESERVE');--> statement-breakpoint
CREATE INDEX "nominations_round_id_jd_id_idx" ON "core"."nominations" USING btree ("round_id","jd_id");--> statement-breakpoint
CREATE INDEX "nominations_jd_id_status_idx" ON "core"."nominations" USING btree ("jd_id","status");--> statement-breakpoint
ALTER TABLE "core"."notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("core"."notifications"."type" in ('CAMPAIGN_OPENED', 'HR_INVITED', 'DEADLINE_REMINDER', 'JD_REQUIREMENTS_READY', 'JD_ANALYSIS_FAILED', 'JD_REQUIREMENTS_VERSIONED', 'CV_PROFILE_READY', 'CV_ANALYSIS_FAILED', 'CV_NEEDS_ATTENTION', 'PREFERENCES_AUTO_ASSIGNED', 'JD_LOW_PREFERENCES', 'EXAM_NOT_TAKEN', 'EXAM_RESULT_PUBLISHED', 'CAMPAIGN_DEADLINES_CHANGED', 'CAMPAIGN_CANCELLED', 'NOMINATIONS_PUBLISHED'));