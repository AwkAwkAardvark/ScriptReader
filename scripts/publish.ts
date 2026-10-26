import { loadEnvFile } from 'node:process';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { preparePublication, validateProduction, PublicationError } from '../server/publishing';
import { supabaseRpc, type Rpc } from '../server/database';
export async function publish(argv: string[], rpcOverride?: Rpc) {
  try { loadEnvFile(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const { values } = parseArgs({ args: argv, options: { slug: { type: 'string' }, title: { type: 'string' }, script: { type: 'string' }, cast: { type: 'string' }, media: { type: 'string' }, publish: { type: 'boolean', default: false } } });
  if (!values.slug || !values.title || !values.script || !values.cast) throw new Error('Required: --slug --title --script --cast [--media] [--publish]');
  validateProduction(values.slug, values.title);
  const [script, cast, media] = await Promise.all([readFile(values.script, 'utf8'), readFile(values.cast, 'utf8'), values.media ? readFile(values.media, 'utf8') : undefined]);
  const payload = preparePublication(script, cast, media);
  console.log(JSON.stringify({ slug: values.slug, title: values.title, records: payload.script.records.length,
    characters: payload.script.characters.length, videos: Object.keys(payload.media).length, action: values.publish ? 'publish' : 'validate only' }, null, 2));
  if (!values.publish) return;
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!rpcOverride && (!SUPABASE_URL || !SUPABASE_SECRET_KEY)) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in your local environment.');
  const revision = await (rpcOverride ?? supabaseRpc(SUPABASE_URL!, SUPABASE_SECRET_KEY!))('reader_publish', { p_slug: values.slug, p_title: values.title, p_payload: payload });
  console.log(`Published revision ${revision}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publish(process.argv.slice(2)).catch(error => { console.error(error instanceof PublicationError ? error.message : 'Publishing failed. Check file paths and local credentials.'); process.exitCode = 1; });
}
