ALTER TABLE "ai"."llm_batches" DROP CONSTRAINT "llm_batches_provider_check";--> statement-breakpoint
ALTER TABLE "ai"."llm_calls" DROP CONSTRAINT "llm_calls_provider_check";--> statement-breakpoint
ALTER TABLE "ai"."llm_batches" ADD CONSTRAINT "llm_batches_provider_check" CHECK ("ai"."llm_batches"."provider" in ('GEMINI', 'ANTHROPIC', 'OPENAI', 'DEEPSEEK', 'FIXTURE'));--> statement-breakpoint
ALTER TABLE "ai"."llm_calls" ADD CONSTRAINT "llm_calls_provider_check" CHECK ("ai"."llm_calls"."provider" in ('GEMINI', 'ANTHROPIC', 'OPENAI', 'DEEPSEEK', 'FIXTURE'));