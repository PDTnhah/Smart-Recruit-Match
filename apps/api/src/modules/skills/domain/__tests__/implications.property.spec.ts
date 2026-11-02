import fc from 'fast-check';
import { findCycle, type Implication, implicationClosure, withOutgoing } from '../implications.js';

/**
 * An acyclic implication graph on 1–12 skills: the skills in a random order, and edges that only
 * point forward in that order.
 */
const dag = fc
  .uniqueArray(fc.integer({ min: 1, max: 200 }), { minLength: 1, maxLength: 12 })
  .chain((order) => {
    const position = fc.nat({ max: order.length - 1 });
    const forward = fc
      .tuple(position, position)
      .filter(([a, b]) => a !== b)
      .map(([a, b]): Implication => ({ skillId: order[Math.min(a, b)]!, impliedSkillId: order[Math.max(a, b)]! }));
    return fc.record({
      skillIds: fc.constant(order),
      edges:
        order.length < 2
          ? fc.constant<Implication[]>([])
          : fc.uniqueArray(forward, { selector: (e) => `${e.skillId}>${e.impliedSkillId}`, maxLength: 30 }),
    });
  });

const targetsOf = (edges: readonly Implication[], skillId: number) =>
  edges.filter((e) => e.skillId === skillId).map((e) => e.impliedSkillId);

describe('implications properties (FR-39, AC-4, AC-8)', () => {
  it('FR-39 closure is transitive and irreflexive', () => {
    fc.assert(
      fc.property(dag, ({ skillIds, edges }) => {
        const closure = implicationClosure(edges, skillIds);
        expect([...closure.keys()]).toEqual([...skillIds].sort((a, b) => a - b));
        for (const [skillId, implied] of closure) {
          expect(implied).not.toContain(skillId);
          expect(implied).toEqual([...new Set(implied)].sort((a, b) => a - b));
          for (const via of implied) for (const further of closure.get(via)!) expect(implied).toContain(further);
        }
      }),
    );
  });

  it('FR-39 closure holds exactly the direct implications and what they imply', () => {
    fc.assert(
      fc.property(dag, ({ skillIds, edges }) => {
        const closure = implicationClosure(edges, skillIds);
        for (const [skillId, implied] of closure) {
          const direct = targetsOf(edges, skillId);
          const expected = new Set([...direct, ...direct.flatMap((target) => closure.get(target)!)]);
          expect(implied).toEqual([...expected].sort((a, b) => a - b));
        }
      }),
    );
  });

  it('FR-39 an acyclic graph has no cycle; one edge back closes a cycle through it', () => {
    fc.assert(
      fc.property(dag, fc.nat(), ({ skillIds, edges }, pick) => {
        expect(findCycle(edges)).toBeNull();
        const closure = implicationClosure(edges, skillIds);
        const reachable = [...closure].flatMap(([from, implied]) => implied.map((to) => [from, to] as const));
        fc.pre(reachable.length > 0);
        const [from, to] = reachable[pick % reachable.length]!;

        // `to` is implied by `from`; letting `to` imply `from` closes a cycle that starts at `to`.
        const changed = withOutgoing(edges, to, [...targetsOf(edges, to), from]);
        const path = findCycle(changed, to)!;
        expect(path[0]).toBe(to);
        expect(path.at(-1)).toBe(to);
        expect(path).toContain(from);
        for (let i = 0; i + 1 < path.length; i++) {
          expect(targetsOf(changed, path[i]!)).toContain(path[i + 1]);
        }
      }),
    );
  });

  it('FR-39 a skill that implies itself is the cycle [a, a]', () => {
    fc.assert(
      fc.property(dag, fc.nat(), ({ skillIds, edges }, pick) => {
        const skillId = skillIds[pick % skillIds.length]!;
        const changed = withOutgoing(edges, skillId, [skillId, ...targetsOf(edges, skillId)]);
        expect(findCycle(changed, skillId)).toEqual([skillId, skillId]);
      }),
    );
  });
});
