-- Hand-written (drizzle-kit cannot express views with options or grants). US-2.3, AD-4, CONTEXT D35.
-- The JD Analyzer reads the JD it was asked to analyse through this view, never the table. Only JDs
-- awaiting analysis are visible: once the result is stored, or HR has entered the requirements by
-- hand, the row drops out. A JD has no student data (BR-03); the company's own text is the input.
CREATE OR REPLACE VIEW core.v_ai_jd_source WITH (security_barrier) AS
  SELECT id AS jd_id, version, title, raw_text, file_key
  FROM core.job_descriptions
  WHERE status = 'PENDING_HR_CONFIRMATION' AND analysis_status = 'PENDING' AND requirements IS NULL;
--> statement-breakpoint
GRANT SELECT ON core.v_ai_jd_source TO ai_service;
