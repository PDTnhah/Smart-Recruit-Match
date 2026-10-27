ALTER TABLE "core"."skills" ADD COLUMN "alias_keys" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- Edited after generation: aliases already stored get their keys before the CHECK. The expression is
-- skillMatchKey in SQL; skills-catalog.int-spec.ts checks it gives TypeScript's keys on the seed.
UPDATE "core"."skills" SET "alias_keys" = ARRAY(
  SELECT lower(regexp_replace(normalize(a.alias, NFKC), '[[:space:]._/-]+', '', 'g'))
  FROM unnest("aliases") WITH ORDINALITY AS a(alias, n) ORDER BY a.n
) WHERE cardinality("aliases") > 0;--> statement-breakpoint
CREATE INDEX "skills_alias_keys_idx" ON "core"."skills" USING gin ("alias_keys");--> statement-breakpoint
ALTER TABLE "core"."skills" ADD CONSTRAINT "skills_alias_keys_check" CHECK (cardinality("core"."skills"."alias_keys") = cardinality("core"."skills"."aliases"));
