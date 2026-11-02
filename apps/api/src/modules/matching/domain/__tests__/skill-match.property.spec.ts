import {
  type CvProfileMasked,
  type JdSkillRequirement,
  MatchSkillVerdictSchema,
  type MatchVerdict,
  type SkillFamily,
  type SkillLevel,
  type SkillTaxonomyEntry,
  skillMatchKey,
  zoneOf,
} from '@srm/shared';
import fc from 'fast-check';
import { buildSkillEvidence, evidenceOfSkill } from '../skill-evidence.js';
import { skillFit } from '../skill-fit.js';
import { matchSkills, type SkillRequirements, type SkillVerdicts } from '../skill-match.js';
import { indexTaxonomy } from '../taxonomy-index.js';
import { certificate, experience, listed, profile, project } from './fixtures/profiles.js';

// A small random catalogue: 8 skills, ids 1–8, with families and implications drawn at random. CVs
// name them, and Zulu, a skill outside the catalogue, in every section.

const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
const NEW_NAME = 'Zulu';
const IDS = NAMES.map((_, i) => i + 1);
const INTAKE_END = new Date('2026-07-15T00:00:00Z');

interface Graph {
  families: (SkillFamily | null)[];
  /** [from, to]: skill `from` implies skill `to`; `to` < `from`, so there is no cycle. */
  edges: [number, number][];
}

function taxonomyOf({ families, edges }: Graph): SkillTaxonomyEntry[] {
  const closure = (id: number): number[] => {
    const seen = new Set<number>();
    const visit = (from: number) => {
      for (const [source, to] of edges) {
        if (source === from && !seen.has(to)) {
          seen.add(to);
          visit(to);
        }
      }
    };
    visit(id);
    return [...seen].sort((a, b) => a - b);
  };
  return NAMES.map((name, i) => ({
    skillId: i + 1,
    canonicalName: name,
    nameKey: skillMatchKey(name),
    aliasKeys: [],
    group: 'TOOL',
    family: families[i] ?? null,
    zone: zoneOf(families[i] ?? null),
    impliedSkillIds: closure(i + 1),
  }));
}

const graph: fc.Arbitrary<Graph> = fc.record({
  families: fc.array(fc.constantFrom<SkillFamily | null>(null, 'RELATIONAL_DB', 'NOSQL_DB', 'FOREIGN_LANGUAGE'), {
    minLength: NAMES.length,
    maxLength: NAMES.length,
  }),
  edges: fc.uniqueArray(
    fc
      .tuple(fc.constantFrom(...IDS), fc.constantFrom(...IDS))
      .filter(([a, b]) => a !== b)
      .map(([a, b]): [number, number] => [Math.max(a, b), Math.min(a, b)]),
    { selector: ([from, to]) => `${from}>${to}`, maxLength: 10 },
  ),
});

const name = fc.constantFrom(...NAMES, NEW_NAME);
const names = fc.uniqueArray(name, { maxLength: 3 });
/** Months of 2023–2025, or none. */
const date = fc.option(
  fc.integer({ min: 0, max: 35 }).map((m) => `${(m % 12) + 1}/${2023 + Math.floor(m / 12)}`),
  { nil: null },
);

type Entry =
  | { kind: 'listed'; name: string }
  | { kind: 'project'; names: string[] }
  | { kind: 'experience'; names: string[]; start: string | null; end: string | null }
  | { kind: 'certificate'; name: string };

const entry: fc.Arbitrary<Entry> = fc.oneof(
  fc.record({ kind: fc.constant('listed' as const), name }),
  fc.record({ kind: fc.constant('project' as const), names }),
  fc.record({ kind: fc.constant('experience' as const), names, start: date, end: date }),
  fc.record({ kind: fc.constant('certificate' as const), name }),
);

/** A CV with `entries` in order, each appended to its section. */
function cvOf(entries: readonly Entry[]): CvProfileMasked {
  const cv = profile();
  for (const item of entries) {
    if (item.kind === 'listed') cv.skills.push(listed(item.name, item.name === NEW_NAME ? null : item.name));
    else if (item.kind === 'project') cv.projects.push(project({ name: `P${cv.projects.length}`, technologies: item.names }));
    else if (item.kind === 'experience') {
      const description = item.names.length === 0 ? null : `Dùng ${item.names.join(', ')}`;
      cv.experience.push(experience({ description, start: item.start, end: item.end }));
    } else cv.certificates.push(certificate(`Chứng chỉ ${item.name}`));
  }
  return cv;
}

