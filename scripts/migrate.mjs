import fs from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.local before running the migration.');

// This migration uses $$ bodies for functions. Keep those bodies in one statement.
const source = await fs.readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
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
try {
  const sql = neon(process.env.DATABASE_URL);
  await sql.transaction(statements.map(statement => sql.query(statement)));
  console.log('Database schema applied successfully. Existing data preserved.');
} catch {
  console.error('Migration failed. Check the Neon connection and database permissions. No credentials were logged.');
  process.exitCode = 1;
}
