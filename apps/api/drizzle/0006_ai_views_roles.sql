-- Hand-written (drizzle-kit cannot express views with options, roles or grants). US-2.1, AD-4, CONTEXT D33.
-- The AI Service reads `core` only through these views: no PII columns (BR-03), and only rows whose
-- owner has confirmed them. The filters follow packages/shared/states (reachableFrom); the
-- integration test ai-service-role.int-spec.ts fails when a state is added without updating them.
-- security_barrier: a caller's own functions in WHERE cannot see rows the view filters out.
-- CV: the active version, confirmed by the student (BR-01).
CREATE OR REPLACE VIEW core.v_ai_cv_profile_masked WITH (security_barrier) AS
  SELECT id AS cv_id, version, campaign_id, profile_masked
  FROM core.cvs
  WHERE active AND status IN ('CONFIRMED');
--> statement-breakpoint
-- JD: requirements confirmed by HR and approved by the centre (BR-02), from APPROVED on.
CREATE OR REPLACE VIEW core.v_ai_jd_requirements WITH (security_barrier) AS
  SELECT id AS jd_id, version, campaign_id, position_group, requirements
  FROM core.job_descriptions
  WHERE status IN ('APPROVED', 'RECRUITING', 'FILLED', 'CLOSED');
--> statement-breakpoint
-- Roles are cluster-wide and may exist already (another database, a re-run). They start without
-- LOGIN; the migrate step gives them a password from API_DB_PASSWORD / AI_DB_PASSWORD.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'api_service') THEN
    CREATE ROLE api_service NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ai_service') THEN
    CREATE ROLE ai_service NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- api_service, the Core Backend: reads and writes `core`, except that audit_logs is insert-only
-- (the append-only trigger of 0001 stays as the second guard). Reads `ai`.
GRANT USAGE ON SCHEMA core TO api_service;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO api_service;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON core.audit_logs FROM api_service;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO api_service;
--> statement-breakpoint
GRANT USAGE ON SCHEMA ai TO api_service;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA ai TO api_service;
--> statement-breakpoint
-- ai_service, the AI Service: the two views in `core`, nothing else there; reads and writes `ai`
-- without CREATE, so tables still come only from these migrations.
GRANT USAGE ON SCHEMA core TO ai_service;
--> statement-breakpoint
GRANT SELECT ON core.v_ai_cv_profile_masked, core.v_ai_jd_requirements TO ai_service;
--> statement-breakpoint
GRANT USAGE ON SCHEMA ai TO ai_service;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai TO ai_service;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ai TO ai_service;
--> statement-breakpoint
-- Tables created by later migrations (run by the same owner) get the same grants. A new core
-- table that must stay hidden from api_service, or a new audit-like table, needs its own REVOKE.
ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO api_service;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT USAGE, SELECT ON SEQUENCES TO api_service;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA ai GRANT SELECT ON TABLES TO api_service;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA ai GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_service;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA ai GRANT USAGE, SELECT ON SEQUENCES TO ai_service;
