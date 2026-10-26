import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  // An absent/inactive account still performs the same expensive hash operation.
  const [, salt, stored] = encoded?.split('$') ?? [];
  const valid = encoded?.startsWith('scrypt$') && /^[a-f0-9]{32}$/.test(salt ?? '') && /^[a-f0-9]{128}$/.test(stored ?? '');
  const actual = await derive(password, valid ? salt : '00000000000000000000000000000000');
  return Boolean(valid && timingSafeEqual(actual, Buffer.from(stored, 'hex')));
}
