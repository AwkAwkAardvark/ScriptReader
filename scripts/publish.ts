import { resolveSongLinks, type SongContext, type MediaEdits } from '../src/song-links';
import { loadEnvFile } from 'node:process';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { preparePublication, validateProduction, PublicationError } from '../server/publishing';
import { supabaseRpc, type Rpc } from '../server/database';
export async function publish(argv: string[], rpcOverride?: Rpc) {
  try { loadEnvFile(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const { values } = parseArgs({ args: argv, options: { slug: { type: 'string' }, title: { type: 'string' }, script: { type: 'string' }, cast: { type: 'string' }, media: { type: 'string' }, 'remove-media': { type: 'string' }, 'acknowledge-unmatched': {type:'boolean',default:false}, publish: { type: 'boolean', default: false } } });
  if (!values.slug || !values.title || !values.script || !values.cast) throw new Error('Required: --slug --title --script --cast [--media] [--publish]');
  validateProduction(values.slug, values.title);
  const [script, cast, media] = await Promise.all([readFile(values.script, 'utf8'), readFile(values.cast, 'utf8'), values.media ? readFile(values.media, 'utf8') : undefined]);
  let payload = preparePublication(script, cast, media);
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  const rpc = rpcOverride ?? (SUPABASE_URL && SUPABASE_SECRET_KEY ? supabaseRpc(SUPABASE_URL,SUPABASE_SECRET_KEY) : undefined);
  const context = rpc ? await rpc('reader_song_context',{p_slug:values.slug}) as SongContext : {songs:[],version:null};
  const edits:MediaEdits={};
  if(values['remove-media'])for(const no of values['remove-media'].split(','))edits[no.trim()]=null;
  const resolved=resolveSongLinks(payload,context.songs,edits);payload=resolved.payload;
  if(resolved.unmatched.length && !values['acknowledge-unmatched'])throw new PublicationError('Existing linked songs could not be matched. Review mappings and explicitly use --acknowledge-unmatched before publishing.');
  if(!rpc)console.log('Existing song links were not checked: configure publisher credentials for revision-aware validation.');
  console.log(JSON.stringify({ slug: values.slug, title: values.title, records: payload.script.records.length,
    characters: payload.script.characters.length, videos: Object.keys(payload.media).length, action: values.publish ? 'publish' : 'validate only' }, null, 2));
  if (!values.publish) return;
  if (!rpcOverride && (!SUPABASE_URL || !SUPABASE_SECRET_KEY)) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in your local environment.');
  const result=await rpc!('reader_publish_checked',{p_slug:values.slug,p_title:values.title,p_payload:payload,p_expected:context.version}) as {revision?:string;error?:string};
  if(result.error)throw new PublicationError('The production changed during validation. Validate again before publishing.');
  console.log(`Published revision ${result.revision}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publish(process.argv.slice(2)).catch(error => { console.error(error instanceof PublicationError ? error.message : 'Publishing failed. Check file paths and local credentials.'); process.exitCode = 1; });
}
