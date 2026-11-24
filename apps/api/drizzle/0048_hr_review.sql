CREATE TABLE "core"."hr_reviews" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."hr_reviews_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nomination_id" bigint NOT NULL,
	"reviewer_id" bigint NOT NULL,
	"decision" text NOT NULL,
	"reason_code" text,
	"note" text,
	"decided_at" timestamp with time zone NOT NULL,
	CONSTRAINT "hr_reviews_nomination_id_key" UNIQUE("nomination_id"),
	CONSTRAINT "hr_reviews_decision_check" CHECK ("core"."hr_reviews"."decision" in ('INVITE', 'REJECT')),
	CONSTRAINT "hr_reviews_reason_code_check" CHECK ("core"."hr_reviews"."reason_code" in ('MISSING_SKILLS', 'TEST_BELOW_EXPECTATION', 'POSITION_FILLED', 'OTHER')),
	CONSTRAINT "hr_reviews_reason_check" CHECK (("core"."hr_reviews"."decision" = 'REJECT') = ("core"."hr_reviews"."reason_code" is not null) and ("core"."hr_reviews"."decision" <> 'REJECT' or btrim(coalesce("core"."hr_reviews"."note", '')) <> ''))
);
--> statement-breakpoint
CREATE TABLE "core"."review_deadline_extensions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."review_deadline_extensions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"round_id" bigint NOT NULL,
	"jd_id" bigint NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"extended_by" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_deadline_extensions_reason_check" CHECK (btrim("core"."review_deadline_extensions"."reason") <> '')
);
--> statement-breakpoint
CREATE TABLE "core"."supplement_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."supplement_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"campaign_id" bigint NOT NULL,
	"jd_id" bigint NOT NULL,
	"round_id" bigint NOT NULL,
	"requested_by" bigint NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "supplement_requests_round_jd_key" UNIQUE("round_id","jd_id"),
	CONSTRAINT "supplement_requests_note_check" CHECK (btrim("core"."supplement_requests"."note") <> '')
);
--> statement-breakpoint
ALTER TABLE "core"."notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "core"."hr_reviews" ADD CONSTRAINT "hr_reviews_nomination_id_nominations_id_fk" FOREIGN KEY ("nomination_id") REFERENCES "core"."nominations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."hr_reviews" ADD CONSTRAINT "hr_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."review_deadline_extensions" ADD CONSTRAINT "review_deadline_extensions_round_id_allocation_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "core"."allocation_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."review_deadline_extensions" ADD CONSTRAINT "review_deadline_extensions_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "core"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."review_deadline_extensions" ADD CONSTRAINT "review_deadline_extensions_extended_by_users_id_fk" FOREIGN KEY ("extended_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."supplement_requests" ADD CONSTRAINT "supplement_requests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "core"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."supplement_requests" ADD CONSTRAINT "supplement_requests_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "core"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."supplement_requests" ADD CONSTRAINT "supplement_requests_round_id_allocation_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "core"."allocation_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."supplement_requests" ADD CONSTRAINT "supplement_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_deadline_extensions_round_jd_idx" ON "core"."review_deadline_extensions" USING btree ("round_id","jd_id");--> statement-breakpoint
ALTER TABLE "core"."notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("core"."notifications"."type" in ('CAMPAIGN_OPENED', 'HR_INVITED', 'DEADLINE_REMINDER', 'JD_REQUIREMENTS_READY', 'JD_ANALYSIS_FAILED', 'JD_REQUIREMENTS_VERSIONED', 'CV_PROFILE_READY', 'CV_ANALYSIS_FAILED', 'CV_NEEDS_ATTENTION', 'PREFERENCES_AUTO_ASSIGNED', 'JD_LOW_PREFERENCES', 'EXAM_NOT_TAKEN', 'EXAM_RESULT_PUBLISHED', 'CAMPAIGN_DEADLINES_CHANGED', 'CAMPAIGN_CANCELLED', 'NOMINATIONS_PUBLISHED', 'HR_REVIEW_DUE_SOON', 'HR_REVIEW_OVERDUE', 'SUPPLEMENT_REQUESTED'));