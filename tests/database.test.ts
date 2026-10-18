import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import { prepareDatabase } from '../scripts/db.mjs';
import { postgresTools, root } from '../scripts/runtime.mjs';

// Always create a separate cluster; never load .env or connect to the app database.
let directory: string;
let tools: ReturnType<typeof postgresTools>;
let pool: pg.Pool;
let databaseUrl: string;
let upgradeUrl: string;
let started = false;

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`Temporary PostgreSQL setup failed: ${result.stderr || result.error?.message}`);
  }
}

async function transaction(action: (client: pg.PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await action(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

beforeAll(async () => {
  if (process.getuid?.() === 0) throw new Error('Run database tests as your regular user, without sudo.');
  tools = postgresTools();
  directory = await mkdtemp(join(tmpdir(), 'accessdeck-db-test-'));
  const password = randomBytes(24).toString('hex');
  const passwordFile = join(directory, 'password');
  await writeFile(passwordFile, password, { mode: 0o600 });
  try {
    run(tools.initdb, ['-D', join(directory, 'data'), '--username=accessdeck_test', '--encoding=UTF8',
      '--no-locale', '--auth-local=scram-sha-256', '--auth-host=scram-sha-256', `--pwfile=${passwordFile}`]);
  } finally {
    await unlink(passwordFile);
  }
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve a database test port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  run(tools.pgCtl, ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'),
    '-o', `-h 127.0.0.1 -p ${port} -k ''`, '-w', '-t', '20', 'start']);
  started = true;
  const prefix = `postgresql://accessdeck_test:${password}@127.0.0.1:${port}/`;
  const admin = new pg.Client({ connectionString: prefix + 'postgres' });
  try {
    await admin.connect();
    await admin.query('CREATE DATABASE accessdeck_fresh');
    await admin.query('CREATE DATABASE accessdeck_upgrade');
  } finally {
    await admin.end();
  }
  databaseUrl = prefix + 'accessdeck_fresh';
  upgradeUrl = prefix + 'accessdeck_upgrade';
  pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
}, 30000);

afterAll(async () => {
  await pool?.end();
  if (started) {
    run(tools.pgCtl, ['-D', join(directory, 'data'), '-m', 'fast', '-w', '-t', '20', 'stop']);
  }
  if (directory) await rm(directory, { recursive: true, force: true });
}, 30000);

describe('core PostgreSQL migrations and fixtures', () => {
  it('creates every initial core table and the fictional data from an empty database', async () => {
    await prepareDatabase(databaseUrl);
    const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    expect(tables.map((row) => row.tablename)).toEqual([
      'audit_logs', 'demo_reports', 'features', 'organizations', 'plan_entitlements', 'plan_versions',
      'plans', 'schema_migrations', 'subscriptions', 'usage_events', 'usage_periods', 'users',
    ]);
    for (const [table, count] of Object.entries({ organizations: 3, users: 4, plans: 3, plan_versions: 3,
      features: 3, plan_entitlements: 9, subscriptions: 3, usage_periods: 3, demo_reports: 6 })) {
      expect(Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count)).toBe(count);
    }
    const migrations = (await pool.query('SELECT version FROM schema_migrations ORDER BY version')).rows;
    expect(migrations.map((row) => row.version)).toEqual(['001_initial_plans.sql', '002_core_schema.sql']);
    expect((await pool.query('SELECT id FROM users WHERE is_active OR password_hash IS NOT NULL')).rows).toEqual([]);
    expect((await pool.query('SELECT * FROM usage_events')).rows).toEqual([]);
  });

  it('upgrades the previously deployed plans-only schema without losing existing rows or settings', async () => {
    const client = new pg.Client({ connectionString: upgradeUrl });
    await client.connect();
    try {
      await client.query(await readFile(join(root, 'db/migrations/001_initial_plans.sql'), 'utf8'));
      await client.query("CREATE TABLE schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      await client.query("INSERT INTO schema_migrations(version) VALUES ('001_initial_plans.sql')");
      await client.query("INSERT INTO plans(name,description) VALUES ('Pro','Existing edited plan'),('Custom','Keep this custom plan')");
      await client.query("INSERT INTO plan_versions(plan_id,version_number,status,monthly_price_cents,export_limit) SELECT id,1,'published',2500,42 FROM plans WHERE name='Pro'");
      const before = (await client.query("SELECT id FROM plans WHERE name='Pro'")).rows[0].id;
      await prepareDatabase(upgradeUrl);
      const plan = (await client.query("SELECT p.id,p.description,v.export_limit FROM plans p JOIN plan_versions v ON v.plan_id=p.id WHERE p.name='Pro'")).rows[0];
      expect(plan).toEqual({ id: before, description: 'Existing edited plan', export_limit: 42 });
      expect((await client.query("SELECT name FROM plans WHERE name='Custom'")).rows).toHaveLength(1);
      expect(Number((await client.query('SELECT count(*) FROM schema_migrations')).rows[0].count)).toBe(2);
      expect(Number((await client.query('SELECT count(*) FROM demo_reports')).rows[0].count)).toBe(6);
    } finally {
      await client.end();
    }
  });

  it('preserves edited records and consumed usage when migrations and seeding run again', async () => {
    const previous = (await pool.query("SELECT description FROM plans WHERE name='Pro'")).rows[0].description;
    await pool.query("UPDATE plans SET description='Preserve my edits' WHERE name='Pro'");
    await pool.query("UPDATE usage_periods SET used_count=3 WHERE organization_id=(SELECT id FROM organizations WHERE slug='summit-analytics')");
    try {
      await prepareDatabase(databaseUrl);
      await prepareDatabase(databaseUrl);
      expect((await pool.query("SELECT description FROM plans WHERE name='Pro'")).rows[0].description).toBe('Preserve my edits');
      expect((await pool.query("SELECT used_count FROM usage_periods WHERE organization_id=(SELECT id FROM organizations WHERE slug='summit-analytics')")).rows[0].used_count).toBe(3);
      for (const [table, count] of Object.entries({ plans: 3, plan_versions: 3, organizations: 3, users: 4,
        features: 3, plan_entitlements: 9, subscriptions: 3, usage_periods: 3, demo_reports: 6, schema_migrations: 2 })) {
        expect(Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count)).toBe(count);
      }
    } finally {
      await pool.query('UPDATE plans SET description=$1 WHERE name=$2', [previous, 'Pro']);
      await pool.query('UPDATE usage_periods SET used_count=0');
    }
  });

  it('does not add demo fixtures to an organization that is no longer marked as fictional', async () => {
    const client = new pg.Client({ connectionString: upgradeUrl });
    await client.connect();
    try {
      const id = (await client.query("UPDATE organizations SET is_demo=false WHERE slug='cedar-labs' RETURNING id")).rows[0].id;
      await client.query("DELETE FROM demo_reports WHERE organization_id=$1 AND slug='monthly-summary'", [id]);
      await client.query('DELETE FROM users WHERE organization_id=$1', [id]);
      await prepareDatabase(upgradeUrl);
      expect(Number((await client.query('SELECT count(*) FROM demo_reports WHERE organization_id=$1', [id])).rows[0].count)).toBe(1);
      expect(Number((await client.query('SELECT count(*) FROM users WHERE organization_id=$1', [id])).rows[0].count)).toBe(0);
    } finally {
      await client.end();
    }
  });

  it('enforces unique feature keys, case-insensitive emails, and one subscription per organization', async () => {
    await expect(pool.query("INSERT INTO features(key,name) VALUES ('view_reports','Duplicate')")).rejects.toMatchObject({ code: '23505' });
    await expect(pool.query("INSERT INTO users(name,email,role) VALUES ('Duplicate','MANAGER@EXAMPLE.TEST','product_manager')")).rejects.toMatchObject({ code: '23505' });
    await expect(pool.query('INSERT INTO subscriptions(organization_id,plan_version_id) SELECT organization_id,plan_version_id FROM subscriptions LIMIT 1')).rejects.toMatchObject({ code: '23505' });
    await expect(pool.query("INSERT INTO users(name,email,role) VALUES ('Missing organization','missing@example.test','customer')")).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects negative usage and periods that do not follow UTC calendar months', async () => {
    await expect(pool.query('UPDATE usage_periods SET used_count=-1')).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE usage_periods SET period_start=period_start+interval '1 hour'")).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE usage_periods SET period_end=period_end-interval '1 day'")).rejects.toMatchObject({ code: '23514' });
  });

  it('prevents usage records from referring to another organization\'s report', async () => {
    const period = (await pool.query('SELECT id,organization_id FROM usage_periods ORDER BY id LIMIT 1')).rows[0];
    const report = (await pool.query('SELECT id FROM demo_reports WHERE organization_id<>$1 LIMIT 1', [period.organization_id])).rows[0];
    await expect(pool.query('INSERT INTO usage_events(organization_id,usage_period_id,report_id,request_key,result_reference) VALUES ($1,$2,$3,$4,$5)',
      [period.organization_id, period.id, report.id, 'cross-organization-test', 'test-only'])).rejects.toMatchObject({ code: '23503' });
  });

  it('prevents duplicate request keys within an organization', async () => {
    await transaction(async (client) => {
      const row = (await client.query('SELECT p.id,p.organization_id,r.id AS report_id FROM usage_periods p JOIN demo_reports r ON r.organization_id=p.organization_id LIMIT 1')).rows[0];
      const sql = 'INSERT INTO usage_events(organization_id,usage_period_id,report_id,request_key,result_reference) VALUES ($1,$2,$3,$4,$5)';
      const values = [row.organization_id, row.id, row.report_id, 'repeat-request-test', 'test-only'];
      await client.query(sql, values);
      await expect(client.query(sql, values)).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('serves only explicitly public fictional reports, without account or password fields', async () => {
    await transaction(async (client) => {
      const organization = (await client.query('SELECT id FROM organizations LIMIT 1')).rows[0].id;
      await client.query("INSERT INTO demo_reports(organization_id,slug,title) VALUES ($1,'private-report','Private report')", [organization]);
      const realOrganization = (await client.query("INSERT INTO organizations(slug,name) VALUES ('not-a-demo','Private organization') RETURNING id")).rows[0].id;
      await client.query("INSERT INTO demo_reports(organization_id,slug,title,is_public_demo) VALUES ($1,'hidden','Not fictional',true)", [realOrganization]);
      const response = await request(createApp(client)).get('/api/demo/reports');
      expect(response.status).toBe(200);
      expect(response.body.reports).toHaveLength(6);
      for (const report of response.body.reports) {
        expect(Object.keys(report).sort()).toEqual(['id', 'organization_name', 'sample_data', 'title']);
        expect(report.title).not.toBe('Private report');
        expect(report.organization_name).not.toBe('Private organization');
      }
    });
  });

  it('rolls back an entire failed migration without recording it as applied', async () => {
    const badMigrations = join(directory, 'bad-migrations');
    await mkdir(badMigrations);
    await writeFile(join(badMigrations, '900_probe.sql'), 'CREATE TABLE rollback_probe(id integer);');
    await writeFile(join(badMigrations, '901_failure.sql'), 'THIS IS INVALID SQL;');
    await expect(prepareDatabase(databaseUrl, { migrationsDirectory: badMigrations })).rejects.toThrow('Database setup failed');
    expect((await pool.query("SELECT to_regclass('public.rollback_probe') AS name")).rows[0].name).toBeNull();
    expect((await pool.query("SELECT version FROM schema_migrations WHERE version IN ('900_probe.sql','901_failure.sql')")).rows).toEqual([]);
    expect(Number((await pool.query('SELECT count(*) FROM demo_reports')).rows[0].count)).toBe(6);
  });
});
