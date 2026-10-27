import { randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';

// Password hashing with Node's built-in scrypt (CONTEXT D25). Stored format:
// `scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>`, so parameters can be raised later
// without breaking existing hashes.

const COST = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// Bounds on parameters read back from storage, so a malformed or tampered row can neither make
// scrypt throw nor tie up a thread pool worker or memory.
const LIMITS = { N: [2 ** 14, 2 ** 20], r: [1, 32], p: [1, 16] } as const;

function withinLimits(value: number, [min, max]: readonly [number, number]): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function derive(password: string, salt: Buffer, cost: { N: number; r: number; p: number }): Promise<Buffer> {
  // scrypt needs about 128 * N * r bytes, which equals Node's default maxmem (32 MiB) at N = 2^15;
  // allow twice that so the default parameters never hit the limit.
  const options: ScryptOptions = { ...cost, maxmem: 256 * cost.N * cost.r };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFC'), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join('$');
}

/** False for a wrong password and for a malformed stored hash; never throws on bad input. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N = 0, r = 0, p = 0] = parts.slice(1, 4).map(Number);
  const powerOfTwo = (N & (N - 1)) === 0;
  if (!withinLimits(N, LIMITS.N) || !powerOfTwo || !withinLimits(r, LIMITS.r) || !withinLimits(p, LIMITS.p)) {
    return false;
  }
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');
  if (expected.length !== KEY_LENGTH || salt.length === 0) return false;
  try {
    const actual = await derive(password, salt, { N, r, p });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * A real hash of a throwaway password. Login verifies against it when the email is unknown, so
 * the response takes as long as for a known email (AC-2: no account enumeration).
 */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}
