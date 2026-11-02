import {youtubeId} from '../../server/publishing';
import type {MediaEdits,SongLink} from '../song-links';
/** Equivalent YouTube URLs, blank unlinked inputs and Undo do not prepare a change. */
export function changedMedia(songs:readonly SongLink[],edits:MediaEdits):MediaEdits{
 return Object.fromEntries(Object.entries(edits).filter(([no,value])=>{
  const original=songs.find(song=>String(song.no)===no)?.video;
  if(value===null)return Boolean(original);
  if(!value.trim()&&!original)return false;
  return !original||youtubeId(value)!==original;
 }));
}
