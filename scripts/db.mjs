import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { root, settings, connectionString } from './runtime.mjs';

export async function prepareDatabase(url, {
  migrationsDirectory = join(root, 'db', 'migrations'),
  seedFile = join(root, 'db', 'seed.sql'),
} = {}) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query('BEGIN');
    // Serialize migration/seed work if two startup processes reach it together.
    await client.query('SELECT pg_advisory_xact_lock(408001)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const directory = migrationsDirectory;
    const appliedMigrations = [];
    for (const filename of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [filename]);
      if (applied.rowCount === 0) {
        await client.query(await readFile(join(directory, filename), 'utf8'));
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [filename]);
        appliedMigrations.push(filename);
      }
    }
    await client.query(await readFile(seedFile, 'utf8'));
    await client.query('COMMIT');
    for (const filename of appliedMigrations) console.log('Applied migration: ' + filename);
    console.log('Database ready; demonstration plans, organizations, features, and reports are seeded.');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Connection may have failed. */ }
    throw new Error('Database setup failed (' + (error.code || 'connection or SQL error') +
      '). Check PostgreSQL availability and database permissions.', { cause: error });
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await prepareDatabase(connectionString(settings()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
