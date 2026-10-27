/** Account roles (ARCHITECTURE › Security architecture). Backs the `users.role` CHECK and RBAC. */
export const ROLES = ['CENTER', 'STUDENT', 'HR', 'ADMIN'] as const;

export type Role = (typeof ROLES)[number];
