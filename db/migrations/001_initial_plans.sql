-- Only the plan data needed by the initial landing page is implemented here.
-- Accounts, entitlements, subscriptions, and usage follow in later checkpoints.
CREATE TABLE plans (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  archived_at timestamptz
);

CREATE TABLE plan_versions (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id integer NOT NULL REFERENCES plans(id),
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  monthly_price_cents integer NOT NULL CHECK (monthly_price_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  export_limit integer NOT NULL CHECK (export_limit >= 0),
  UNIQUE (plan_id, version_number)
);
