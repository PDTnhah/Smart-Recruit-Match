import { pgSchema } from 'drizzle-orm/pg-core';

/** Business data owned by the Core Backend; nothing else writes here (AD-4). */
export const core = pgSchema('core');
