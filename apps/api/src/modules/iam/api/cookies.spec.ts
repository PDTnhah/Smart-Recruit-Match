import { readCookie } from './cookies.js';

describe('FR-1: refresh cookie parsing', () => {
  it('finds a cookie among others and decodes it', () => {
    expect(readCookie('a=1; srm_refresh=abc%2Ddef; b=2', 'srm_refresh')).toBe('abc-def');
    expect(readCookie('srm_refresh=xyz', 'srm_refresh')).toBe('xyz');
  });

  it('ignores missing, prefix-matching and malformed cookies', () => {
    expect(readCookie(undefined, 'srm_refresh')).toBeUndefined();
    expect(readCookie('srm_refresh_old=1; other', 'srm_refresh')).toBeUndefined();
    expect(readCookie('srm_refresh=%E0%A4%A', 'srm_refresh')).toBeUndefined();
  });
});
