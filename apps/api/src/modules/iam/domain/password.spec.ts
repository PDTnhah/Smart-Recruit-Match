import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js';

describe('FR-1: password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('Mật khẩu đúng 123');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    await expect(verifyPassword('Mật khẩu đúng 123', hash)).resolves.toBe(true);
    await expect(verifyPassword('Mật khẩu sai 123', hash)).resolves.toBe(false);
  });

  it('never stores the password and salts every hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')]);
    expect(a).not.toBe(b);
    expect(a).not.toContain('same-password');
  });

  it('treats the same text in NFC and NFD form as one password', async () => {
    const hash = await hashPassword('Nguyễn'.normalize('NFC'));
    await expect(verifyPassword('Nguyễn'.normalize('NFD'), hash)).resolves.toBe(true);
  });

  it('returns false for malformed or tampered hashes', async () => {
    const hash = await hashPassword('secret-password');
    const withParams = (params: string) => hash.replace('$32768$8$1$', `$${params}$`);
    const tampered = [
      withParams(`${2 ** 24}$8$1`), // N too large
      withParams('1$8$1'), // N too small (scrypt would throw)
      withParams('30000$8$1'), // N not a power of two
      withParams('32768$1.5$1'), // r not an integer
      withParams('32768$8$1000000000'), // p unbounded
    ];
    for (const stored of ['', 'plain', 'bcrypt$1$2$3$4$5', ...tampered, hash.slice(0, -4)]) {
      await expect(verifyPassword('secret-password', stored)).resolves.toBe(false);
    }
  });

  it('AC-2: the dummy hash is a real hash that matches no user password', async () => {
    const dummy = await dummyPasswordHash();
    expect(dummy).toMatch(/^scrypt\$/);
    await expect(verifyPassword('secret-password', dummy)).resolves.toBe(false);
    await expect(dummyPasswordHash()).resolves.toBe(dummy);
  });
});
