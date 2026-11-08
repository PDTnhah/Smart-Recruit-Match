CREATE TABLE "core"."exam_answers" (
	"session_id" bigint NOT NULL,
	"question_id" bigint NOT NULL,
	"answer" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_answers_session_id_question_id_pk" PRIMARY KEY("session_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "core"."exam_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."exam_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" bigint NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_events_type_check" CHECK ("core"."exam_events"."type" ~ '^[A-Z][A-Z_]*$')
);
--> statement-breakpoint
CREATE TABLE "core"."exam_sessions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."exam_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"bank_id" bigint NOT NULL,
	"bank_version" integer NOT NULL,
	"seed" integer NOT NULL,
	"question_ids" bigint[] NOT NULL,
	"option_layout" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_sessions_student_bank_key" UNIQUE("student_id","bank_id"),
	CONSTRAINT "exam_sessions_status_check" CHECK ("core"."exam_sessions"."status" in ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED')),
	CONSTRAINT "exam_sessions_deadline_check" CHECK ("core"."exam_sessions"."deadline_at" > "core"."exam_sessions"."started_at"),
	CONSTRAINT "exam_sessions_submitted_check" CHECK (("core"."exam_sessions"."status" = 'IN_PROGRESS') = ("core"."exam_sessions"."submitted_at" is null)),
	CONSTRAINT "exam_sessions_submitted_at_check" CHECK ("core"."exam_sessions"."submitted_at" between "core"."exam_sessions"."started_at" and "core"."exam_sessions"."deadline_at"),
	CONSTRAINT "exam_sessions_draw_check" CHECK ("core"."exam_sessions"."bank_version" > 0 and "core"."exam_sessions"."seed" >= 0 and cardinality("core"."exam_sessions"."question_ids") > 0)
);
--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD CONSTRAINT "exam_answers_session_id_exam_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "core"."exam_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."exam_answers" ADD CONSTRAINT "exam_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "core"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."exam_events" ADD CONSTRAINT "exam_events_session_id_exam_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "core"."exam_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD CONSTRAINT "exam_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."exam_sessions" ADD CONSTRAINT "exam_sessions_bank_id_question_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "core"."question_banks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_events_session_id_idx" ON "core"."exam_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "exam_sessions_open_deadline_idx" ON "core"."exam_sessions" USING btree ("deadline_at") WHERE "core"."exam_sessions"."status" = 'IN_PROGRESS';