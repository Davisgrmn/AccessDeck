-- Store only a digest of the random browser session ID. Anonymous sessions carry
-- CSRF tokens for registration/sign-in; authentication replaces the session ID.
CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY,
  csrf_token text NOT NULL,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions (expires_at);

-- Login/registration throttles survive process restarts on the single EC2 host.
CREATE TABLE auth_rate_limits (
  bucket text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits (expires_at);
