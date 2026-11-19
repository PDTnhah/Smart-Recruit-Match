CREATE TABLE "core"."question_reviews" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."question_reviews_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"question_id" bigint NOT NULL,
	"bank_version" integer NOT NULL,
	"reviewer_id" bigint NOT NULL,
	"verdict" text NOT NULL,
	"reason" text,
	"reviewed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "question_reviews_verdict_check" CHECK ("core"."question_reviews"."verdict" in ('OK', 'ERROR')),
	CONSTRAINT "question_reviews_reason_check" CHECK ("core"."question_reviews"."verdict" <> 'ERROR' or btrim(coalesce("core"."question_reviews"."reason", '')) <> ''),
	CONSTRAINT "question_reviews_bank_version_check" CHECK ("core"."question_reviews"."bank_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "core"."question_reviews" ADD CONSTRAINT "question_reviews_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "core"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."question_reviews" ADD CONSTRAINT "question_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_reviews_question_id_idx" ON "core"."question_reviews" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_reviews_question_error_key" ON "core"."question_reviews" USING btree ("question_id") WHERE "core"."question_reviews"."verdict" = 'ERROR';