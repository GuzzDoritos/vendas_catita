import { neon } from '@neondatabase/serverless';
try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');

// A PL/pgSQL subtransaction deliberately rolls back every test mutation.
// The outer lock ensures nobody changes the workspace during the check.
const query = `DO $test$
DECLARE original jsonb; initial_revision bigint; next_revision bigint; result jsonb; attempt integer;
BEGIN
  PERFORM id FROM app_state WHERE id = 1 FOR UPDATE;
  original := catita_read();
  initial_revision := (original->>'revision')::bigint;
  BEGIN
    next_revision := catita_replace('{"version":1,"months":{"2026-09":{"goals":[10000,20000,30000],"days":{"2026-09-01":{"amount":1250,"off":false,"closed":true},"2026-09-02":{"amount":null,"off":true,"closed":false}}}}}'::jsonb, initial_revision);
    IF next_revision <> initial_revision + 1 THEN RAISE EXCEPTION 'Revision failed'; END IF;
    result := catita_read();
    IF result#>>'{data,months,2026-09,days,2026-09-01,amount}' <> '1250' THEN RAISE EXCEPTION 'Read/write failed'; END IF;
    IF result#>>'{data,months,2026-09,days,2026-09-02,amount}' IS NOT NULL THEN RAISE EXCEPTION 'Null handling failed'; END IF;
    IF catita_replace('{"version":1,"months":{}}'::jsonb, initial_revision) IS NOT NULL THEN RAISE EXCEPTION 'Conflict guard failed'; END IF;
    BEGIN
      PERFORM catita_replace('{"version":1,"months":{"2026-09":{"goals":[-1,2,3],"days":{}}}}'::jsonb, next_revision);
      RAISE EXCEPTION 'Constraint should reject negative goals';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    IF catita_read() <> result THEN RAISE EXCEPTION 'Atomic rollback failed'; END IF;
    PERFORM catita_replace('{"version":1,"months":{}}'::jsonb, next_revision);
    IF catita_read()#>'{data,months}' <> '{}'::jsonb THEN RAISE EXCEPTION 'Delete failed'; END IF;
    DELETE FROM login_attempts;
    FOR attempt IN 1..20 LOOP
      IF NOT catita_allow_login() THEN RAISE EXCEPTION 'Rate limit blocked too early'; END IF;
    END LOOP;
    IF catita_allow_login() THEN RAISE EXCEPTION 'Rate limit failed'; END IF;
    UPDATE login_attempts SET window_start = now() - interval '16 minutes';
    IF NOT catita_allow_login() THEN RAISE EXCEPTION 'Rate limit window did not reset'; END IF;
    RAISE EXCEPTION 'Rollback test records' USING ERRCODE = 'PT001';
  EXCEPTION WHEN SQLSTATE 'PT001' THEN NULL;
  END;
  IF catita_read() <> original THEN RAISE EXCEPTION 'Original data was not restored'; END IF;
END;
$test$;`;
try {
  await neon(process.env.DATABASE_URL).query(query);
  console.log('Database checks passed: write/read, null, stale revision, constraints, atomic rollback, delete and shared login rate limit. All test mutations rolled back.');
} catch {
  console.error('Database checks failed. Test changes were rolled back.');
  process.exitCode = 1;
}
