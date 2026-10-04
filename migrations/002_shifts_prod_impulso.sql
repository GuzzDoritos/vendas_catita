BEGIN;
SELECT id FROM app_state WHERE id = 1 FOR UPDATE;

ALTER TABLE monthly_plans ADD COLUMN impulso_cents bigint CHECK (impulso_cents > 0 AND impulso_cents <= gatilho_cents);
ALTER TABLE monthly_plans ADD COLUMN regular_minutes integer NOT NULL DEFAULT 500 CHECK (regular_minutes BETWEEN 0 AND 1439);
ALTER TABLE monthly_plans ADD COLUMN sunday_minutes integer NOT NULL DEFAULT 360 CHECK (sunday_minutes BETWEEN 0 AND 1439);
ALTER TABLE monthly_plans ADD COLUMN holiday_minutes integer NOT NULL DEFAULT 180 CHECK (holiday_minutes BETWEEN 0 AND 1439);
ALTER TABLE daily_entries ADD COLUMN prod_hundredths integer CHECK (prod_hundredths BETWEEN 0 AND 999999);

CREATE TABLE shift_entries (
  date date PRIMARY KEY REFERENCES daily_entries(date) ON DELETE CASCADE,
  entry1 integer CHECK (entry1 BETWEEN 0 AND 1439),
  exit1 integer CHECK (exit1 BETWEEN 0 AND 1439),
  entry2 integer CHECK (entry2 BETWEEN 0 AND 1439),
  exit2 integer CHECK (exit2 BETWEEN 0 AND 1439),
  expected_minutes integer NOT NULL CHECK (expected_minutes BETWEEN 0 AND 1439),
  holiday boolean NOT NULL DEFAULT false,
  CHECK (exit1 IS NULL OR (entry1 IS NOT NULL AND exit1 > entry1)),
  CHECK (entry2 IS NULL OR (exit1 IS NOT NULL AND entry2 > exit1)),
  CHECK (exit2 IS NULL OR (entry2 IS NOT NULL AND exit2 > entry2))
);

CREATE FUNCTION catita_read_v2() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('revision', revision, 'data', jsonb_build_object('version', 2, 'months', COALESCE((
    SELECT jsonb_object_agg(p.month, jsonb_build_object(
      'goals', jsonb_build_array(p.gatilho_cents, p.acelera_cents, p.incrivel_cents), 'impulso', p.impulso_cents,
      'hours', jsonb_build_object('regular', p.regular_minutes, 'sunday', p.sunday_minutes, 'holiday', p.holiday_minutes),
      'days', COALESCE((SELECT jsonb_object_agg(to_char(d.date, 'YYYY-MM-DD'), jsonb_build_object(
        'amount', d.amount_cents, 'off', d.is_day_off, 'closed', d.is_closed, 'prod', d.prod_hundredths)) FROM daily_entries d WHERE d.month = p.month), '{}'::jsonb),
      'shifts', COALESCE((SELECT jsonb_object_agg(to_char(s.date, 'YYYY-MM-DD'), jsonb_build_object(
        'times', jsonb_build_array(s.entry1, s.exit1, s.entry2, s.exit2), 'expected', s.expected_minutes, 'holiday', s.holiday))
        FROM shift_entries s JOIN daily_entries d ON s.date = d.date WHERE d.month = p.month), '{}'::jsonb)
    )) FROM monthly_plans p
  ), '{}'::jsonb))) FROM app_state WHERE id = 1;
$$;

CREATE FUNCTION catita_replace_v2(payload jsonb, expected_revision bigint) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE current_revision bigint;
BEGIN
  IF payload->>'version' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Unsupported data version'; END IF;
  SELECT revision INTO current_revision FROM app_state WHERE id = 1 FOR UPDATE;
  IF current_revision <> expected_revision THEN RETURN NULL; END IF;
  DELETE FROM monthly_plans;
  INSERT INTO monthly_plans (month, gatilho_cents, acelera_cents, incrivel_cents, impulso_cents, regular_minutes, sunday_minutes, holiday_minutes)
    SELECT key, (value->'goals'->>0)::bigint, (value->'goals'->>1)::bigint, (value->'goals'->>2)::bigint,
      (value->>'impulso')::bigint, (value->'hours'->>'regular')::integer, (value->'hours'->>'sunday')::integer, (value->'hours'->>'holiday')::integer
    FROM jsonb_each(payload->'months');
  INSERT INTO daily_entries (date, month, amount_cents, is_day_off, is_closed, prod_hundredths)
    SELECT d.key::date, m.key, (d.value->>'amount')::bigint, (d.value->>'off')::boolean, (d.value->>'closed')::boolean, (d.value->>'prod')::integer
    FROM jsonb_each(payload->'months') m CROSS JOIN LATERAL jsonb_each(m.value->'days') d;
  INSERT INTO shift_entries (date, entry1, exit1, entry2, exit2, expected_minutes, holiday)
    SELECT s.key::date, (s.value->'times'->>0)::integer, (s.value->'times'->>1)::integer, (s.value->'times'->>2)::integer, (s.value->'times'->>3)::integer,
      (s.value->>'expected')::integer, (s.value->>'holiday')::boolean
    FROM jsonb_each(payload->'months') m CROSS JOIN LATERAL jsonb_each(m.value->'shifts') s;
  UPDATE app_state SET revision = current_revision + 1 WHERE id = 1;
  RETURN current_revision + 1;
END;
$$;

-- Old server deployments must not silently delete new fields during snapshot saves.
CREATE OR REPLACE FUNCTION catita_replace(payload jsonb, expected_revision bigint) RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Application upgrade required';
END;
$$;
UPDATE app_state SET revision = revision + 1 WHERE id = 1;
COMMIT;
