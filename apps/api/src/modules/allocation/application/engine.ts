import { type AllocationInput, type AllocationResult, deferredAcceptance } from '../domain/index.js';

/**
 * The engine a round runs (US-5.2 AC-4): Deferred Acceptance of US-5.1 (AD-7). Injected, so a test
 * can put a faulty one in its place and see `checkStability` refuse the result.
 */
export interface AllocationEngine {
  allocate(input: AllocationInput): AllocationResult;
}

export const ALLOCATION_ENGINE = Symbol('ALLOCATION_ENGINE');

export const DEFERRED_ACCEPTANCE_ENGINE: AllocationEngine = { allocate: deferredAcceptance };
