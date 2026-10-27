/** Who caused an audited change: a signed-in user, or the system itself (e.g. a scheduler). */
export const ACTOR_KINDS = ['USER', 'SYSTEM'] as const;

export type ActorKind = (typeof ACTOR_KINDS)[number];
