CREATE TABLE "ai"."llm_calls" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai"."llm_calls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job_id" uuid,
	"agent" text NOT NULL,
	"prompt_version" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"effort" text NOT NULL,
	"attempt" integer NOT NULL,
	"outcome" text NOT NULL,
	"stop_reason" text,
	"raw_stop_reason" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6),
	"latency_ms" integer NOT NULL,
	"log_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_calls_log_key_unique" UNIQUE("log_key"),
	CONSTRAINT "llm_calls_prompt_version_check" CHECK ("ai"."llm_calls"."prompt_version" ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$'),
	CONSTRAINT "llm_calls_provider_check" CHECK ("ai"."llm_calls"."provider" in ('GEMINI', 'ANTHROPIC', 'FIXTURE')),
	CONSTRAINT "llm_calls_effort_check" CHECK ("ai"."llm_calls"."effort" in ('LOW', 'MEDIUM', 'HIGH')),
	CONSTRAINT "llm_calls_outcome_check" CHECK ("ai"."llm_calls"."outcome" in ('SUCCEEDED', 'INVALID_OUTPUT', 'TRUNCATED', 'REFUSED', 'API_ERROR')),
	CONSTRAINT "llm_calls_stop_reason_check" CHECK ("ai"."llm_calls"."stop_reason" in ('END_TURN', 'MAX_TOKENS', 'REFUSAL', 'OTHER')),
	CONSTRAINT "llm_calls_stop_reason_present_check" CHECK (("ai"."llm_calls"."outcome" = 'API_ERROR') = ("ai"."llm_calls"."stop_reason" is null)),
	CONSTRAINT "llm_calls_attempt_check" CHECK ("ai"."llm_calls"."attempt" >= 1),
	CONSTRAINT "llm_calls_tokens_check" CHECK ("ai"."llm_calls"."input_tokens" >= 0 and "ai"."llm_calls"."cache_read_tokens" >= 0 and "ai"."llm_calls"."cache_write_tokens" >= 0 and "ai"."llm_calls"."output_tokens" >= 0),
	CONSTRAINT "llm_calls_cost_usd_check" CHECK ("ai"."llm_calls"."cost_usd" >= 0),
	CONSTRAINT "llm_calls_latency_ms_check" CHECK ("ai"."llm_calls"."latency_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai"."llm_calls" ADD CONSTRAINT "llm_calls_job_id_jobs_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "ai"."jobs"("job_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_calls_agent_created_at_idx" ON "ai"."llm_calls" USING btree ("agent","created_at");--> statement-breakpoint
CREATE INDEX "llm_calls_job_id_idx" ON "ai"."llm_calls" USING btree ("job_id");