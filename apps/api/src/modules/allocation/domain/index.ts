// Allocation Engine (US-5.1): pure TypeScript, no framework, DB, AI, clock or randomness
// (AGENTS › Invariant 9). US-5.2, US-5.5 and the simulation of US-6.4 build the input and call it.

export { computeCapacity, type CapacityInput } from './capacity.js';
export { checkStability, type StabilityReport, type StabilityViolation } from './check-stability.js';
export { buildCompareAt, compareRankKeys } from './compare.js';
export { deferredAcceptance } from './deferred-acceptance.js';
export { InvalidAllocationInputError, NonStrictComparatorError } from './errors.js';
export { toCentiScore } from './score.js';
export type { AllocationInput, AllocationResult, JdId, RankKey, StudentId } from './types.js';
