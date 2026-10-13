import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp, type Database } from '../server/app.js';

describe('initial AccessDeck API', () => {
  it('reports ready only when the database responds', async () => {
    const database: Database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const response = await request(createApp(database)).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'connected' });
  });

  it('returns 503 without exposing database credentials when PostgreSQL is unavailable', async () => {
    const database: Database = { query: vi.fn().mockRejectedValue(new Error('secret connection details')) };
    const response = await request(createApp(database)).get('/api/health');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable', database: 'disconnected' });
    expect(response.text).not.toContain('secret');
  });

  it('returns the database-backed public demonstration plans', async () => {
    const plans = [{ name: 'Free', monthly_price_cents: 0, export_limit: 0 }];
    const database: Database = { query: vi.fn().mockResolvedValue({ rows: plans }) };
    const response = await request(createApp(database)).get('/api/plans');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ plans });
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const database: Database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const response = await request(createApp(database)).get('/api/missing');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'API route not found' });
  });
});
