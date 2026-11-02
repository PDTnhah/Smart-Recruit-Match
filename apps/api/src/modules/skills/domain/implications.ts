// The implication graph of the skill catalogue (FR-39, US-2.7, CONTEXT D42, D43): an edge A ⇒ B
// means a CV that uses A uses B too (Spring Boot ⇒ Java). ADMIN keeps the graph acyclic; the
// matching module reads its closure. Skills and their neighbours are visited in ascending id
// order, so every result is the same on every run.

/** One implication: `skillId` ⇒ `impliedSkillId`. */
export interface Implication {
  skillId: number;
  impliedSkillId: number;
}

const ascending = (a: number, b: number) => a - b;

function adjacency(edges: readonly Implication[]): Map<number, number[]> {
  const next = new Map<number, number[]>();
  for (const { skillId, impliedSkillId } of edges) {
    const targets = next.get(skillId) ?? [];
    targets.push(impliedSkillId);
    next.set(skillId, targets);
  }
  for (const targets of next.values()) targets.sort(ascending);
  return next;
}

/** `edges` with the implications of `skillId` replaced by `impliedIds`. */
export function withOutgoing(edges: readonly Implication[], skillId: number, impliedIds: readonly number[]): Implication[] {
  return [
    ...edges.filter((edge) => edge.skillId !== skillId),
    ...impliedIds.map((impliedSkillId) => ({ skillId, impliedSkillId })),
  ];
}

/**
 * A cycle of `edges` as the skill ids on the way from a skill back to itself (`[a, b, a]`; a skill
 * that implies itself gives `[a, a]`), or null when there is none (AC-4). The search starts at
 * `from`, then at the other skills by id. When only the implications of `from` changed in a graph
 * that had no cycle, every cycle runs through `from`, so the path starts and ends there.
 */
export function findCycle(edges: readonly Implication[], from?: number): number[] | null {
  const next = adjacency(edges);
  const state = new Map<number, 'open' | 'done'>();
  const path: number[] = [];

  const visit = (skillId: number): number[] | null => {
    state.set(skillId, 'open');
    path.push(skillId);
    for (const target of next.get(skillId) ?? []) {
      const seen = state.get(target);
      if (seen === 'open') return [...path.slice(path.indexOf(target)), target];
      if (seen === undefined) {
        const cycle = visit(target);
        if (cycle !== null) return cycle;
      }
    }
    path.pop();
    state.set(skillId, 'done');
    return null;
  };

  const starts = [...next.keys()].sort(ascending);
  for (const start of from === undefined ? starts : [from, ...starts]) {
    if (state.has(start)) continue;
    const cycle = visit(start);
    if (cycle !== null) return cycle;
  }
  return null;
}

/**
 * The closure of `edges` over `skillIds` (AC-8): for each skill, in ascending order, every skill
 * it implies directly or through others, ascending, never itself. Edges to or from a skill outside
 * `skillIds` are left out.
 */
export function implicationClosure(edges: readonly Implication[], skillIds: readonly number[]): Map<number, number[]> {
  const known = new Set(skillIds);
  const next = adjacency(edges.filter((edge) => known.has(edge.skillId) && known.has(edge.impliedSkillId)));
  const closure = new Map<number, number[]>();
  for (const skillId of [...known].sort(ascending)) {
    const reached = new Set<number>();
    const queue = [...(next.get(skillId) ?? [])];
    while (queue.length > 0) {
      const target = queue.shift()!;
      if (target === skillId || reached.has(target)) continue;
      reached.add(target);
      queue.push(...(next.get(target) ?? []));
    }
    closure.set(skillId, [...reached].sort(ascending));
  }
  return closure;
}
