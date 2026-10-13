import type { ActorKind } from '@srm/shared';

/** Who caused an audited change (CONTEXT D24): a signed-in user, or the system (e.g. a scheduler). */
export type Actor = { kind: Extract<ActorKind, 'USER'>; userId: number } | { kind: Extract<ActorKind, 'SYSTEM'> };

export const SYSTEM_ACTOR: Actor = Object.freeze({ kind: 'SYSTEM' });

/** The signed-in caller as an actor; takes any object with `userId` (e.g. AuthUser). */
export function userActor(user: { userId: number }): Actor {
  return { kind: 'USER', userId: user.userId };
}
