import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, chmod, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import pg from 'pg';
import { root, settings, checkPrerequisites, postgresTools, connectionString, run } from './runtime.mjs';
import { prepareDatabase } from './db.mjs';

let child;
let ownedDatabase;
let stopping = false;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopping = true;
    child?.kill('SIGTERM');
  });
}

try {
  const config = settings();
  checkPrerequisites(config);
  if (!existsSync(join(root, 'dist', 'server', 'main.js'))) {
    throw new Error('The application has not been built. Run ./start.sh first.');
  }
  if (!config.externalDatabase) {
    const tools = postgresTools();
    const local = join(root, '.local');
    const data = join(local, 'postgres');
    await mkdir(local, { recursive: true, mode: 0o700 });
    await chmod(local, 0o700);

    if (!config.password) {
      if (existsSync(join(data, 'PG_VERSION'))) {
        throw new Error('Local database credentials are missing. Restore LOCAL_DATABASE_PASSWORD in .env; existing data has been preserved.');
      }
      config.password = randomBytes(32).toString('hex');
      const environmentPath = join(root, '.env');
      const previous = existsSync(environmentPath) ? await readFile(environmentPath, 'utf8') : '';
      const passwordLine = 'LOCAL_DATABASE_PASSWORD=' + config.password;
      const content = /^LOCAL_DATABASE_PASSWORD=.*$/m.test(previous)
        ? previous.replace(/^LOCAL_DATABASE_PASSWORD=.*$/m, passwordLine)
        : previous + '\n' + passwordLine + '\n';
      await writeFile(environmentPath, content, { mode: 0o600 });
      await chmod(environmentPath, 0o600);
      console.log('Generated local database credentials in .env.');
    }

    if (!existsSync(join(data, 'PG_VERSION'))) {
      const passwordFile = join(local, 'initdb-password');
      await writeFile(passwordFile, config.password + '\n', { mode: 0o600 });
      try {
        run(tools.initdb, ['-D', data, '--username=accessdeck', '--encoding=UTF8',
          '--no-locale', '--auth-local=scram-sha-256', '--auth-host=scram-sha-256',
          '--pwfile=' + passwordFile], 'PostgreSQL initialization');
      } finally {
        await unlink(passwordFile);
      }
      console.log('Created the private local PostgreSQL cluster.');
    }

    const running = spawnSync(tools.pgCtl, ['-D', data, 'status'], { stdio: 'ignore' }).status === 0;
    if (!running) {
      run(tools.pgCtl, ['-D', data, '-l', join(local, 'postgres.log'), '-o',
        '-h 127.0.0.1 -p ' + config.databasePort + " -k ''", '-w', '-t', '20', 'start'],
        'Local PostgreSQL startup');
      ownedDatabase = { command: tools.pgCtl, data };
    }

    const admin = new pg.Client({
      connectionString: 'postgresql://accessdeck:' + encodeURIComponent(config.password) +
        '@127.0.0.1:' + config.databasePort + '/postgres',
      connectionTimeoutMillis: 5000,
    });
    try {
      await admin.connect();
      const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'accessdeck'");
      if (existing.rowCount === 0) await admin.query('CREATE DATABASE accessdeck');
    } catch {
      throw new Error('Cannot open the private database. Check LOCAL_DATABASE_PORT and LOCAL_DATABASE_PASSWORD, and .local/postgres.log.');
    } finally {
      await admin.end();
    }
  }

  const databaseUrl = connectionString(config);
  await prepareDatabase(databaseUrl);
  if (!stopping) {
    child = spawn(process.execPath, [join(root, 'dist', 'server', 'main.js')], {
      cwd: root, stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl, HOST: config.host, PORT: String(config.port) },
    });
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (exitCode) => resolve(exitCode ?? (stopping ? 0 : 1)));
    });
    process.exitCode = stopping ? 0 : code;
  }
} catch (error) {
  console.error('Cannot start AccessDeck: ' + error.message);
  process.exitCode = 1;
} finally {
  if (ownedDatabase) {
    console.log('\nStopping the local PostgreSQL instance started by this process...');
    const result = spawnSync(ownedDatabase.command, ['-D', ownedDatabase.data, '-m', 'fast', '-w', '-t', '20', 'stop'],
      { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) {
      console.error('PostgreSQL did not stop cleanly. Check .local/postgres.log.');
      process.exitCode = 1;
    }
  }
}
