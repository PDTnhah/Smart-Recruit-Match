-- Hand-written (drizzle-kit does not create functions or triggers). US-2.5, FR-13, AGENTS ›
-- Invariant 11, CONTEXT D39.
-- One key, one skill: the AI Service maps a name to the skill whose name or alias has the same
-- skillMatchKey. name_key is UNIQUE; this trigger covers alias keys. An alias key may not be another
-- skill's alias key, nor another skill's name_key, unless that skill was merged into this one (its
-- name became the alias). The API checks the same rule first, under the SKILL_CATALOGUE advisory
-- lock (modules/skills/domain/catalogue-keys.ts); the trigger guards every other write. It runs at
-- commit: a merge writes the target's aliases before the source's merged_into_id.
CREATE FUNCTION core.skills_keys_distinct() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  self core.skills%ROWTYPE;
  other_id core.skills.id%TYPE;
BEGIN
  -- The row as it is at commit, not as this event saw it.
  SELECT * INTO self FROM core.skills WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT o.id INTO other_id FROM core.skills o
  WHERE o.id <> self.id
    AND (o.alias_keys && self.alias_keys
      OR (o.name_key = ANY (self.alias_keys) AND o.merged_into_id IS DISTINCT FROM self.id)
      OR (o.alias_keys @> ARRAY[self.name_key] AND self.merged_into_id IS DISTINCT FROM o.id))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'skills % and % match the same key', self.id, other_id
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'skills_keys_distinct';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER skills_keys_distinct
  AFTER INSERT OR UPDATE OF name_key, alias_keys, merged_into_id ON core.skills
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION core.skills_keys_distinct();
