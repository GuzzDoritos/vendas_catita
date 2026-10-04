import fs from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.local before running the migration.');

// This migration uses $$ bodies for functions. Keep those bodies in one statement.
function splitStatements(source) {
  const statements = [];
  let buffer = '', inFunction = false;
  for (const line of source.split('\n')) {
    if (line.trim().startsWith('--')) continue;
    buffer += `${line}\n`;
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inFunction = !inFunction;
    if (!inFunction && line.trim().endsWith(';')) {
      const statement = buffer.trim(); buffer = '';
      if (statement !== 'BEGIN;' && statement !== 'COMMIT;') statements.push(statement);
    }
  }
  if (buffer.trim() || inFunction) throw new Error('Incomplete migration statement.');
  return statements;
}
try {
  const sql = neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const applied = new Set((await sql`SELECT name FROM schema_migrations`).map(row => row.name));
  const directory = new URL('../migrations/', import.meta.url);
  const files = (await fs.readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  const queries = [];
  for (const name of files) {
    if (applied.has(name)) continue;
    const source = await fs.readFile(new URL(name, directory), 'utf8');
    queries.push(...splitStatements(source).map(statement => sql.query(statement)));
    queries.push(sql`INSERT INTO schema_migrations (name) VALUES (${name})`);
  }
  if (queries.length) await sql.transaction(queries);
  console.log('Pending migrations applied successfully. Existing data preserved.');
} catch {
  console.error('Migration failed. Check the Neon connection and database permissions. No credentials were logged.');
  process.exitCode = 1;
}
