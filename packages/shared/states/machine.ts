/**
 * A lifecycle as plain data: its states, where it starts and which moves are allowed (AD-8).
 * The API enforces it in `transitionTo`; the web client reads the same table to show actions.
 */
export interface StateMachine<S extends string> {
  readonly name: string;
  readonly states: readonly S[];
  readonly initial: S;
  /** Allowed targets per state. A state with no targets is terminal. */
  readonly transitions: Readonly<Record<S, readonly S[]>>;
}

/** Checks the definition once at load time so a typo in a table fails fast instead of at runtime. */
export function defineMachine<S extends string>(machine: StateMachine<S>): StateMachine<S> {
  const known = new Set<string>(machine.states);
  if (!known.has(machine.initial)) {
    throw new Error(`${machine.name}: initial state ${machine.initial} is not a declared state`);
  }
  for (const [from, targets] of Object.entries<readonly string[]>(machine.transitions)) {
    if (!known.has(from)) throw new Error(`${machine.name}: unknown source state ${from}`);
    for (const to of targets) {
      if (!known.has(to)) throw new Error(`${machine.name}: ${from} -> ${to} targets an unknown state`);
      if (to === from) throw new Error(`${machine.name}: self-transition ${from} -> ${to} is not allowed`);
    }
  }
  return Object.freeze(machine);
}

export function isState<S extends string>(machine: StateMachine<S>, value: string): value is S {
  return (machine.states as readonly string[]).includes(value);
}

export function nextStates<S extends string>(machine: StateMachine<S>, from: S): readonly S[] {
  return machine.transitions[from];
}

export function canTransition<S extends string>(machine: StateMachine<S>, from: S, to: S): boolean {
  return nextStates(machine, from).includes(to);
}
