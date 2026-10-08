import { canTransition, defineMachine, isState, nextStates } from '../machine.js';

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
