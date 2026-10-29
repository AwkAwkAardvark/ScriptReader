import { AdminActionLink } from './AdminActionLink';
import type { MediaEdits, SongLink } from '../song-links';
import type { Locale } from '../i18n';
export function SongLinksEditor({songs,edits,onChange,locale,disabled=false,previous=[],heading}:{songs:SongLink[];edits:MediaEdits;onChange:(value:MediaEdits)=>void;locale:Locale;disabled?:boolean;previous?:SongLink[];heading?:string}) {
 const ko=locale==='ko';
 return <section className="song-links-editor"><h3>{heading??(ko?'노래 동영상':'Song links')}</h3>{!songs.length&&<p>{ko?'노래가 없습니다.':'No song records.'}</p>}
  {songs.map(song=>{
   const removed=edits[song.no]===null;const value=typeof edits[song.no]==='string'?edits[song.no]!:removed?'':song.video?`https://youtu.be/${song.video}`:'';
   return <fieldset disabled={disabled} key={song.no}><legend>{song.no} · {song.title}</legend>
    <p>{removed?(ko?'연결 삭제 예정':'Link will be removed'):song.video?(ko?'기존 연결 있음':'Existing link'):(ko?'연결 없음':'No link')}</p>
    {song.video&&!removed&&<AdminActionLink href={`https://youtu.be/${song.video}`} target="_blank" rel="noopener noreferrer">{ko?'현재 동영상 열기':'Open current video'}</AdminActionLink>}
    <label>{ko?'YouTube 링크':'YouTube URL'}<input type="url" aria-label={`${ko?'YouTube 링크':'YouTube URL'}: ${song.no}`} value={value} placeholder="https://youtu.be/…" onChange={e=>onChange({...edits,[song.no]:e.target.value})}/></label>
    {previous.some(s=>s.video)&&<label>{ko?'기존 동영상 선택':'Use an existing video'}<select aria-label={`${ko?'기존 동영상 선택':'Use an existing video'}: ${song.no}`} value="" onChange={e=>{if(e.target.value)onChange({...edits,[song.no]:`https://youtu.be/${e.target.value}`});}}><option value="">{ko?'선택':'Choose'}</option>{previous.filter(s=>s.video).map(s=><option key={s.no} value={s.video}>{s.no} · {s.title}</option>)}</select></label>}
    <div className="admin-dialog-actions">{value&&<button type="button" onClick={()=>onChange({...edits,[song.no]:null})}>{ko?'연결 삭제':'Remove link'}</button>}{Object.hasOwn(edits,String(song.no))&&<button type="button" onClick={()=>{const next={...edits};delete next[song.no];onChange(next);}}>{ko?'변경 취소':'Undo change'}</button>}</div>
   </fieldset>;
  })}
 </section>;
}