const requirements: fc.Arbitrary<SkillRequirements> = fc
  .uniqueArray(
    fc.record({
      skill: name,
      level: fc.constantFrom<SkillLevel>('BASIC', 'INTERMEDIATE', 'ADVANCED'),
      weight: fc.integer({ min: 1, max: 10 }),
    }),
    { selector: (requirement: JdSkillRequirement) => requirement.skill, minLength: 1, maxLength: 5 },
  )
  .chain((skills) =>
    fc
      .integer({ min: 1, max: skills.length })
      .map((mustCount) => ({ must_have: skills.slice(0, mustCount), nice_to_have: skills.slice(mustCount) })),
  );

const scenario = fc.record({ graph, entries: fc.array(entry, { maxLength: 8 }), requirements });

const RANK: Readonly<Record<MatchVerdict, number>> = { NOT_MET: 0, PARTIAL: 1, MET: 2 };

const ranks = (verdicts: SkillVerdicts) => [...verdicts.must_have, ...verdicts.nice_to_have].map((v) => RANK[v.verdict]);

function run(taxonomy: readonly SkillTaxonomyEntry[], entries: readonly Entry[], jd: SkillRequirements) {
  const index = indexTaxonomy(taxonomy);
  const evidence = buildSkillEvidence(cvOf(entries), index, INTAKE_END);
  return {
    verdicts: matchSkills(jd, evidence, index),
    tiers: IDS.map((id) => evidenceOfSkill(evidence, index, id).tier),
  };
}

describe('GĐ3 FR-40 monotonic and deterministic (US-3.5 AC-11)', () => {
  it('FR-40 one more CV entry lowers no tier and no verdict', () => {
    fc.assert(
      fc.property(scenario, entry, ({ graph: g, entries, requirements: jd }, extra) => {
        const taxonomy = taxonomyOf(g);
        const before = run(taxonomy, entries, jd);
        const after = run(taxonomy, [...entries, extra], jd);
        after.tiers.forEach((tier, i) => expect(tier).toBeGreaterThanOrEqual(before.tiers[i]!));
        ranks(after.verdicts).forEach((rank, i) => expect(rank).toBeGreaterThanOrEqual(ranks(before.verdicts)[i]!));
      }),
    );
  });

  it('FR-40 one implication or family less raises no verdict', () => {
    const removal = fc.oneof(
      fc.record({ edge: fc.nat() }),
      fc.record({ family: fc.constantFrom<SkillFamily>('RELATIONAL_DB', 'NOSQL_DB', 'FOREIGN_LANGUAGE') }),
    );
    fc.assert(
      fc.property(scenario, removal, ({ graph: g, entries, requirements: jd }, remove) => {
        const smaller: Graph =
          'edge' in remove
            ? { ...g, edges: g.edges.filter((_, i) => g.edges.length === 0 || i !== remove.edge % g.edges.length) }
            : { ...g, families: g.families.map((family) => (family === remove.family ? null : family)) };
        const before = ranks(run(taxonomyOf(g), entries, jd).verdicts);
        const after = ranks(run(taxonomyOf(smaller), entries, jd).verdicts);
        after.forEach((rank, i) => expect(rank).toBeLessThanOrEqual(before[i]!));
      }),
    );
  });

  it('FR-40 the same input gives the same verdicts, in whatever order the catalogue comes; every verdict fits the contract', () => {
    fc.assert(
      fc.property(scenario, ({ graph: g, entries, requirements: jd }) => {
        const taxonomy = taxonomyOf(g);
        const { verdicts } = run(taxonomy, entries, jd);
        expect(run(taxonomy, entries, jd).verdicts).toEqual(verdicts);
        expect(run([...taxonomy].reverse(), entries, jd).verdicts).toEqual(verdicts);
        for (const verdict of [...verdicts.must_have, ...verdicts.nice_to_have]) {
          expect(MatchSkillVerdictSchema.parse(verdict)).toEqual(verdict);
        }
      }),
    );
  });

  it('FR-40 0 ≤ skill_fit ≤ 10 000 whatever the weights', () => {
    const weight = fc.integer({ min: 0, max: 100 }).map((hundredths) => hundredths / 100);
    fc.assert(
      fc.property(scenario, weight, weight, ({ graph: g, entries, requirements: jd }, mustHave, niceToHave) => {
        const fit = skillFit(jd, run(taxonomyOf(g), entries, jd).verdicts, {
          scv_weight_must_have: mustHave,
          scv_weight_nice_to_have: niceToHave,
        });
        expect(Number.isInteger(fit)).toBe(true);
        expect(fit).toBeGreaterThanOrEqual(0);
        expect(fit).toBeLessThanOrEqual(10_000);
      }),
    );
  });
});
