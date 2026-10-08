import { ROLES } from '../roles.js';
import { PORTALS, portalForRole, portalOfPath } from '../portal.js';

describe('FR-1: role-based portal routing', () => {
  it('FR-1: each role maps to exactly one portal', () => {
    expect(ROLES.map((role) => [role, portalForRole(role)])).toEqual([
      ['CENTER', '/admin'],
      ['STUDENT', '/sv'],
      ['HR', '/hr'],
      ['ADMIN', '/admin'],
    ]);
    // Every portal is reachable by some role.
    expect(new Set(ROLES.map(portalForRole))).toEqual(new Set(PORTALS));
  });

  it('resolves the portal of a path by whole segment', () => {
    expect(portalOfPath('/sv')).toBe('/sv');
    expect(portalOfPath('/sv/cv/12')).toBe('/sv');
    expect(portalOfPath('/hr/')).toBe('/hr');
    expect(portalOfPath('/admin/users')).toBe('/admin');
    expect(portalOfPath('/svx')).toBeNull();
    expect(portalOfPath('/login')).toBeNull();
    expect(portalOfPath('/')).toBeNull();
  });
});
