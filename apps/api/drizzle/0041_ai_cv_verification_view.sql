-- Hand-written (drizzle-kit cannot express views with options or grants). US-4.8, AD-4, BR-03, CONTEXT D57.
-- The CV verification check reads part D through this view, never the tables: each question with
-- the CV entry it asks about and the answer, by preference and question only. No column says who
-- the student is; the CV itself is read through core.v_ai_cv_profile_masked. Only closed sessions:
-- an answer is written when its session closes.
CREATE OR REPLACE VIEW core.v_ai_cv_verification_answers WITH (security_barrier) AS
  SELECT v.preference_id,
         q.id AS question_id,
         q.no,
         q.stem,
         q.claim_ref,
         q.answer AS answer_text
  FROM core.cv_verification_questions q
  JOIN core.cv_verifications v ON v.id = q.verification_id
  JOIN core.exam_sessions s ON s.id = v.session_id
  WHERE s.status <> 'IN_PROGRESS';
--> statement-breakpoint
GRANT SELECT ON core.v_ai_cv_verification_answers TO ai_service;
