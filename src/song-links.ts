import { youtubeId, type PublishedPayload, PublicationError } from '../server/publishing';
export type SongLink = { no: number; title: string; video?: string };
export type SongContext = { songs: SongLink[]; version: string | null; payload?: PublishedPayload; title?: string; before?: number; after?: number; error?: string };
export type MediaEdits = Record<string, string | null>;
export const songLinks = (payload: PublishedPayload): SongLink[] => payload.script.records.filter(r=>r.types.includes('Song')).map(r=>({no:r.no,title:r.source.English,...(payload.media[r.no]?{video:payload.media[r.no]}:{})}));
const titleKey=(title:string)=>title.trim().replace(/\s+/g,' ').toLowerCase();
export function resolveSongLinks(payload: PublishedPayload, previous: SongLink[] = [], edits: MediaEdits = {}) {
 const songs=songLinks(payload);const count=(list:SongLink[],title:string)=>list.filter(s=>titleKey(s.title)===titleKey(title)).length;
 const media:Record<string,string>={};const matched=new Set<number>();
 for(const song of songs){
  const old=previous.find(s=>titleKey(s.title)===titleKey(song.title));
  if(old&&count(previous,song.title)===1&&count(songs,song.title)===1){matched.add(old.no);if(old.video)media[song.no]=old.video;}
  if(payload.media[song.no])media[song.no]=payload.media[song.no];
 }
 for(const [no,url]of Object.entries(edits)){
  if(!songs.some(s=>String(s.no)===no) || url!==null && typeof url!=='string')throw new PublicationError('Choose a detected song and a valid YouTube URL, or explicitly remove its link.');
  if(url===null)delete media[no];else {const id=youtubeId(url);if(!id)throw new PublicationError('Enter a valid HTTPS YouTube URL.');media[no]=id;}
 }
 return {payload:{...payload,media},songs:songs.map(s=>({...s,video:media[s.no]})),unmatched:previous.filter(s=>s.video&&!matched.has(s.no))};
}
