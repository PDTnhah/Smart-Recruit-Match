-- Hand-written. US-3.6 AC-4, FR-9, CONTEXT D45.
-- JdRequirements gains `preferred_languages`, required by the shared schema; requirements stored
-- before it get an empty list, so they still read as JdRequirements and their JD keeps its
-- requirements on screen.
UPDATE core.job_descriptions
SET requirements = jsonb_set(requirements, '{preferred_languages}', '[]'::jsonb)
WHERE requirements IS NOT NULL
  AND jsonb_typeof(requirements) = 'object'
  AND NOT requirements ? 'preferred_languages';
