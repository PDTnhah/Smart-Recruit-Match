import type { Role } from './roles.js';

// Role → portal routing for the single SPA (ARCHITECTURE › Frontend, CONTEXT D25).
// ADMIN shares the center portal with CENTER; the menus differ.

export const PORTALS = ['/sv', '/hr', '/admin'] as const;

export type Portal = (typeof PORTALS)[number];

const PORTAL_BY_ROLE: Record<Role, Portal> = {
  STUDENT: '/sv',
  HR: '/hr',
  CENTER: '/admin',
  ADMIN: '/admin',
};

export function portalForRole(role: Role): Portal {
  return PORTAL_BY_ROLE[role];
}

/** The portal a path belongs to, or null for paths outside every portal (e.g. `/login`). */
export function portalOfPath(pathname: string): Portal | null {
  return PORTALS.find((portal) => pathname === portal || pathname.startsWith(`${portal}/`)) ?? null;
}
