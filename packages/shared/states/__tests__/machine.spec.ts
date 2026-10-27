import { canTransition, defineMachine, isState, nextStates, reachableFrom } from '../machine.js';
import { cvMachine } from '../cv.js';
import { jobDescriptionMachine } from '../job-description.js';

type S = 'A' | 'B' | 'C';
const states = ['A', 'B', 'C'] as const;

describe('AD-8: defineMachine validates the table at load time', () => {
  it('rejects an initial state that is not declared', () => {
    expect(() =>
      defineMachine<S>({ name: 't', states, initial: 'X' as S, transitions: { A: [], B: [], C: [] } }),
    ).toThrow(/initial state X/);
  });

  it('rejects a target that is not declared', () => {
    expect(() =>
      defineMachine<S>({ name: 't', states, initial: 'A', transitions: { A: ['X' as S], B: [], C: [] } }),
    ).toThrow(/A -> X targets an unknown state/);
  });

  it('rejects a self-transition', () => {
    expect(() =>
      defineMachine<S>({ name: 't', states, initial: 'A', transitions: { A: ['A'], B: [], C: [] } }),
    ).toThrow(/self-transition/);
  });

  it('answers canTransition, nextStates and isState from the table', () => {
    const m = defineMachine<S>({ name: 't', states, initial: 'A', transitions: { A: ['B'], B: ['C'], C: [] } });
    expect(canTransition(m, 'A', 'B')).toBe(true);
    expect(canTransition(m, 'A', 'C')).toBe(false);
    expect(nextStates(m, 'B')).toEqual(['C']);
    expect(isState(m, 'C')).toBe(true);
    expect(isState(m, 'Z')).toBe(false);
  });
});

describe('AD-8: reachableFrom lists a state and everything after it', () => {
  it('follows every branch and keeps declaration order', () => {
    const m = defineMachine<S>({ name: 't', states, initial: 'A', transitions: { A: ['C', 'B'], B: [], C: [] } });
    expect(reachableFrom(m, 'A')).toEqual(['A', 'B', 'C']);
    expect(reachableFrom(m, 'B')).toEqual(['B']);
  });

  it('terminates on a cycle', () => {
    const m = defineMachine<S>({ name: 't', states, initial: 'A', transitions: { A: ['B'], B: ['A'], C: [] } });
    expect(reachableFrom(m, 'B')).toEqual(['A', 'B']);
  });

  it('BR-01 BR-02: gives the states the AI Service may read', () => {
    expect(reachableFrom(cvMachine, 'CONFIRMED')).toEqual(['CONFIRMED']);
    expect(reachableFrom(jobDescriptionMachine, 'APPROVED')).toEqual(['APPROVED', 'RECRUITING', 'FILLED', 'CLOSED']);
  });
});
