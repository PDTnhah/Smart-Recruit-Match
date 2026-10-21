ALTER TABLE "core"."notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD COLUMN "analysis_status" text;--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD COLUMN "analysis_model" text;--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD COLUMN "analysis_prompt_version" text;--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD COLUMN "hidden_text_flag" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD CONSTRAINT "job_descriptions_position_group_check" CHECK ("core"."job_descriptions"."position_group" in ('BACKEND', 'FRONTEND', 'MOBILE', 'DATA_AI', 'TESTER_QA', 'BA', 'DEVOPS', 'OTHER'));--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD CONSTRAINT "job_descriptions_analysis_status_check" CHECK ("core"."job_descriptions"."analysis_status" in ('PENDING', 'SUCCEEDED', 'FAILED'));--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD CONSTRAINT "job_descriptions_analysis_source_check" CHECK (("core"."job_descriptions"."analysis_model" is null) = ("core"."job_descriptions"."analysis_prompt_version" is null));--> statement-breakpoint
ALTER TABLE "core"."notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("core"."notifications"."type" in ('CAMPAIGN_OPENED', 'HR_INVITED', 'DEADLINE_REMINDER', 'JD_REQUIREMENTS_READY', 'JD_ANALYSIS_FAILED', 'JD_REQUIREMENTS_VERSIONED'));