ALTER TABLE "core"."exam_answers" ADD COLUMN "id" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "core"."exam_answers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD COLUMN "manual_grading" jsonb;--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD COLUMN "graded_by" bigint;--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD COLUMN "graded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD COLUMN "row_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD CONSTRAINT "exam_answers_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD CONSTRAINT "exam_answers_id_key" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD CONSTRAINT "exam_answers_manual_check" CHECK (("core"."exam_answers"."manual_grading" is null) = ("core"."exam_answers"."graded_by" is null) and ("core"."exam_answers"."manual_grading" is null) = ("core"."exam_answers"."graded_at" is null));--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD CONSTRAINT "exam_answers_manual_final_check" CHECK ("core"."exam_answers"."manual_grading" is null or ("core"."exam_answers"."needs_human" and "core"."exam_answers"."final_score" is not null));