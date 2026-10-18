INSERT INTO plans (name, description) VALUES
  ('Free', 'Explore the demonstration reports.'),
  ('Pro', 'A demonstration plan for individual users.'),
  ('Team', 'A demonstration plan with a higher export allowance.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO plan_versions (plan_id, version_number, status, monthly_price_cents, export_limit)
SELECT plans.id, 1, 'published', seed.price, seed.allowance
FROM (VALUES ('Free', 0, 0), ('Pro', 1900, 10), ('Team', 4900, 100))
  AS seed(name, price, allowance)
JOIN plans ON plans.name = seed.name
ON CONFLICT (plan_id, version_number) DO NOTHING;

-- All organizations, users, and reports below are fictional public demo fixtures.
-- Seeded users are inactive and have no password; no login credentials are added.
INSERT INTO organizations (slug, name, is_demo) VALUES
  ('pine-studio', 'Pine Studio', true),
  ('summit-analytics', 'Summit Analytics', true),
  ('cedar-labs', 'Cedar Labs', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (organization_id, name, email, role)
SELECT o.id, seed.name, seed.email, 'customer'
FROM (VALUES
  ('pine-studio', 'Pine Demo Customer', 'pine.customer@example.test'),
  ('summit-analytics', 'Summit Demo Customer', 'summit.customer@example.test'),
  ('cedar-labs', 'Cedar Demo Customer', 'cedar.customer@example.test')
) AS seed(slug, name, email)
JOIN organizations o ON o.slug = seed.slug AND o.is_demo = true
ON CONFLICT (lower(email)) DO NOTHING;

INSERT INTO users (name, email, role)
VALUES ('Demo Product Manager', 'manager@example.test', 'product_manager')
ON CONFLICT (lower(email)) DO NOTHING;

INSERT INTO features (key, name, description) VALUES
  ('view_reports', 'View reports', 'View organization reports.'),
  ('expanded_summary', 'Expanded summary', 'View additional report details.'),
  ('export_csv', 'CSV export', 'Generate a CSV export within the monthly allowance.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO plan_entitlements (plan_version_id, feature_id, enabled)
SELECT v.id, f.id,
  f.key = 'view_reports' OR p.name IN ('Pro', 'Team')
FROM plans p
JOIN plan_versions v ON v.plan_id = p.id AND v.version_number = 1
CROSS JOIN features f
WHERE p.name IN ('Free', 'Pro', 'Team')
  AND f.key IN ('view_reports', 'expanded_summary', 'export_csv')
ON CONFLICT (plan_version_id, feature_id) DO NOTHING;

INSERT INTO subscriptions (organization_id, plan_version_id)
SELECT o.id, v.id
FROM (VALUES ('pine-studio', 'Free'), ('summit-analytics', 'Pro'), ('cedar-labs', 'Team')) AS seed(slug, plan)
JOIN organizations o ON o.slug = seed.slug AND o.is_demo = true
JOIN plans p ON p.name = seed.plan
JOIN plan_versions v ON v.plan_id = p.id AND v.version_number = 1
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO usage_periods (organization_id, period_start, period_end)
SELECT o.id,
  date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
  (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC'
FROM organizations o WHERE o.is_demo = true AND o.slug IN ('pine-studio', 'summit-analytics', 'cedar-labs')
ON CONFLICT (organization_id, metric, period_start) DO NOTHING;

INSERT INTO demo_reports (organization_id, slug, title, sample_data, is_public_demo)
SELECT o.id, seed.slug, seed.title, seed.data::jsonb, true
FROM (VALUES
  ('pine-studio', 'monthly-summary', 'Monthly summary', '[{"label":"Subscriptions","value":24},{"label":"Active users","value":86}]'),
  ('pine-studio', 'product-activity', 'Product activity', '[{"label":"Reports viewed","value":72},{"label":"Projects","value":8}]'),
  ('summit-analytics', 'monthly-summary', 'Monthly summary', '[{"label":"Subscriptions","value":120},{"label":"Active users","value":480}]'),
  ('summit-analytics', 'product-activity', 'Product activity', '[{"label":"Reports viewed","value":350},{"label":"Projects","value":32}]'),
  ('cedar-labs', 'monthly-summary', 'Monthly summary', '[{"label":"Subscriptions","value":280},{"label":"Active users","value":1120}]'),
  ('cedar-labs', 'product-activity', 'Product activity', '[{"label":"Reports viewed","value":960},{"label":"Projects","value":64}]')
) AS seed(organization_slug, slug, title, data)
JOIN organizations o ON o.slug = seed.organization_slug AND o.is_demo = true
ON CONFLICT (organization_id, slug) DO NOTHING;
