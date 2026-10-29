import { AdminActionLink, ExternalLinkIcon } from './AdminActionLink';
import type { MediaEdits, SongLink } from '../song-links';
import type { Locale } from '../i18n';
export function SongLinksEditor({songs,edits,onChange,locale,disabled=false,previous=[],heading}:{songs:SongLink[];edits:MediaEdits;onChange:(value:MediaEdits)=>void;locale:Locale;disabled?:boolean;previous?:SongLink[];heading?:string}) {
 const ko=locale==='ko';
 const songTitle=(value:string)=>{
  const wrapped=value.trim().match(/^\(Song:\s*([\s\S]+)\)$/i);if(!wrapped)return value;
  let depth=0;for(const character of wrapped[1]){if(character==='(')depth++;if(character===')'&&--depth<0)return value;}
  return depth===0&&wrapped[1].trim()?wrapped[1].trim():value;
 };
 return <section className="song-links-editor"><h3>{heading??(ko?'노래 동영상':'Song links')}</h3>{!songs.length&&<p>{ko?'노래가 없습니다.':'No song records.'}</p>}
  {songs.map(song=>{
   const removed=edits[song.no]===null;const value=typeof edits[song.no]==='string'?edits[song.no]!:removed?'':song.video?`https://youtu.be/${song.video}`:'';
   return <fieldset disabled={disabled} key={song.no}><legend><h4 className="song-title">{songTitle(song.title)}</h4></legend>
    <div className="song-meta-row"><em className="song-line-reference">{ko?`${song.no}번 줄`:`Line ${song.no}`}</em>
     {song.video&&!removed?<AdminActionLink href={`https://youtu.be/${song.video}`} target="_blank" rel="noopener noreferrer">{ko?'현재 동영상 열기':'Open current video'}</AdminActionLink>:<button type="button" className="admin-action-link song-video-unavailable" disabled>{ko?'현재 동영상 열기':'Open current video'}<ExternalLinkIcon/></button>}
    </div>{removed&&<small className="song-removal-pending" role="status">{ko?'연결 삭제 예정':'Removal pending'}</small>}
    <label>{ko?'YouTube 링크':'YouTube URL'}<input type="url" aria-label={`${ko?'YouTube 링크':'YouTube URL'}: ${song.no}`} value={value} placeholder="https://youtu.be/…" onChange={e=>onChange({...edits,[song.no]:e.target.value})}/></label>
    {previous.some(s=>s.video)&&<label>{ko?'기존 동영상 선택':'Use an existing video'}<select aria-label={`${ko?'기존 동영상 선택':'Use an existing video'}: ${song.no}`} value="" onChange={e=>{if(e.target.value)onChange({...edits,[song.no]:`https://youtu.be/${e.target.value}`});}}><option value="">{ko?'선택':'Choose'}</option>{previous.filter(s=>s.video).map(s=><option key={s.no} value={s.video}>{songTitle(s.title)} · {ko?`${s.no}번 줄`:`Line ${s.no}`}</option>)}</select></label>}
    <div className="admin-dialog-actions song-edit-actions">{value&&<button type="button" onClick={()=>onChange({...edits,[song.no]:null})}>{ko?'연결 삭제':'Remove link'}</button>}{Object.hasOwn(edits,String(song.no))&&<button type="button" onClick={()=>{const next={...edits};delete next[song.no];onChange(next);}}>{ko?'변경 취소':'Undo change'}</button>}</div>
   </fieldset>;
  })}
 </section>;
}
