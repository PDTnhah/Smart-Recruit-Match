ALTER TABLE "core"."students" DROP CONSTRAINT "students_gpa_check";--> statement-breakpoint
-- GPAs above 4 were entered on the old 10-point scale and have no exact 4-point value: they are
-- cleared, to be entered again, instead of failing the new CHECK (US-3.1, CONTEXT D41).
UPDATE "core"."students" SET "gpa" = NULL WHERE "gpa" > 4;--> statement-breakpoint
ALTER TABLE "core"."students" ADD CONSTRAINT "students_gpa_check" CHECK ("core"."students"."gpa" between 0 and 4);