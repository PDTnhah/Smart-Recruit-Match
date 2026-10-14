ALTER TABLE "core"."users" ADD COLUMN "invitation_nonce" text;--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD COLUMN "work_mode" text;--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD COLUMN "internship_period" text;--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD COLUMN "allowance" text;--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD CONSTRAINT "job_descriptions_work_mode_check" CHECK ("core"."job_descriptions"."work_mode" in ('ONSITE', 'HYBRID', 'REMOTE'));--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD CONSTRAINT "job_descriptions_file_pair_check" CHECK (("core"."job_descriptions"."file_key" is null) = ("core"."job_descriptions"."file_name" is null));