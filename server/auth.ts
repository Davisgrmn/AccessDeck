import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { Database } from './app.js';
import { hashPassword, verifyPassword } from './passwords.js';

export type User = {
  id: number;
  name: string;
  email: string;
  role: 'customer' | 'product_manager';
  organization_id: number | null;
  organization_name: string | null;
};

type Session = { token_hash: string; csrf_token: string; user: User | null };
const cookieName = 'accessdeck_session';
const lifetime = 12 * 60 * 60 * 1000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function sessionCookie(request: Request) {
  const token = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function authentication(database: Database, secureCookies: boolean) {
  async function readSession(request: Request): Promise<Session | null> {
    const token = sessionCookie(request);
    if (!token) return null;
    const result = await database.query(`
      SELECT s.token_hash, s.csrf_token, s.user_id, u.name, u.email, u.role,
        u.organization_id, u.is_active, o.name AS organization_name
      FROM auth_sessions s LEFT JOIN users u ON u.id=s.user_id
      LEFT JOIN organizations o ON o.id=u.organization_id
      WHERE s.token_hash=$1 AND s.expires_at>now()
    `, [digest(token)]);
    const row = result.rows[0];
    if (!row || (row.user_id !== null && !row.is_active)) return null;
    return { token_hash: String(row.token_hash), csrf_token: String(row.csrf_token), user: row.user_id === null ? null : {
      id: Number(row.user_id), name: String(row.name), email: String(row.email), role: row.role as User['role'],
      organization_id: row.organization_id === null ? null : Number(row.organization_id),
      organization_name: row.organization_name === null ? null : String(row.organization_name),
    } };
  }

  async function newSession(request: Request, response: Response, userId: number | null, previous?: Session | null) {
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    // Rotation is atomic: a failure leaves the previous session usable.
    await database.query(`
      WITH removed AS (DELETE FROM auth_sessions WHERE token_hash=$4)
      INSERT INTO auth_sessions(token_hash,csrf_token,user_id,expires_at) VALUES ($1,$2,$3,now()+interval '12 hours')
    `, [digest(token), csrfToken, userId, previous?.token_hash ?? '']);
    response.cookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: secureCookies || request.secure, path: '/', maxAge: lifetime });
    return csrfToken;
  }

  const load: RequestHandler = async (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.locals.session = await readSession(request);
    next();
  };
  const requireUser: RequestHandler = (_request, response, next) => {
    const session = response.locals.session as Session | null;
    if (!session?.user) { response.status(401).json({ error: 'Sign in to continue.' }); return; }
    response.locals.user = session.user;
    next();
  };
  const requireManager: RequestHandler = (_request, response, next) => {
    if ((response.locals.user as User).role !== 'product_manager') {
      response.status(403).json({ error: 'This action requires a product manager account.' }); return;
    }
    next();
  };
  const csrf: RequestHandler = (request, response, next) => {
    const session = response.locals.session as Session | null;
    const supplied = request.get('X-CSRF-Token') ?? '';
    if (!session || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(session.csrf_token))) {
      response.status(403).json({ error: 'Your session has changed or expired. Reload the page and try again.' }); return;
    }
    if (!request.is('application/json')) { response.status(415).json({ error: 'Send JSON form data.' }); return; }
    next();
  };

  const throttle: RequestHandler = async (request, response, next) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    for (const [key, maximum] of [[`ip:${request.ip}`, 100], [`account:${request.ip}:${email}`, 15]] as const) {
      const result = await database.query(`
        INSERT INTO auth_rate_limits(bucket,attempts,expires_at) VALUES ($1,1,now()+interval '15 minutes')
        ON CONFLICT (bucket) DO UPDATE SET
          attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END,
          expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE auth_rate_limits.expires_at END
        RETURNING attempts
      `, [digest(key)]);
      if (Number(result.rows[0].attempts) > maximum) {
        response.setHeader('Retry-After', '900');
        response.status(429).json({ error: 'Too many sign-in or registration attempts. Try again in 15 minutes.' }); return;
      }
    }
    next();
  };

  const router = Router();
  router.use(load);
  router.get('/session', async (request, response) => {
    let session = response.locals.session as Session | null;
    if (!session) {
      // Bounded cleanup on normal visits; no background worker is necessary.
      await database.query('DELETE FROM auth_sessions WHERE expires_at<=now()');
      await database.query('DELETE FROM auth_rate_limits WHERE expires_at<=now()');
      session = { token_hash: '', user: null, csrf_token: await newSession(request, response, null) };
    }
    response.json({ user: session.user, csrfToken: session.csrf_token });
  });

  router.post('/register', csrf, throttle, async (request, response) => {
    const { name, email, password, organizationName } = request.body ?? {};
    const errors: Record<string, string> = {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) errors.name = 'Enter your name (up to 100 characters).';
    if (typeof organizationName !== 'string' || !organizationName.trim() || organizationName.trim().length > 100) errors.organizationName = 'Enter an organization name (up to 100 characters).';
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) errors.password = 'Use a password with 12–128 characters.';
    // Reject attempted privilege/organization injection rather than silently accepting it.
    if (Object.keys(request.body ?? {}).some((key) => !['name', 'email', 'password', 'organizationName'].includes(key))) {
      response.status(400).json({ error: 'Registration only accepts a name, email, password, and new organization name.' }); return;
    }
    if (Object.keys(errors).length) { response.status(400).json({ error: 'Check the highlighted fields.', fields: errors }); return; }
    const passwordHash = await hashPassword(password);
    try {
      // One SQL statement makes account, organization, initial plan, and private
      // sample report creation atomic, including duplicate-email races.
      const result = await database.query(`
        WITH free_plan AS (
          SELECT v.id FROM plan_versions v JOIN plans p ON p.id=v.plan_id
          WHERE p.name='Free' AND p.archived_at IS NULL AND v.status='published' ORDER BY v.version_number DESC LIMIT 1
        ), org AS (
          INSERT INTO organizations(slug,name) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM free_plan) RETURNING id,name
        ), account AS (
          INSERT INTO users(organization_id,name,email,password_hash,role,is_active)
          SELECT org.id,$3,$4,$5,'customer',true FROM org RETURNING id,name,email,role,organization_id
        ), subscription AS (
          INSERT INTO subscriptions(organization_id,plan_version_id) SELECT org.id,free_plan.id FROM org CROSS JOIN free_plan
        ), report AS (
          INSERT INTO demo_reports(organization_id,slug,title,sample_data)
          SELECT id,'welcome-summary','Welcome report','[{"label":"Sample projects","value":3},{"label":"Sample reports","value":12}]'::jsonb FROM org
        ) SELECT account.*,org.name AS organization_name FROM account JOIN org ON org.id=account.organization_id
      `, ['org-' + randomBytes(12).toString('hex'), organizationName.trim(), name.trim(), email.trim().toLowerCase(), passwordHash]);
      const user = result.rows[0];
      if (!user) throw new Error('No published Free plan is available');
      const csrfToken = await newSession(request, response, Number(user.id), response.locals.session);
      response.status(201).json({ user, csrfToken });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        response.status(409).json({ error: 'This email is already registered. Sign in instead.', fields: { email: 'This email is already registered.' } }); return;
      }
      throw error;
    }
  });

  router.post('/login', csrf, throttle, async (request, response) => {
    const { email, password } = request.body ?? {};
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) {
      response.status(400).json({ error: 'Enter your email and password.' }); return;
    }
    const result = await database.query(`
      SELECT u.id,u.name,u.email,u.role,u.organization_id,u.password_hash,u.is_active,o.name AS organization_name
      FROM users u LEFT JOIN organizations o ON o.id=u.organization_id WHERE lower(u.email)=$1
    `, [email.trim().toLowerCase()]);
    const account = result.rows[0];
    const valid = await verifyPassword(password, account?.password_hash as string | null);
    if (!valid || !account.is_active) { response.status(401).json({ error: 'Email or password is incorrect.' }); return; }
    const user: User = { id: Number(account.id), name: String(account.name), email: String(account.email), role: account.role as User['role'],
      organization_id: account.organization_id === null ? null : Number(account.organization_id),
      organization_name: account.organization_name === null ? null : String(account.organization_name) };
    const csrfToken = await newSession(request, response, user.id, response.locals.session);
    response.json({ user, csrfToken });
  });

  router.post('/logout', requireUser, csrf, async (request, response) => {
    await database.query('DELETE FROM auth_sessions WHERE token_hash=$1', [(response.locals.session as Session).token_hash]);
    response.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: secureCookies || request.secure, path: '/' });
    response.sendStatus(204);
  });
  return { router, load, requireUser, requireManager };
}
