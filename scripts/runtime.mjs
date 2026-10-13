import { existsSync, readdirSync, accessSync, constants } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { dirname, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function settings() {
  if (existsSync(join(root, '.env'))) loadEnvFile(join(root, '.env'));
  const port = readPort('PORT', 3000);
  const databasePort = readPort('LOCAL_DATABASE_PORT', 54329);
  const host = process.env.HOST || '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '0.0.0.0'].includes(host)) {
    throw new Error('HOST must be 127.0.0.1, localhost, or 0.0.0.0.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
    }
  }
  return { port, host, databasePort, password: process.env.LOCAL_DATABASE_PASSWORD || '',
    externalDatabase: process.env.DATABASE_URL || '' };
}

function readPort(name, fallback) {
  const value = process.env[name] || String(fallback);
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(name + ' must be a whole number between 1 and 65535.');
  }
  return Number(value);
}

export function postgresTools() {
  const candidates = (process.env.PATH || '').split(delimiter);
  const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  if (pgConfig.status === 0) candidates.unshift(pgConfig.stdout.trim());
  const linuxRoot = '/usr/lib/postgresql';
  if (existsSync(linuxRoot)) {
    for (const version of readdirSync(linuxRoot).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      candidates.push(join(linuxRoot, version, 'bin'));
    }
  }
  for (const directory of candidates.filter(Boolean)) {
    try {
      const initdb = join(directory, 'initdb');
      const pgCtl = join(directory, 'pg_ctl');
      accessSync(initdb, constants.X_OK);
      accessSync(pgCtl, constants.X_OK);
      const result = spawnSync(initdb, ['--version'], { encoding: 'utf8' });
      const major = Number(result.stdout?.match(/PostgreSQL\)\s+(\d+)/)?.[1]);
      if (result.status === 0 && major >= 14) return { initdb, pgCtl };
    } catch { /* Try the next installation directory. */ }
  }
  throw new Error('Missing prerequisite: PostgreSQL 14+ server tools (initdb and pg_ctl). See README.md.');
}

export function checkPrerequisites(config) {
  if (process.platform !== 'linux') {
    throw new Error('Run ./start.sh on Linux. On Windows, use WSL Ubuntu with Linux Node.js and PostgreSQL.');
  }
  if (!config.externalDatabase) {
    if (process.getuid?.() === 0) {
      throw new Error('Run ./start.sh as your regular user, without sudo. PostgreSQL cannot run as root.');
    }
    postgresTools();
  }
}

export function connectionString(config) {
  return config.externalDatabase || 'postgresql://accessdeck:' +
    encodeURIComponent(config.password) + '@127.0.0.1:' + config.databasePort + '/accessdeck';
}

export function run(command, args, label, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) {
    if (result.stderr?.trim()) console.error(result.stderr.trim());
    throw new Error(label + ' failed. Check the message above and .local/postgres.log if present.');
  }
  return result;
}
