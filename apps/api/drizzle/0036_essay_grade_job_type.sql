ALTER TABLE "ai"."jobs" DROP CONSTRAINT "jobs_type_check";--> statement-breakpoint
ALTER TABLE "ai"."llm_batches" DROP CONSTRAINT "llm_batches_job_type_check";--> statement-breakpoint
ALTER TABLE "ai"."jobs" ADD CONSTRAINT "jobs_type_check" CHECK ("ai"."jobs"."type" in ('CV_PARSE', 'JD_ANALYZE', 'SKILL_NORMALIZE', 'MATCH', 'QUESTIONS_GENERATE', 'ESSAY_GRADE'));--> statement-breakpoint
ALTER TABLE "ai"."llm_batches" ADD CONSTRAINT "llm_batches_job_type_check" CHECK ("ai"."llm_batches"."job_type" in ('CV_PARSE', 'JD_ANALYZE', 'SKILL_NORMALIZE', 'MATCH', 'QUESTIONS_GENERATE', 'ESSAY_GRADE'));