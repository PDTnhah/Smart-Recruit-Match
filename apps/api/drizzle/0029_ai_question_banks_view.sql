-- Hand-written (drizzle-kit cannot express views with options or grants). US-4.1, AD-4, CONTEXT D49.
-- The Test Generator reads the blueprint of its bank through this view, never the table, and only
-- while the bank is not locked: a job for a bank locked meanwhile (US-4.2) finds no row and stops.
CREATE OR REPLACE VIEW core.v_ai_question_banks WITH (security_barrier) AS
  SELECT id AS bank_id, jd_id, jd_version, campaign_id, blueprint
  FROM core.question_banks
  WHERE locked_at IS NULL;
--> statement-breakpoint
GRANT SELECT ON core.v_ai_question_banks TO ai_service;
