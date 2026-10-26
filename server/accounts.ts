import type { Database } from './app.js';
import { hashPassword } from './passwords.js';

// Only the operator's terminal command calls this function; there is no public
// manager-registration endpoint and existing customer accounts cannot be promoted.
export async function provisionManager(database: Database, name: string, email: string, password: string) {
  if (!name.trim() || name.trim().length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || password.length < 12 || password.length > 128) {
    throw new Error('Use a name, valid email, and password with 12–128 characters.');
  }
  const result = await database.query(`
    INSERT INTO users(name,email,password_hash,role,is_active) VALUES ($1,$2,$3,'product_manager',true)
    ON CONFLICT (lower(email)) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,is_active=true
    WHERE users.role='product_manager' AND NOT users.is_active
    RETURNING id,name,email
  `, [name.trim(), email.trim().toLowerCase(), await hashPassword(password)]);
  if (!result.rows[0]) throw new Error('This email belongs to an active account or a customer. Use a different email.');
  return result.rows[0];
}
