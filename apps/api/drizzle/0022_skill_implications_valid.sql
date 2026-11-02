-- Hand-written (drizzle-kit does not create functions or triggers). US-2.7, FR-39, AGENTS ›
-- Invariant 11, CONTEXT D43.
-- An implication links two approved skills and closes no cycle. The API checks both first, under
-- the SKILL_CATALOGUE advisory lock (modules/skills/domain/implications.ts); the trigger guards
-- every other write. It runs at commit: approval writes the implications before the status is
-- APPROVED. APPROVED is final (skillMachine), so a skill never leaves it with implications.
CREATE FUNCTION core.skill_implications_valid() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  -- Deleted again before commit, as when the implications of a skill are replaced twice.
  PERFORM 1 FROM core.skill_implications
  WHERE skill_id = NEW.skill_id AND implied_skill_id = NEW.implied_skill_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM core.skills
  WHERE id IN (NEW.skill_id, NEW.implied_skill_id) AND status <> 'APPROVED';
  IF FOUND THEN
    RAISE EXCEPTION 'skill % implies skill %, but only approved skills imply or are implied',
      NEW.skill_id, NEW.implied_skill_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'skill_implications_approved';
  END IF;
  -- A cycle through this edge: the implied skill leads back to the skill.
  PERFORM 1 FROM (
    WITH RECURSIVE reached(id) AS (
      SELECT NEW.implied_skill_id
      UNION
      SELECT e.implied_skill_id FROM core.skill_implications e JOIN reached r ON e.skill_id = r.id
    )
    SELECT id FROM reached WHERE id = NEW.skill_id
  ) AS back;
  IF FOUND THEN
    RAISE EXCEPTION 'skill % implying skill % closes a cycle', NEW.skill_id, NEW.implied_skill_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'skill_implications_acyclic';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER skill_implications_valid
  AFTER INSERT OR UPDATE ON core.skill_implications
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION core.skill_implications_valid();
