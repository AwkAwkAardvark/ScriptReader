import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Rpc } from './database';
export async function localDatabase() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const directory = resolve('supabase/migrations');
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(directory, file), 'utf8'));
  }
  const rpc: Rpc = async (name, args) => {
    if (!['reader_publish', 'reader_fetch', 'reader_admin_access', 'reader_admin_bootstrap', 'reader_manage_productions', 'reader_home', 'reader_song_context', 'reader_publish_checked'].includes(name)) throw new Error('Unknown RPC');
    const entries = Object.entries(args);
    if (entries.some(([key]) => !/^p_[a-z_]+$/.test(key))) throw new Error('Invalid argument');
    const parameters = entries.map(([key], i) => `${key} => $${i + 1}`).join(', ');
    const result = await db.query<{ value: unknown }>(`select public.${name}(${parameters}) as value`, entries.map(([, value]) => value));
    return result.rows[0].value;
  };
  return { db, rpc };
}
