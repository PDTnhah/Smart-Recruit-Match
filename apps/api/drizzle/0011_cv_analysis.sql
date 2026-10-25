ALTER TABLE "core"."cvs" DROP CONSTRAINT "cvs_status_check";--> statement-breakpoint
ALTER TABLE "core"."notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD COLUMN "pii" "bytea";--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD COLUMN "masked_text" text;--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD COLUMN "analysis_source" text;--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD COLUMN "analysis_model" text;--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD COLUMN "analysis_prompt_version" text;--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD COLUMN "analysis_error_code" text;--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD CONSTRAINT "cvs_analysis_source_check" CHECK ("core"."cvs"."analysis_source" in ('TEXT_PDF', 'SCANNED_PDF', 'DOCX'));--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD CONSTRAINT "cvs_analysis_model_check" CHECK (("core"."cvs"."analysis_model" is null) = ("core"."cvs"."analysis_prompt_version" is null));--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD CONSTRAINT "cvs_analysed_check" CHECK ("core"."cvs"."status" not in ('PENDING_CONFIRMATION', 'CONFIRMED') or ("core"."cvs"."profile" is not null and "core"."cvs"."profile_masked" is not null and "core"."cvs"."pii" is not null and "core"."cvs"."analysis_model" is not null and "core"."cvs"."analysis_source" is not null));--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD CONSTRAINT "cvs_analysis_failed_check" CHECK ("core"."cvs"."status" <> 'ANALYSIS_FAILED' or "core"."cvs"."analysis_error_code" is not null);--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD CONSTRAINT "cvs_status_check" CHECK ("core"."cvs"."status" in ('PENDING_ANALYSIS', 'PENDING_CONFIRMATION', 'CONFIRMED', 'ANALYSIS_FAILED'));--> statement-breakpoint
ALTER TABLE "core"."notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("core"."notifications"."type" in ('CAMPAIGN_OPENED', 'HR_INVITED', 'DEADLINE_REMINDER', 'JD_REQUIREMENTS_READY', 'JD_ANALYSIS_FAILED', 'JD_REQUIREMENTS_VERSIONED', 'CV_PROFILE_READY', 'CV_ANALYSIS_FAILED', 'CV_NEEDS_ATTENTION'));