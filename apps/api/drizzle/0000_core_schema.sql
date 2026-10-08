CREATE SCHEMA "core";
--> statement-breakpoint
CREATE TABLE "core"."campaigns" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."campaigns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"phase_deadlines" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_status_check" CHECK ("core"."campaigns"."status" in ('DRAFT', 'INTAKE', 'PREFERENCE_SELECTION', 'TESTING', 'ALLOCATION_REVIEW', 'SUPPLEMENTARY', 'CLOSED'))
);
--> statement-breakpoint
CREATE TABLE "core"."companies" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."companies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"field" text,
	"address" text,
	"contact" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."students" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."students_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_code" text NOT NULL,
	"full_name" text NOT NULL,
	"major" text,
	"cohort" text,
	"gpa" numeric(4, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_student_code_unique" UNIQUE("student_code"),
	CONSTRAINT "students_gpa_check" CHECK ("core"."students"."gpa" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "core"."users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"password_hash" text,
	"full_name" text,
	"role" text NOT NULL,
	"company_id" bigint,
	"student_id" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_student_id_unique" UNIQUE("student_id"),
	CONSTRAINT "users_role_check" CHECK ("core"."users"."role" in ('CENTER', 'STUDENT', 'HR', 'ADMIN')),
	CONSTRAINT "users_email_lowercase_check" CHECK ("core"."users"."email" = lower("core"."users"."email")),
	CONSTRAINT "users_hr_company_check" CHECK (("core"."users"."role" = 'HR') = ("core"."users"."company_id" is not null)),
	CONSTRAINT "users_student_link_check" CHECK (("core"."users"."role" = 'STUDENT') = ("core"."users"."student_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "core"."job_descriptions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."job_descriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"campaign_id" bigint NOT NULL,
	"company_id" bigint NOT NULL,
	"title" text NOT NULL,
	"position_group" text,
	"raw_text" text,
	"file_key" text,
	"requirements" jsonb,
	"quota" integer NOT NULL,
	"exam_blueprint" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_descriptions_status_check" CHECK ("core"."job_descriptions"."status" in ('DRAFT', 'PENDING_HR_CONFIRMATION', 'PENDING_APPROVAL', 'APPROVED', 'RECRUITING', 'FILLED', 'CLOSED')),
	CONSTRAINT "job_descriptions_quota_check" CHECK ("core"."job_descriptions"."quota" > 0)
);
--> statement-breakpoint
CREATE TABLE "core"."cvs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."cvs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"campaign_id" bigint NOT NULL,
	"file_key" text NOT NULL,
	"profile" jsonb,
	"profile_masked" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'PENDING_ANALYSIS' NOT NULL,
	"hidden_text_flag" boolean DEFAULT false NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cvs_status_check" CHECK ("core"."cvs"."status" in ('PENDING_ANALYSIS', 'PENDING_CONFIRMATION', 'CONFIRMED'))
);
--> statement-breakpoint
CREATE TABLE "core"."audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_kind" text NOT NULL,
	"actor_id" bigint,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_actor_kind_check" CHECK ("core"."audit_logs"."actor_kind" in ('USER', 'SYSTEM')),
	CONSTRAINT "audit_logs_actor_id_check" CHECK (("core"."audit_logs"."actor_kind" = 'USER') = ("core"."audit_logs"."actor_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD CONSTRAINT "job_descriptions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "core"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."job_descriptions" ADD CONSTRAINT "job_descriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD CONSTRAINT "cvs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD CONSTRAINT "cvs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "core"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_company_id_idx" ON "core"."users" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "job_descriptions_campaign_id_status_idx" ON "core"."job_descriptions" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "job_descriptions_company_id_idx" ON "core"."job_descriptions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "core"."audit_logs" USING btree ("entity","entity_id","at");