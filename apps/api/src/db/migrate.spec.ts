import { servicePasswords } from './migrate.js';

describe('AD-4: service role passwords (CONTEXT D33)', () => {
  it('skips a role whose password is unset or empty (LESSONS §14)', () => {
    expect(servicePasswords({ api_service: undefined, ai_service: '' })).toEqual([]);
  });

  it('keeps URL-safe passwords of at least 12 characters', () => {
    expect(servicePasswords({ api_service: 'Api.Service_pw~1-x' })).toEqual([['api_service', 'Api.Service_pw~1-x']]);
  });

  it('rejects a password that needs escaping in a connection URL', () => {
    expect(() => servicePasswords({ ai_service: 'p@ss/word:12345' })).toThrow(/AI_DB_PASSWORD/);
  });

  it('rejects a short password', () => {
    expect(() => servicePasswords({ api_service: 'short' })).toThrow(/API_DB_PASSWORD/);
  });
});
