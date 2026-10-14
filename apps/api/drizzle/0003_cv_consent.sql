CREATE TABLE "core"."consents" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."consents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"campaign_id" bigint NOT NULL,
	"terms_version" integer NOT NULL,
	"terms_sha256" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "consents_student_campaign_terms_key" UNIQUE("student_id","campaign_id","terms_version"),
	CONSTRAINT "consents_terms_version_check" CHECK ("core"."consents"."terms_version" > 0),
	CONSTRAINT "consents_terms_sha256_check" CHECK ("core"."consents"."terms_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
-- Hand edit: rows from before US-1.6 get a placeholder name before the column becomes NOT NULL.
ALTER TABLE "core"."cvs" ADD COLUMN "file_name" text;--> statement-breakpoint
UPDATE "core"."cvs" SET "file_name" = 'cv' WHERE "file_name" IS NULL;--> statement-breakpoint
ALTER TABLE "core"."cvs" ALTER COLUMN "file_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."consents" ADD CONSTRAINT "consents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."consents" ADD CONSTRAINT "consents_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "core"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cvs_student_campaign_active_key" ON "core"."cvs" USING btree ("student_id","campaign_id") WHERE "core"."cvs"."active";--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD CONSTRAINT "cvs_student_campaign_version_key" UNIQUE("student_id","campaign_id","version");--> statement-breakpoint
ALTER TABLE "core"."cvs" ADD CONSTRAINT "cvs_version_check" CHECK ("core"."cvs"."version" > 0);