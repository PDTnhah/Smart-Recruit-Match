CREATE TABLE "core"."interviews" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."interviews_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nomination_id" bigint NOT NULL,
	"status" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"mode" text NOT NULL,
	"location" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"reschedule_requested_at" timestamp with time zone,
	"reschedule_note" text,
	"result" text,
	"result_note" text,
	"result_at" timestamp with time zone,
	"result_by" bigint,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "interviews_nomination_id_key" UNIQUE("nomination_id"),
	CONSTRAINT "interviews_status_check" CHECK ("core"."interviews"."status" in ('SCHEDULED', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'DONE')),
	CONSTRAINT "interviews_mode_check" CHECK ("core"."interviews"."mode" in ('ONLINE', 'OFFLINE')),
	CONSTRAINT "interviews_result_check" CHECK ("core"."interviews"."result" in ('PASSED', 'RESERVE', 'FAILED', 'ABSENT')),
	CONSTRAINT "interviews_location_check" CHECK (btrim("core"."interviews"."location") <> ''),
	CONSTRAINT "interviews_confirmed_check" CHECK ("core"."interviews"."status" <> 'CONFIRMED' or "core"."interviews"."confirmed_at" is not null),
	CONSTRAINT "interviews_reschedule_check" CHECK (("core"."interviews"."status" <> 'RESCHEDULE_REQUESTED' or "core"."interviews"."reschedule_requested_at" is not null) and ("core"."interviews"."reschedule_note" is null) = ("core"."interviews"."reschedule_requested_at" is null)),
	CONSTRAINT "interviews_result_done_check" CHECK (("core"."interviews"."status" = 'DONE') = ("core"."interviews"."result" is not null) and ("core"."interviews"."result" is null) = ("core"."interviews"."result_at" is null) and ("core"."interviews"."result" is null) = ("core"."interviews"."result_by" is null))
);
--> statement-breakpoint
CREATE TABLE "core"."offers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."offers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nomination_id" bigint NOT NULL,
	"status" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"row_version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "offers_nomination_id_key" UNIQUE("nomination_id"),
	CONSTRAINT "offers_status_check" CHECK ("core"."offers"."status" in ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED')),
	CONSTRAINT "offers_expires_check" CHECK ("core"."offers"."expires_at" > "core"."offers"."sent_at"),
	CONSTRAINT "offers_responded_check" CHECK (("core"."offers"."status" = 'PENDING') = ("core"."offers"."responded_at" is null))
);
--> statement-breakpoint
ALTER TABLE "core"."notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "core"."interviews" ADD CONSTRAINT "interviews_nomination_id_nominations_id_fk" FOREIGN KEY ("nomination_id") REFERENCES "core"."nominations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."interviews" ADD CONSTRAINT "interviews_result_by_users_id_fk" FOREIGN KEY ("result_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."interviews" ADD CONSTRAINT "interviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."offers" ADD CONSTRAINT "offers_nomination_id_nominations_id_fk" FOREIGN KEY ("nomination_id") REFERENCES "core"."nominations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offers_pending_expires_at_idx" ON "core"."offers" USING btree ("expires_at") WHERE "core"."offers"."status" = 'PENDING';--> statement-breakpoint
ALTER TABLE "core"."notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("core"."notifications"."type" in ('CAMPAIGN_OPENED', 'HR_INVITED', 'DEADLINE_REMINDER', 'JD_REQUIREMENTS_READY', 'JD_ANALYSIS_FAILED', 'JD_REQUIREMENTS_VERSIONED', 'CV_PROFILE_READY', 'CV_ANALYSIS_FAILED', 'CV_NEEDS_ATTENTION', 'PREFERENCES_AUTO_ASSIGNED', 'JD_LOW_PREFERENCES', 'EXAM_NOT_TAKEN', 'EXAM_RESULT_PUBLISHED', 'CAMPAIGN_DEADLINES_CHANGED', 'CAMPAIGN_CANCELLED', 'NOMINATIONS_PUBLISHED', 'HR_REVIEW_DUE_SOON', 'HR_REVIEW_OVERDUE', 'SUPPLEMENT_REQUESTED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_RESCHEDULED', 'INTERVIEW_RESCHEDULE_REQUESTED', 'INTERVIEW_RESULT', 'RESERVE_CLOSED', 'OFFER_ANSWERED'));