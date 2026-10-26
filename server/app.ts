import express, { type ErrorRequestHandler } from 'express';
import { fileURLToPath } from 'node:url';
import { authentication, type User } from './auth.js';

// A small interface lets API tests verify failures without a live database.
export interface Database {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export function createApp(database: Database, frontendDirectory = fileURLToPath(new URL('../client/', import.meta.url)), options: { secureCookies?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Only the local Nginx proxy may supply the request protocol/client address.
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '16kb' }));
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  const auth = authentication(database, options.secureCookies ?? process.env.SESSION_COOKIE_SECURE === 'true');
  app.use('/api/auth', auth.router);

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

  // Only explicitly public fixtures may appear on the public landing page.
  app.get('/api/demo/reports', async (_request, response) => {
    const result = await database.query(`
      SELECT r.id, o.name AS organization_name, r.title, r.sample_data
      FROM demo_reports r JOIN organizations o ON o.id = r.organization_id
      WHERE o.is_demo = true AND r.is_public_demo = true
      ORDER BY o.name, r.title
    `);
    response.json({ reports: result.rows });
  });

  app.get('/api/dashboard', auth.load, auth.requireUser, async (_request, response) => {
    const user = response.locals.user as User;
    if (user.role === 'product_manager') {
      const result = await database.query(`SELECT
        (SELECT count(*)::integer FROM organizations) AS organizations,
        (SELECT count(*)::integer FROM users WHERE role='customer' AND is_active) AS customers,
        (SELECT count(*)::integer FROM plans WHERE archived_at IS NULL) AS plans`);
      response.json({ user, summary: result.rows[0] });
    } else {
      response.json({ user });
    }
  });

  app.get('/api/manager/organizations', auth.load, auth.requireUser, auth.requireManager, async (_request, response) => {
    const result = await database.query(`
      SELECT o.id,o.name,o.created_at,p.name AS plan_name,s.status
      FROM organizations o LEFT JOIN subscriptions s ON s.organization_id=o.id
      LEFT JOIN plan_versions v ON v.id=s.plan_version_id LEFT JOIN plans p ON p.id=v.plan_id
      ORDER BY o.created_at DESC,o.id DESC LIMIT 100
    `);
    response.json({ organizations: result.rows });
  });

  app.get('/api/organizations/:organizationId', auth.load, auth.requireUser, async (request, response) => {
    const id = Number(request.params.organizationId);
    const user = response.locals.user as User;
    if (!Number.isSafeInteger(id) || id < 1) { response.status(404).json({ error: 'Organization not found.' }); return; }
    if (user.role !== 'product_manager' && user.organization_id !== id) {
      response.status(403).json({ error: 'You can only access your own organization.' }); return;
    }
    const result = await database.query(`
      SELECT o.id,o.name,o.created_at,p.name AS plan_name,v.version_number,v.monthly_price_cents,v.export_limit,s.status,
        COALESCE(u.used_count,0) AS used_count
      FROM organizations o LEFT JOIN subscriptions s ON s.organization_id=o.id
      LEFT JOIN plan_versions v ON v.id=s.plan_version_id LEFT JOIN plans p ON p.id=v.plan_id
      LEFT JOIN usage_periods u ON u.organization_id=o.id AND u.metric='csv_exports'
        AND u.period_start=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      WHERE o.id=$1
    `, [id]);
    if (!result.rows[0]) { response.status(404).json({ error: 'Organization not found.' }); return; }
    const reports = await database.query('SELECT id,title,sample_data FROM demo_reports WHERE organization_id=$1 ORDER BY title,id', [id]);
    response.json({ organization: result.rows[0], reports: reports.rows });
  });

  // Unknown API routes must not silently return the frontend HTML.
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API route not found' });
  });
  app.use(express.static(frontendDirectory));
  app.get(['/', '/login', '/register', '/dashboard', '/organization', '/manage', '/organizations/:organizationId'],
    (_request, response) => response.sendFile('index.html', { root: frontendDirectory }));

  const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      response.status(error.status).json({ error: error.status === 413 ? 'The submitted form is too large.' : 'The submitted JSON is invalid.' }); return;
    }
    console.error('An application request failed. Check database availability.');
    response.status(500).json({ error: 'The request could not be completed' });
  };
  app.use(handleError);
  return app;
}
