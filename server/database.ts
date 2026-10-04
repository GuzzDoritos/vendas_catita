import { neon } from '@neondatabase/serverless';
import type { Data } from '../src/domain.ts';

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_CONFIGURATION');
  return neon(url);
}

export async function readSnapshot(): Promise<{ data: Data; revision: number }> {
  const sql = db();
  const [row] = await sql`SELECT catita_read_v2() AS snapshot`;
  return row.snapshot;
}

export async function writeSnapshot(data: Data, revision: number): Promise<number | null> {
  const sql = db();
  const [row] = await sql`SELECT catita_replace_v2(${JSON.stringify(data)}::jsonb, ${revision}::bigint) AS revision`;
  return row.revision === null ? null : Number(row.revision);
}

export async function allowLogin(): Promise<boolean> {
  const sql = db();
  // A shared counter survives cold starts and applies across all serverless instances.
  const [row] = await sql`SELECT catita_allow_login() AS allowed`;
  return row.allowed;
}
