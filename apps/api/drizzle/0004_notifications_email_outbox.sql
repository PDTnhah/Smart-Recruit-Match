CREATE TABLE "core"."notifications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"channels" text[] NOT NULL,
	"read_at" timestamp with time zone,
	"dedupe_key" text,
	"email_status" text,
	"email_attempts" integer DEFAULT 0 NOT NULL,
	"email_next_attempt_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone,
	"email_last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_user_id_dedupe_key_key" UNIQUE("user_id","dedupe_key"),
	CONSTRAINT "notifications_type_check" CHECK ("core"."notifications"."type" in ('CAMPAIGN_OPENED', 'HR_INVITED', 'DEADLINE_REMINDER')),
	CONSTRAINT "notifications_email_status_check" CHECK ("core"."notifications"."email_status" in ('PENDING', 'SENT', 'FAILED', 'CANCELLED')),
	CONSTRAINT "notifications_channels_check" CHECK (cardinality("core"."notifications"."channels") > 0 and "core"."notifications"."channels" <@ array['IN_APP', 'EMAIL']::text[]),
	CONSTRAINT "notifications_email_status_channel_check" CHECK (('EMAIL' = any("core"."notifications"."channels")) = ("core"."notifications"."email_status" is not null)),
	CONSTRAINT "notifications_email_attempts_check" CHECK ("core"."notifications"."email_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "core"."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_id_read_at_idx" ON "core"."notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_email_outbox_idx" ON "core"."notifications" USING btree ("email_next_attempt_at") WHERE "core"."notifications"."email_status" = 'PENDING';