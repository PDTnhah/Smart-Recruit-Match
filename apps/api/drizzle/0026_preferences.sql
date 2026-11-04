CREATE TABLE "core"."preferences" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."preferences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"campaign_id" bigint NOT NULL,
	"student_id" bigint NOT NULL,
	"jd_id" bigint NOT NULL,
	"rank" integer NOT NULL,
	"status" text DEFAULT 'PENDING_TEST' NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_campaign_student_rank_key" UNIQUE("campaign_id","student_id","rank"),
	CONSTRAINT "preferences_student_jd_key" UNIQUE("student_id","jd_id"),
	CONSTRAINT "preferences_rank_check" CHECK ("core"."preferences"."rank" >= 1),
	CONSTRAINT "preferences_status_check" CHECK ("core"."preferences"."status" in ('PENDING_TEST', 'TEST_GRADED', 'BELOW_THRESHOLD', 'WAITING_NEXT_ROUND', 'NOMINATED', 'INTERVIEW', 'HR_REJECTED', 'PASSED', 'RESERVE', 'INTERVIEW_FAILED', 'ACCEPTED', 'DECLINED', 'CLOSED'))
);
--> statement-breakpoint
ALTER TABLE "core"."notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "core"."preferences" ADD CONSTRAINT "preferences_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "core"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."preferences" ADD CONSTRAINT "preferences_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."preferences" ADD CONSTRAINT "preferences_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "core"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "preferences_jd_id_status_idx" ON "core"."preferences" USING btree ("jd_id","status");--> statement-breakpoint
ALTER TABLE "core"."notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("core"."notifications"."type" in ('CAMPAIGN_OPENED', 'HR_INVITED', 'DEADLINE_REMINDER', 'JD_REQUIREMENTS_READY', 'JD_ANALYSIS_FAILED', 'JD_REQUIREMENTS_VERSIONED', 'CV_PROFILE_READY', 'CV_ANALYSIS_FAILED', 'CV_NEEDS_ATTENTION', 'PREFERENCES_AUTO_ASSIGNED'));