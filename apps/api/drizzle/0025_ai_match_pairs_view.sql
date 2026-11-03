-- Hand-written (drizzle-kit cannot express views with options or grants). US-3.2, AD-4, BR-03, CONTEXT D46.
-- The Matching Agent reads the pairs of its job through this view, never the table: the verdicts code
-- has stored for each pair waiting for the LLM (eligible, among the top M, no result yet, not left to
-- staff). `criteria` quotes only the masked profile; `facts` (GPA, major) and scores stay hidden.
CREATE OR REPLACE VIEW core.v_ai_match_pairs WITH (security_barrier) AS
  SELECT campaign_id, cv_id, cv_version, jd_id, jd_version, rules_version, criteria
  FROM core.match_results
  WHERE eligible AND NOT skipped_by_prefilter AND prompt_version IS NULL AND NOT needs_review;
--> statement-breakpoint
GRANT SELECT ON core.v_ai_match_pairs TO ai_service;
