-- Hand-written (drizzle-kit cannot express triggers). US-1.2, AD-9.
-- pgcrypto: needed by the encrypted cvs.pii column (US-2.4).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
-- core.audit_logs is append-only (FR-7, BR-10): reject every UPDATE, DELETE and TRUNCATE,
-- whichever role runs it, including the application's own account.
CREATE FUNCTION core.audit_logs_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'core.audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON core.audit_logs
  FOR EACH ROW EXECUTE FUNCTION core.audit_logs_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON core.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION core.audit_logs_reject_mutation();
--> statement-breakpoint
-- Ordinary triggers are skipped when a superuser sets session_replication_role = replica;
-- ENABLE ALWAYS keeps them firing. The compose stack connects as a superuser.
ALTER TABLE core.audit_logs ENABLE ALWAYS TRIGGER audit_logs_no_update_delete;
--> statement-breakpoint
ALTER TABLE core.audit_logs ENABLE ALWAYS TRIGGER audit_logs_no_truncate;
