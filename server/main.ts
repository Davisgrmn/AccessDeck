import pg from 'pg';
import { createApp } from './app.js';

const database = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);

try {
  if (!process.env.DATABASE_URL) throw new Error('Database configuration is missing');
  await database.query('SELECT 1');
  const server = createApp(database).listen(port, host, () => {
    const urlHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log(`\nAccessDeck is ready: http://${urlHost}:${port}/`);
    console.log(`Health check: http://${urlHost}:${port}/api/health`);
    console.log('Press Ctrl+C to stop.');
  });
  server.on('error', async (error: NodeJS.ErrnoException) => {
    console.error(error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Stop the other app or set PORT in .env.`
      : 'Unable to start the HTTP server. Check HOST and PORT in .env.');
    await database.end();
    process.exitCode = 1;
  });
  database.on('error', () => console.error('The database connection was interrupted.'));
  let shuttingDown = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      server.close(() => { void database.end(); });
      server.closeIdleConnections();
    });
  }
} catch {
  console.error('Cannot connect to PostgreSQL. Run ./start.sh and check the database configuration.');
  await database.end();
  process.exitCode = 1;
}
