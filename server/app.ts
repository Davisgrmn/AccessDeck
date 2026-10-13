import express, { type ErrorRequestHandler } from 'express';
import { fileURLToPath } from 'node:url';

// A small interface lets API tests verify failures without a live database.
export interface Database {
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
}

export function createApp(database: Database, frontendDirectory = fileURLToPath(new URL('../client/', import.meta.url))) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', async (_request, response) => {
    try {
      await database.query('SELECT 1');
      response.json({ status: 'ok', database: 'connected' });
    } catch {
      response.status(503).json({ status: 'unavailable', database: 'disconnected' });
    }
  });

  app.get('/api/plans', async (_request, response) => {
    const result = await database.query(`
      SELECT p.name, v.monthly_price_cents, v.export_limit
      FROM plans p JOIN plan_versions v ON v.plan_id = p.id
      WHERE p.archived_at IS NULL AND v.status = 'published' AND v.version_number = 1
      ORDER BY v.monthly_price_cents, p.name
    `);
    response.json({ plans: result.rows });
  });

  // Unknown API routes must not silently return the frontend HTML.
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API route not found' });
  });
  app.use(express.static(frontendDirectory));
  app.get('/', (_request, response) => response.sendFile('index.html', { root: frontendDirectory }));

  const handleError: ErrorRequestHandler = (_error, _request, response, _next) => {
    console.error('An application request failed. Check database availability.');
    response.status(500).json({ error: 'The request could not be completed' });
  };
  app.use(handleError);
  return app;
}
