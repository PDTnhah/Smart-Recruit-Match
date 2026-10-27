CREATE TABLE "core"."skills" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."skills_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"canonical_name" text NOT NULL,
	"name_key" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"group" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"merged_into_id" bigint,
	"suggestion" jsonb,
	"suggestion_model" text,
	"suggestion_prompt_version" text,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_canonical_name_unique" UNIQUE("canonical_name"),
	CONSTRAINT "skills_name_key_unique" UNIQUE("name_key"),
	CONSTRAINT "skills_status_check" CHECK ("core"."skills"."status" in ('PENDING', 'APPROVED', 'REJECTED', 'MERGED')),
	CONSTRAINT "skills_group_check" CHECK ("core"."skills"."group" in ('LANGUAGE', 'FRAMEWORK', 'DATABASE', 'CLOUD_DEVOPS', 'TOOL', 'TESTING', 'DATA_AI', 'METHODOLOGY', 'SOFT_SKILL', 'OTHER')),
	CONSTRAINT "skills_canonical_name_check" CHECK (length(btrim("core"."skills"."canonical_name")) between 1 and 100),
	CONSTRAINT "skills_name_key_check" CHECK ("core"."skills"."name_key" <> ''),
	CONSTRAINT "skills_approved_group_check" CHECK ("core"."skills"."status" <> 'APPROVED' or "core"."skills"."group" is not null),
	CONSTRAINT "skills_merged_check" CHECK ("core"."skills"."status" <> 'MERGED' or "core"."skills"."merged_into_id" is not null),
	CONSTRAINT "skills_merged_into_self_check" CHECK ("core"."skills"."merged_into_id" <> "core"."skills"."id"),
	CONSTRAINT "skills_suggestion_check" CHECK (("core"."skills"."suggestion" is null) = ("core"."skills"."suggestion_model" is null) and ("core"."skills"."suggestion" is null) = ("core"."skills"."suggestion_prompt_version" is null))
);
--> statement-breakpoint
CREATE TABLE "ai"."embeddings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai"."embeddings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"owner_type" text NOT NULL,
	"owner_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "embeddings_owner_key" UNIQUE("owner_type","owner_id","version","model"),
	CONSTRAINT "embeddings_owner_type_check" CHECK ("ai"."embeddings"."owner_type" in ('cv', 'jd', 'question', 'skill', 'essay')),
	CONSTRAINT "embeddings_version_check" CHECK ("ai"."embeddings"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai"."jobs" DROP CONSTRAINT "jobs_type_check";--> statement-breakpoint
ALTER TABLE "core"."skills" ADD CONSTRAINT "skills_merged_into_id_skills_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "core"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "embeddings_cv_hnsw_idx" ON "ai"."embeddings" USING hnsw ("embedding" vector_cosine_ops) WHERE "ai"."embeddings"."owner_type" = 'cv';--> statement-breakpoint
CREATE INDEX "embeddings_jd_hnsw_idx" ON "ai"."embeddings" USING hnsw ("embedding" vector_cosine_ops) WHERE "ai"."embeddings"."owner_type" = 'jd';--> statement-breakpoint
CREATE INDEX "embeddings_question_hnsw_idx" ON "ai"."embeddings" USING hnsw ("embedding" vector_cosine_ops) WHERE "ai"."embeddings"."owner_type" = 'question';--> statement-breakpoint
CREATE INDEX "embeddings_skill_hnsw_idx" ON "ai"."embeddings" USING hnsw ("embedding" vector_cosine_ops) WHERE "ai"."embeddings"."owner_type" = 'skill';--> statement-breakpoint
CREATE INDEX "embeddings_essay_hnsw_idx" ON "ai"."embeddings" USING hnsw ("embedding" vector_cosine_ops) WHERE "ai"."embeddings"."owner_type" = 'essay';--> statement-breakpoint
ALTER TABLE "ai"."jobs" ADD CONSTRAINT "jobs_type_check" CHECK ("ai"."jobs"."type" in ('CV_PARSE', 'JD_ANALYZE', 'SKILL_NORMALIZE'));