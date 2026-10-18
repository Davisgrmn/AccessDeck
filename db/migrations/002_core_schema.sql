-- Initial core data model. Authentication, CRUD, and export enforcement are
-- implemented in later checkpoints; optional payment-provider tables are omitted.
CREATE TABLE organizations (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer REFERENCES organizations(id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  email text NOT NULL CHECK (btrim(email) <> ''),
  password_hash text,
  role text NOT NULL CHECK (role IN ('customer', 'product_manager')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role = 'product_manager' OR organization_id IS NOT NULL),
  CHECK (NOT is_active OR (password_hash IS NOT NULL AND btrim(password_hash) <> ''))
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE features (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  archived_at timestamptz
);

CREATE TABLE plan_entitlements (
  plan_version_id integer NOT NULL REFERENCES plan_versions(id),
  feature_id integer NOT NULL REFERENCES features(id),
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (plan_version_id, feature_id)
);

CREATE TABLE subscriptions (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL UNIQUE REFERENCES organizations(id),
  plan_version_id integer NOT NULL REFERENCES plan_versions(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'canceled')),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_plan_status ON subscriptions (plan_version_id, status);

CREATE TABLE usage_periods (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  metric text NOT NULL DEFAULT 'csv_exports' CHECK (metric = 'csv_exports'),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  UNIQUE (organization_id, metric, period_start),
  UNIQUE (id, organization_id),
  CHECK ((period_start AT TIME ZONE 'UTC') = date_trunc('month', period_start AT TIME ZONE 'UTC')),
  CHECK ((period_end AT TIME ZONE 'UTC') = (period_start AT TIME ZONE 'UTC') + interval '1 month')
);

CREATE TABLE demo_reports (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  slug text NOT NULL,
  title text NOT NULL CHECK (btrim(title) <> ''),
  sample_data jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sample_data) = 'array'),
  is_public_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  UNIQUE (id, organization_id)
);

CREATE TABLE usage_events (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  usage_period_id integer NOT NULL,
  request_key text NOT NULL CHECK (btrim(request_key) <> ''),
  report_id integer NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity = 1),
  result_reference text NOT NULL CHECK (btrim(result_reference) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, request_key),
  FOREIGN KEY (usage_period_id, organization_id) REFERENCES usage_periods(id, organization_id),
  FOREIGN KEY (report_id, organization_id) REFERENCES demo_reports(id, organization_id)
);

CREATE TABLE audit_logs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id integer REFERENCES users(id),
  organization_id integer REFERENCES organizations(id),
  action text NOT NULL CHECK (btrim(action) <> ''),
  target_type text NOT NULL CHECK (btrim(target_type) <> ''),
  target_id integer NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_organization_date ON audit_logs (organization_id, created_at DESC);
