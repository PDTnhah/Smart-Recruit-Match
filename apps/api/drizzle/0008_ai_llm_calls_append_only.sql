-- Hand-written (drizzle-kit cannot express grants). US-2.2, NFR-5, NFR-11, CONTEXT D34.
-- ai.llm_calls is the audit trail of every LLM call: which model answered, what it cost. The
-- schema-wide default privileges of 0006 gave ai_service UPDATE and DELETE on it; take them back so
-- the service it audits can only add rows, as core.audit_logs is insert-only for api_service.
-- Retention clean-up, when added, runs as the owner.
REVOKE UPDATE, DELETE ON ai.llm_calls FROM ai_service;
