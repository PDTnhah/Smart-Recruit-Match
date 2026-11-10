-- Hand-written (drizzle-kit cannot express views with options or grants). US-4.4, AD-4, BR-03, CONTEXT D53.
-- The Grader reads the essays to grade through this view, never the tables: the question with its
-- rubric and sample answer, and the answer text, by session and question only. No column says who
-- the student is. Only closed sessions, and only answers without a final score: an answer a human
-- grader has scored meanwhile (US-4.5) is no longer sent.
CREATE OR REPLACE VIEW core.v_ai_essay_answers WITH (security_barrier) AS
  SELECT a.session_id,
         a.question_id,
         q.content ->> 'stem' AS stem,
         q.rubric,
         q.answer_key ->> 'sample_answer' AS sample_answer,
         a.answer ->> 'text' AS answer_text
  FROM core.exam_answers a
  JOIN core.exam_sessions s ON s.id = a.session_id
  JOIN core.questions q ON q.id = a.question_id
  WHERE q.type = 'ESSAY'
    AND s.status <> 'IN_PROGRESS'
    AND a.final_score IS NULL;
--> statement-breakpoint
GRANT SELECT ON core.v_ai_essay_answers TO ai_service;
