-- Hand-written (drizzle-kit does not write data migrations). US-2.5, CONTEXT D39.
-- Profiles stored before 0.11.0 list skills as {name}; CvSkill now also carries canonical_name and
-- match. Those names were never normalized, so they become NEW under the name the CV wrote. No
-- pending skill is queued for them, and their CVs get no profile embedding: US-3.2 embeds the
-- confirmed profile before matching (US-2.5 › Architecture constraints).
UPDATE core.cvs SET profile = jsonb_set(profile, '{skills}', (
  SELECT coalesce(jsonb_agg(
    CASE WHEN s ? 'match' THEN s ELSE s || '{"canonical_name": null, "match": "NEW"}'::jsonb END
    ORDER BY n), '[]'::jsonb)
  FROM jsonb_array_elements(profile -> 'skills') WITH ORDINALITY AS t(s, n)
))
WHERE jsonb_typeof(profile -> 'skills') = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(profile -> 'skills') AS s WHERE NOT s ? 'match');
--> statement-breakpoint
UPDATE core.cvs SET profile_masked = jsonb_set(profile_masked, '{skills}', (
  SELECT coalesce(jsonb_agg(
    CASE WHEN s ? 'match' THEN s ELSE s || '{"canonical_name": null, "match": "NEW"}'::jsonb END
    ORDER BY n), '[]'::jsonb)
  FROM jsonb_array_elements(profile_masked -> 'skills') WITH ORDINALITY AS t(s, n)
))
WHERE jsonb_typeof(profile_masked -> 'skills') = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(profile_masked -> 'skills') AS s WHERE NOT s ? 'match');
