import { parseCast } from '../src/cast';
import { parseScript, type Script } from '../src/script';
import { readCsv } from '../src/csv';

export class PublicationError extends Error {}
export type PublishedPayload = { script: Script; media: Record<string, string> };
export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)
      ? url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1] : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
export function preparePublication(scriptCsv: string, castCsv: string, mediaCsv?: string): PublishedPayload {
  const cast = parseCast(castCsv);
  if (!cast.ok) throw new PublicationError(JSON.stringify(cast.errors));
  const parsed = parseScript(scriptCsv, cast.characters);
  if (!parsed.ok) throw new PublicationError(JSON.stringify(parsed.errors));
  const media: Record<string, string> = {};
  if (mediaCsv !== undefined) {
    const { rows, errors } = readCsv(mediaCsv, ['No', 'YouTubeURL'], 'script');
    if (errors.length) throw new PublicationError(JSON.stringify(errors));
    rows.slice(1).forEach((row, index) => {
      const record = parsed.script.records.find(record => String(record.no) === row[0]);
      const id = youtubeId(row[1]);
      if (row.length !== 2 || !record?.types.includes('Song') || !id || media[row[0]]) {
        throw new PublicationError(`Media record ${index + 2}: use a distinct Song No and a valid HTTPS YouTube video URL.`);
      }
      media[row[0]] = id;
    });
  }
  return { script: parsed.script, media };
}
export function validateProduction(slug: string, title: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80 || !title.trim() || title.length > 200) {
    throw new PublicationError('Use a lowercase production slug (letters, numbers, hyphens) and a title of 1–200 characters.');
  }
}
