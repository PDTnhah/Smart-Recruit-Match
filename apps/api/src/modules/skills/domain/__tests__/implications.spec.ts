import { findCycle, type Implication, implicationClosure, withOutgoing } from '../implications.js';

const JAVASCRIPT = 1;
const REACT = 2;
const NEXT = 3;
const TYPESCRIPT = 4;
const NEST = 5;
const NODE = 6;

const edge = (skillId: number, impliedSkillId: number): Implication => ({ skillId, impliedSkillId });

const WEB = [
  edge(NEXT, REACT),
  edge(REACT, JAVASCRIPT),
  edge(TYPESCRIPT, JAVASCRIPT),
  edge(NEST, TYPESCRIPT),
  edge(NEST, NODE),
  edge(NODE, JAVASCRIPT),
];

describe('findCycle (FR-39, AC-4)', () => {
  it('FR-39 an acyclic graph has no cycle', () => {
    expect(findCycle(WEB)).toBeNull();
    expect(findCycle([])).toBeNull();
  });

  it('FR-39 cycle is rejected with its path', () => {
    const edges = withOutgoing(WEB, JAVASCRIPT, [NEXT]);
    expect(findCycle(edges, JAVASCRIPT)).toEqual([JAVASCRIPT, NEXT, REACT, JAVASCRIPT]);
  });

  it('FR-39 the path starts at the skill whose implications changed', () => {
    const edges = withOutgoing(WEB, NODE, [JAVASCRIPT, NEST]);
    expect(findCycle(edges, NODE)).toEqual([NODE, NEST, NODE]);
    // From the lowest id instead, the same cycle reads from NEST.
    expect(findCycle(edges)).toEqual([NEST, NODE, NEST]);
  });

  it('FR-39 a skill that implies itself is a cycle [a, a]', () => {
    expect(findCycle(withOutgoing(WEB, REACT, [JAVASCRIPT, REACT]), REACT)).toEqual([REACT, REACT]);
  });
});

describe('withOutgoing', () => {
  it('replaces the implications of one skill and keeps the others', () => {
    expect(withOutgoing(WEB, NEST, [NODE])).toEqual([
      edge(NEXT, REACT),
      edge(REACT, JAVASCRIPT),
      edge(TYPESCRIPT, JAVASCRIPT),
      edge(NODE, JAVASCRIPT),
      edge(NEST, NODE),
    ]);
    expect(withOutgoing(WEB, NEXT, []).some((e) => e.skillId === NEXT)).toBe(false);
  });
});

describe('implicationClosure (FR-39, AC-8)', () => {
  const ALL = [JAVASCRIPT, REACT, NEXT, TYPESCRIPT, NEST, NODE];

  it('FR-39 Next.js implies React and, through it, JavaScript', () => {
    const closure = implicationClosure(WEB, ALL);
    expect(closure.get(NEXT)).toEqual([JAVASCRIPT, REACT]);
    expect(closure.get(NEST)).toEqual([JAVASCRIPT, TYPESCRIPT, NODE]);
    expect(closure.get(JAVASCRIPT)).toEqual([]);
  });

  it('FR-39 lists every skill given, ascending, and only them', () => {
    const closure = implicationClosure(WEB, [NODE, NEXT, JAVASCRIPT]);
    expect([...closure.keys()]).toEqual([JAVASCRIPT, NEXT, NODE]);
    // React is outside the skills given, so Next.js reaches nothing through it.
    expect(closure.get(NEXT)).toEqual([]);
    expect(closure.get(NODE)).toEqual([JAVASCRIPT]);
  });

  it('FR-39 a skill never implies itself, even through a cycle', () => {
    const closure = implicationClosure([edge(1, 2), edge(2, 1)], [1, 2]);
    expect(closure.get(1)).toEqual([2]);
    expect(closure.get(2)).toEqual([1]);
  });
});
