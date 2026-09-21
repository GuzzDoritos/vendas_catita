-- Run once in the Neon SQL Editor. No user accounts: a single private workspace.
BEGIN;

CREATE TABLE IF NOT EXISTS app_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO app_state (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS monthly_plans (
  month text PRIMARY KEY CHECK (month ~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'),
  gatilho_cents bigint NOT NULL CHECK (gatilho_cents BETWEEN 0 AND 10000000000),
  acelera_cents bigint NOT NULL CHECK (acelera_cents BETWEEN 0 AND 10000000000),
  incrivel_cents bigint NOT NULL CHECK (incrivel_cents BETWEEN 0 AND 10000000000),
  CHECK (gatilho_cents <= acelera_cents AND acelera_cents <= incrivel_cents)
);

CREATE TABLE IF NOT EXISTS daily_entries (
  date date PRIMARY KEY,
  month text NOT NULL REFERENCES monthly_plans(month) ON DELETE CASCADE,
  amount_cents bigint CHECK (amount_cents BETWEEN 0 AND 10000000000),
  is_day_off boolean NOT NULL DEFAULT false,
  is_closed boolean NOT NULL DEFAULT false,
  CHECK (to_char(date, 'YYYY-MM') = month),
  CHECK (NOT is_closed OR amount_cents IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS daily_entries_month_idx ON daily_entries(month);

CREATE TABLE IF NOT EXISTS login_attempts (
  id smallint PRIMARY KEY CHECK (id = 1),
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 21),
  window_start timestamptz NOT NULL
);

-- A single SELECT ensures the revision and data share the same database snapshot.
CREATE OR REPLACE FUNCTION catita_read() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'revision', revision,
    'data', jsonb_build_object('version', 1, 'months', COALESCE((
      SELECT jsonb_object_agg(p.month, jsonb_build_object(
        'goals', jsonb_build_array(p.gatilho_cents, p.acelera_cents, p.incrivel_cents),
        'days', COALESCE((SELECT jsonb_object_agg(to_char(d.date, 'YYYY-MM-DD'),
          jsonb_build_object('amount', d.amount_cents, 'off', d.is_day_off, 'closed', d.is_closed))
          FROM daily_entries d WHERE d.month = p.month), '{}'::jsonb)
      )) FROM monthly_plans p
    ), '{}'::jsonb))) FROM app_state WHERE id = 1;
$$;

-- Small personal dataset: atomically replace the validated snapshot.
-- The revision lock prevents another phone/tab from silently overwriting newer data.
CREATE OR REPLACE FUNCTION catita_replace(payload jsonb, expected_revision bigint)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE current_revision bigint;
BEGIN
  SELECT revision INTO current_revision FROM app_state WHERE id = 1 FOR UPDATE;
  IF current_revision <> expected_revision THEN RETURN NULL; END IF;

  DELETE FROM monthly_plans;
  INSERT INTO monthly_plans (month, gatilho_cents, acelera_cents, incrivel_cents)
    SELECT key, (value->'goals'->>0)::bigint, (value->'goals'->>1)::bigint,
      (value->'goals'->>2)::bigint FROM jsonb_each(payload->'months');
  INSERT INTO daily_entries (date, month, amount_cents, is_day_off, is_closed)
    SELECT d.key::date, m.key, (d.value->>'amount')::bigint,
      (d.value->>'off')::boolean, (d.value->>'closed')::boolean
    FROM jsonb_each(payload->'months') m
    CROSS JOIN LATERAL jsonb_each(m.value->'days') d;

  UPDATE app_state SET revision = current_revision + 1 WHERE id = 1;
  RETURN current_revision + 1;
END;
$$;

CREATE OR REPLACE FUNCTION catita_allow_login() RETURNS boolean LANGUAGE sql AS $$
  INSERT INTO login_attempts (id, attempts, window_start)
  VALUES (1, 1, now())
  ON CONFLICT (id) DO UPDATE SET
    attempts = CASE WHEN login_attempts.window_start <= now() - interval '15 minutes'
      THEN 1 ELSE LEAST(login_attempts.attempts + 1, 21) END,
    window_start = CASE WHEN login_attempts.window_start <= now() - interval '15 minutes'
      THEN now() ELSE login_attempts.window_start END
  RETURNING attempts <= 20;
$$;

COMMIT;
