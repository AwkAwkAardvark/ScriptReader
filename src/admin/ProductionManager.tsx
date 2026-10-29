import { useEffect, useRef, useState } from 'react';
import { productionCall, ProductionFailure, type ProductionList, type Upload } from './productions';
import { preparePublication, type PublishedPayload } from '../../server/publishing';
import { filterScript } from '../script';
import { buildReadingDocument } from '../reading-document';
import { ReadingContent } from '../ReadingContent';
import { ContextPicker } from '../ContextPicker';
import { copy, type Locale } from '../i18n';
import { applyActionVisibility } from '../action-visibility';
const words = {
 en: { title:'Productions', new:'New production', home:'Student homepage', blank:'Blank / file import', saveHome:'Save homepage', current:'Current home', edit:'Manage', name:'Reader title', slug:'Link identifier', before:'Default before', after:'Default after', settings:'Save production settings', script:'Script CSV', cast:'Cast CSV', media:'YouTube mapping CSV (optional)', validate:'Validate and preview', publish:'Publish', confirm:'Publish this complete revision?', cancel:'Cancel', ready:'Validation passed', preview:'Preview', korean:'Display Korean lines', actions:'Hide actions & cues', missing:'This revision has no videos. Publishing will remove the existing video associations.', unsaved:'Files are not saved until you publish.', empty:'No published productions.', saved:'Saved.', refresh:'Refresh list', date:'Published', records:'records', characters:'characters', videos:'videos', error:'Unable to complete the request. Please retry.', invalid:'Check the title, link identifier, files, and 0–5 defaults.', conflict:'This production or homepage changed. Refresh the list before trying again.', forbidden:'Your access has changed. Sign in again to check your status.', size:'Uploads must fit within a 5 MiB request.', select:'Choose a production', defaults:'Initial context', noData:'No passages for this character.' },
 ko: { title:'공연 대본', new:'새 공연', home:'학생 첫 화면', blank:'빈 화면 / 파일 불러오기', saveHome:'첫 화면 저장', current:'현재 첫 화면', edit:'관리', name:'대본 제목', slug:'링크 식별자', before:'기본 앞 대사', after:'기본 뒤 대사', settings:'공연 설정 저장', script:'대본 CSV', cast:'등장인물 CSV', media:'YouTube 연결 CSV (선택)', validate:'검사 및 미리보기', publish:'게시', confirm:'이 대본 전체를 새 버전으로 게시할까요?', cancel:'취소', ready:'검사 완료', preview:'미리보기', korean:'한국어 표기', actions:'행동 및 큐 숨기기', missing:'이 버전에는 동영상이 없습니다. 게시하면 기존 동영상 연결이 삭제됩니다.', unsaved:'게시 전까지 파일은 저장되지 않습니다.', empty:'게시된 공연이 없습니다.', saved:'저장했습니다.', refresh:'목록 새로고침', date:'게시일', records:'개 기록', characters:'명 등장인물', videos:'개 동영상', error:'요청을 완료하지 못했습니다. 다시 시도해 주세요.', invalid:'제목, 링크 식별자, 파일, 기본 대사 수(0–5)를 확인하세요.', conflict:'공연 또는 첫 화면이 변경되었습니다. 목록을 새로고침한 뒤 다시 시도하세요.', forbidden:'권한이 변경되었습니다. 다시 로그인하여 확인하세요.', size:'업로드 요청 크기는 5 MiB 이하여야 합니다.', select:'공연 선택', defaults:'기본 대사 범위', noData:'이 등장인물의 대사가 없습니다.' },
};
export function ProductionManager({ locale }: { locale: Locale }) {
 const t=words[locale];const text=copy[locale];
 const [list,setList]=useState<ProductionList|null>(null);const [selected,setSelected]=useState<string|null>(null);
 const [title,setTitle]=useState('');const [slug,setSlug]=useState('');const [defaults,setDefaults]=useState({before:2,after:1});
 const [home,setHome]=useState('');const [files,setFiles]=useState<{script?:string;cast?:string;media?:string}>({});
 const [busy,setBusy]=useState(false);const [readingFile,setReadingFile]=useState(false);const [notice,setNotice]=useState('');const [failure,setFailure]=useState<ProductionFailure|null>(null);
 const [validated,setValidated]=useState<{input:Upload;payload:PublishedPayload;records:number;characters:number;videos:number}|null>(null);
 const [character,setCharacter]=useState('');const [context,setContext]=useState({before:2,after:1});const [korean,setKorean]=useState(false);const [hide,setHide]=useState(false);
 const [confirmation,setConfirmation]=useState(false);const dialog=useRef<HTMLDialogElement>(null);const generation=useRef(0);const active=useRef(true);
 const existing=list?.productions.find(p=>p.slug===selected);
 function fail(e:unknown){if(active.current){setValidated(null);setConfirmation(false);setFailure(e instanceof ProductionFailure?e:new ProductionFailure('unavailable'));if(e instanceof ProductionFailure && ['unauthorized','forbidden'].includes(e.code)){setList(null);setFiles({});setSelected(null);}}}
 async function refresh(){const next=await productionCall<ProductionList>('productions');if(active.current){setList(next);setHome(next.home.slug??'');}return next;}
 useEffect(()=>{active.current=true;void refresh().catch(fail);return()=>{active.current=false;generation.current++;};},[]);
 useEffect(()=>{if(confirmation)dialog.current?.showModal();else dialog.current?.close();},[confirmation]);
 function reset(){generation.current++;setValidated(null);setConfirmation(false);setNotice('');setFailure(null);}
 function choose(value:string){reset();setFiles({});setReadingFile(false);setSelected(value);const p=list?.productions.find(p=>p.slug===value);setTitle(p?.title??'');setSlug(p?.slug??'');setDefaults({before:p?.before??2,after:p?.after??1});}
 async function run(operation:()=>Promise<unknown>){setBusy(true);setFailure(null);setNotice('');try{await operation();if(active.current){setNotice(t.saved);setValidated(null);setFiles({});setSelected(null);await refresh();}}catch(e){fail(e);}finally{if(active.current)setBusy(false);}}
 async function openFile(kind:'script'|'cast'|'media',file?:File){reset();if(!file){setFiles(p=>({...p,[kind]:undefined}));return;}const current=generation.current;setReadingFile(true);
  try{if(file.size>5*1024*1024)throw new ProductionFailure('too_large');const value=await file.text();if(current===generation.current)setFiles(p=>({...p,[kind]:value}));}
  catch(e){if(current===generation.current)fail(e);}finally{if(current===generation.current)setReadingFile(false);}}
 async function validate(){setBusy(true);setFailure(null);setValidated(null);const input:Upload={slug,title,...defaults,expected:existing?.version??null,script:files.script??'',cast:files.cast??'',...(files.media!==undefined?{media:files.media}:{})};
  try{const summary=await productionCall<{records:number;characters:number;videos:number}>('productions/validate','POST',input);const payload=preparePublication(input.script,input.cast,input.media);setValidated({input,payload,...summary});setCharacter(payload.script.characters[0]?.tag??'');setContext(defaults);}
  catch(e){fail(e);}finally{setBusy(false);}}
 const reading=validated&&character?applyActionVisibility(buildReadingDocument(validated.payload.script,filterScript(validated.payload.script.records,{...context,character,includeNonDialogue:!hide}),character,{...context,includeNonDialogue:!hide,showKorean:korean}),hide):null;
 const errorText=failure?(failure.code==='validation'?failure.diagnostics:failure.code==='conflict'?t.conflict:['unauthorized','forbidden'].includes(failure.code)?t.forbidden:failure.code==='too_large'?t.size:failure.code==='invalid_request'?t.invalid:t.error):null;
 return <section className="production-manager" aria-busy={busy||readingFile}>
  <div className="admin-heading"><h2>{t.title}</h2><button disabled={busy||readingFile} onClick={()=>{reset();setSelected(null);setFiles({});void run(refresh);}}>{t.refresh}</button></div>
  {errorText&&<p className="admin-error" role="alert">{errorText}</p>}{notice&&<p role="status">{notice}</p>}
  {list&&<><section className="admin-card"><label htmlFor="student-home">{t.home}</label><div className="admin-setting-row"><select id="student-home" value={home} disabled={busy} onChange={e=>setHome(e.target.value)}><option value="">{t.blank}</option>{list.productions.filter(p=>p.revision).map(p=><option key={p.slug} value={p.slug}>{p.title}</option>)}</select><button disabled={busy||home===(list.home.slug??'')} onClick={()=>void run(()=>productionCall('home','PATCH',{slug:home||null,expected:list.home.version}))}>{t.saveHome}</button></div></section>
  <section className="admin-card"><button className="admin-primary" disabled={busy||readingFile} onClick={()=>choose('')}>{t.new}</button>
   {list.productions.length?<ul className="production-list">{list.productions.map(p=><li key={p.slug}><div><strong>{p.title}</strong>{p.slug===list.home.slug&&<span className="admin-badge">{t.current}</span>}<p>{t.date}: {p.publishedAt?new Date(p.publishedAt).toLocaleDateString(locale):'—'} · {t.defaults}: {p.before}/{p.after}</p><a href={'/p/'+p.slug} target="_blank" rel="noopener noreferrer">/p/{p.slug}</a></div><button disabled={busy||readingFile} aria-label={`${t.edit}: ${p.title}`} onClick={()=>choose(p.slug)}>{t.edit}</button></li>)}</ul>:<p>{t.empty}</p>}
  </section></>}
  {list&&selected!==null&&<section className="admin-card production-editor"><h3>{existing?existing.title:t.new}</h3>
   <fieldset disabled={busy||readingFile}><label>{t.name}<input value={title} maxLength={200} onChange={e=>{reset();setTitle(e.target.value);if(!existing)setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80));}}/></label>
   <label>{t.slug}<input value={slug} maxLength={80} disabled={Boolean(existing)} onChange={e=>{reset();setSlug(e.target.value);}}/></label>
   <div className="admin-setting-row">{(['before','after']as const).map(key=><label key={key}>{t[key]}<input type="number" min={0} max={5} step={1} value={defaults[key]} onChange={e=>{reset();setDefaults(p=>({...p,[key]:e.target.valueAsNumber}));}}/></label>)}</div>
   {existing&&<button onClick={()=>void run(()=>productionCall('productions/'+existing.slug,'PATCH',{title,...defaults,expected:existing.version}))}>{t.settings}</button>}
   <p>{t.unsaved}</p>{(['script','cast','media']as const).map(kind=><label key={`${selected}:${kind}`}>{t[kind]}<input key={`${selected}:${kind}`} type="file" accept=".csv,text/csv" onChange={e=>void openFile(kind,e.target.files?.[0])}/></label>)}
   {existing&&existing.mediaCount>0&&files.media===undefined&&<p className="admin-warning">{t.missing}</p>}
   <button className="admin-primary" disabled={files.script===undefined||files.cast===undefined} onClick={()=>void validate()}>{t.validate}</button></fieldset>
   {validated&&<section className="production-preview"><h3>{t.ready}</h3><p>{validated.records} {t.records} · {validated.characters} {t.characters} · {validated.videos} {t.videos}</p><button className="admin-primary" disabled={busy} onClick={()=>setConfirmation(true)}>{t.publish}</button>
    <h3>{t.preview}</h3><label>{text.character}<select value={character} onChange={e=>setCharacter(e.target.value)}>{validated.payload.script.characters.map(c=><option key={c.tag} value={c.tag}>{c.label}</option>)}</select></label>
    <ContextPicker value={context} onChange={setContext} disabled={busy} text={text}/><label><input type="checkbox" checked={korean} onChange={e=>setKorean(e.target.checked)}/>{t.korean}</label><label><input type="checkbox" checked={hide} onChange={e=>setHide(e.target.checked)}/>{t.actions}</label>
    {reading&&<ReadingContent document={reading} text={text} media={validated.payload.media}/>}
   </section>}
  </section>}
  <dialog ref={dialog} className="admin-dialog" onCancel={()=>setConfirmation(false)}>{validated&&<><h2>{t.confirm}</h2><p>{validated.input.title} · /p/{validated.input.slug}</p>{existing&&existing.mediaCount>0&&!validated.videos&&<p>{t.missing}</p>}<div className="admin-dialog-actions"><button onClick={()=>setConfirmation(false)}>{t.cancel}</button><button className="admin-primary" disabled={busy} onClick={()=>{setConfirmation(false);void run(()=>productionCall(existing?'productions/'+existing.slug+'/publish':'productions','POST',validated.input));}}>{t.publish}</button></div></>}</dialog>
 </section>;
}
