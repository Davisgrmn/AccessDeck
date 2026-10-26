import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../server/passwords.js';

describe('password storage', () => {
  it('salts each password independently and only accepts the original password', async () => {
    const password = 'A long sample password';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword('Wrong password', first)).toBe(false);
    expect(await verifyPassword(password, null)).toBe(false);
    expect(await verifyPassword(password, 'not-a-hash')).toBe(false);
  });
});
