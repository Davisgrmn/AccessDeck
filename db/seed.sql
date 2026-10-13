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
