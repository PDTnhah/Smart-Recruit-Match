-- Hand-written (drizzle-kit cannot express views with options). US-2.4, AD-4, BR-03, CONTEXT D37.
-- Matching (US-3.2) checks the evidence of each verdict against the CV text. The view now carries
-- that text with personal data already replaced (masked_text), never the plain text or pii.
-- CREATE OR REPLACE only adds columns at the end, so masked_text comes last; the grant stays.
CREATE OR REPLACE VIEW core.v_ai_cv_profile_masked WITH (security_barrier) AS
  SELECT id AS cv_id, version, campaign_id, profile_masked, masked_text
  FROM core.cvs
  WHERE active AND status IN ('CONFIRMED');
