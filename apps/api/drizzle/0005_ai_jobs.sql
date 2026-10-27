CREATE SCHEMA "ai";
--> statement-breakpoint
CREATE TABLE "ai"."jobs" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "jobs_type_check" CHECK ("ai"."jobs"."type" in ('CV_PARSE', 'JD_ANALYZE')),
	CONSTRAINT "jobs_status_check" CHECK ("ai"."jobs"."status" in ('PROCESSING', 'SUCCEEDED', 'PARTIAL', 'FAILED')),
	CONSTRAINT "jobs_attempts_check" CHECK ("ai"."jobs"."attempts" >= 0),
	CONSTRAINT "jobs_finished_at_check" CHECK (("ai"."jobs"."status" = 'PROCESSING') = ("ai"."jobs"."finished_at" is null))
);
