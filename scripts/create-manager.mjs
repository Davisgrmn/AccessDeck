import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import pg from 'pg';
import { settings, connectionString } from './runtime.mjs';
import { provisionManager } from '../dist/server/accounts.js';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Run npm run manager:create in an interactive terminal with the app running.');
  process.exitCode = 1;
} else {
  let hidden = false;
  const output = new Writable({ write(chunk, encoding, callback) {
    if (!hidden) process.stdout.write(chunk, encoding);
    callback();
  } });
  const terminal = createInterface({ input: process.stdin, output, terminal: true });
  let database;
  try {
    const name = await terminal.question('Manager name: ');
    const email = await terminal.question('Manager email: ');
    process.stdout.write('Password (12–128 characters, hidden): ');
    hidden = true;
    const password = await terminal.question('');
    process.stdout.write('\nConfirm password (hidden): ');
    const confirmation = await terminal.question('');
    hidden = false;
    process.stdout.write('\n');
    if (password !== confirmation) throw new Error('Passwords do not match.');
    database = new pg.Pool({ connectionString: connectionString(settings()), connectionTimeoutMillis: 5000 });
    const manager = await provisionManager(database, name, email, password);
    console.log(`Manager ${manager.email} is ready. Sign in at /login on this instance.`);
  } catch (error) {
    console.error(error.code ? 'Could not create the manager. Make sure the app is running and the database is available.' : error.message);
    process.exitCode = 1;
  } finally {
    hidden = false;
    terminal.close();
    await database?.end();
  }
}
