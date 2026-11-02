import {useUnsavedChanges} from './useUnsavedChanges';
import {changedMedia} from './unsaved-edits';
import {ProductionPicker} from './ProductionPicker';
import {replaceAdminUrl} from './AdminLayout';
import { AdminActionLink } from './AdminActionLink';
import { CsvExample } from './CsvExample';
import { SongLinksEditor } from './SongLinksEditor';
import type { SongContext, SongLink, MediaEdits } from '../song-links';
import { useEffect, useRef, useState } from 'react';
import { productionCall, ProductionFailure, type ProductionList, type Upload, type ManagedProduction, type HomeSetting } from './productions';
import { preparePublication, type PublishedPayload } from '../../server/publishing';
import { filterScript } from '../script';
import { buildReadingDocument } from '../reading-document';
import { ReadingContent } from '../ReadingContent';
import { ContextPicker } from '../ContextPicker';
import { copy, type Locale } from '../i18n';
import { applyActionVisibility } from '../action-visibility';
const words = {
 en: { title:'Productions', new:'New production', home:'Student homepage', blank:'Blank / file import', saveHome:'Save homepage', current:'Current home', edit:'Manage', name:'Reader title', slug:'Link identifier', before:'Default before', after:'Default after', settings:'Save production settings', script:'Script CSV', cast:'Cast CSV', media:'YouTube mapping CSV (optional)', validate:'Validate and preview', publish:'Publish', confirm:'Publish this complete revision?', cancel:'Cancel', ready:'Validation passed', preview:'Preview', korean:'Display Korean lines', actions:'Hide actions & cues', unsaved:'Files are not saved until you publish.', empty:'No published productions.', saved:'Saved.', refresh:'Refresh list', date:'Published', records:'records', characters:'characters', videos:'videos', error:'Unable to complete the request. Please retry.', invalid:'Check the title, files, and 0–5 defaults.', conflict:'This production or homepage changed. Refresh the list before trying again.', forbidden:'Your access has changed. Sign in again to check your status.', size:'Uploads must fit within a 5 MiB request.', select:'Choose a production', defaults:'Initial context', noData:'No passages for this character.' },
 ko: { title:'공연 대본', new:'새 공연', home:'학생 첫 화면', blank:'빈 화면 / 파일 불러오기', saveHome:'첫 화면 저장', current:'현재 첫 화면', edit:'관리', name:'대본 제목', slug:'링크 식별자', before:'기본 앞 대사', after:'기본 뒤 대사', settings:'공연 설정 저장', script:'대본 CSV', cast:'등장인물 CSV', media:'YouTube 연결 CSV (선택)', validate:'검사 및 미리보기', publish:'게시', confirm:'이 대본 전체를 새 버전으로 게시할까요?', cancel:'취소', ready:'검사 완료', preview:'미리보기', korean:'한국어 표기', actions:'행동 및 큐 숨기기', unsaved:'게시 전까지 파일은 저장되지 않습니다.', empty:'게시된 공연이 없습니다.', saved:'저장했습니다.', refresh:'목록 새로고침', date:'게시일', records:'개 기록', characters:'명 등장인물', videos:'개 동영상', error:'요청을 완료하지 못했습니다. 다시 시도해 주세요.', invalid:'제목, 파일, 기본 대사 수(0–5)를 확인하세요.', conflict:'공연 또는 첫 화면이 변경되었습니다. 목록을 새로고침한 뒤 다시 시도하세요.', forbidden:'권한이 변경되었습니다. 다시 로그인하여 확인하세요.', size:'업로드 요청 크기는 5 MiB 이하여야 합니다.', select:'공연 선택', defaults:'기본 대사 범위', noData:'이 등장인물의 대사가 없습니다.' },
};
export function ProductionManager({ locale }: { locale: Locale }) {
 const t=words[locale];const text=copy[locale];
 const [list,setList]=useState<ProductionList|null>(null);const [selected,setSelected]=useState<string|null>(null);
 const [title,setTitle]=useState('');const [slug,setSlug]=useState('');const [defaults,setDefaults]=useState({before:2,after:1});
 const [editorBaseline,setEditorBaseline]=useState<ManagedProduction|null>(null);const [homeBaseline,setHomeBaseline]=useState<HomeSetting|null>(null);
 const [selectedFiles,setSelectedFiles]=useState<Record<string,boolean>>({});const [fileInputKey,setFileInputKey]=useState(0);
 const draftEpoch=useRef(0);const fileTokens=useRef<Record<string,number>>({});const pendingReads=useRef<Record<string,boolean>>({});
 const [home,setHome]=useState('');const [files,setFiles]=useState<{script?:string;cast?:string;media?:string}>({});
 const [busy,setBusy]=useState(false);const [readingFile,setReadingFile]=useState(false);const [notice,setNotice]=useState('');const [failure,setFailure]=useState<ProductionFailure|null>(null);
 const [validated,setValidated]=useState<{input:Upload;payload:PublishedPayload;songs:SongLink[];baselineSongs:SongLink[];unmatched:SongLink[];records:number;characters:number;videos:number}|null>(null);
 const [songContext,setSongContext]=useState<SongContext>({songs:[],version:null});
 const [uploadEdits,setUploadEdits]=useState<MediaEdits>({});
 const [reviewOpen,setReviewOpen]=useState(false);
 const [verified,setVerified]=useState(false);const [acknowledged,setAcknowledged]=useState(false);
 const [character,setCharacter]=useState('');const [context,setContext]=useState({before:2,after:1});const [korean,setKorean]=useState(false);const [hide,setHide]=useState(false);
 const [confirmation,setConfirmation]=useState(false);const dialog=useRef<HTMLDialogElement>(null);const generation=useRef(0);const active=useRef(true);
 const generatedSuffix=useRef(crypto.randomUUID().slice(0,6));
 const existing=editorBaseline;
 const settingsDirty=selected!==null&&(title.trim()!==(existing?.title??'')||defaults.before!==(existing?.before??2)||defaults.after!==(existing?.after??1));
 const uploadDirty=Object.values(selectedFiles).some(Boolean)||Object.keys(changedMedia(validated?.baselineSongs??[],uploadEdits)).length>0;
 const homeDirty=Boolean(homeBaseline)&&home!==(homeBaseline?.slug??'');
 const guard=useUnsavedChanges(settingsDirty||uploadDirty||homeDirty,locale,busy);
 function reset(){draftEpoch.current++;setReviewOpen(false);setVerified(false);setAcknowledged(false);setValidated(null);setConfirmation(false);setNotice('');setFailure(null);}
 function clearUploads(){reset();setFiles({});setSelectedFiles({});setUploadEdits({});setFileInputKey(value=>value+1);}
 function clearEditor(){generation.current++;pendingReads.current={};setReadingFile(false);clearUploads();setSongContext({songs:[],version:null});}
 function fail(e:unknown){if(active.current){setConfirmation(false);setFailure(e instanceof ProductionFailure?e:new ProductionFailure('unavailable'));if(e instanceof ProductionFailure && ['unauthorized','forbidden'].includes(e.code)){clearEditor();setList(null);setHomeBaseline(null);setHome('');setEditorBaseline(null);setSelected(null);setFailure(e);}}}
 async function refresh(){const next=await productionCall<ProductionList>('productions');if(active.current){setList(next);setHome(next.home.slug??'');setHomeBaseline(next.home);}return next;}
 useEffect(()=>{active.current=true;void refresh().then(next=>{const params=new URLSearchParams(window.location.search);const value=params.get('production');if(value&&next.productions.some(p=>p.slug===value))void choose(value,next);else if(params.has('new'))void choose('',next);}).catch(fail);return()=>{active.current=false;generation.current++;draftEpoch.current++;};},[]);
 useEffect(()=>{if(confirmation)dialog.current?.showModal();else dialog.current?.close();},[confirmation]);
 async function choose(value:string,nextList:ProductionList|null=list){clearEditor();const p=nextList?.productions.find(p=>p.slug===value);setEditorBaseline(p??null);setSelected(value);setTitle(p?.title??'');setSlug(p?.slug??'');setDefaults({before:p?.before??2,after:p?.after??1});
  const params=new URLSearchParams(window.location.search);params.delete('production');params.delete('new');if(value)params.set('production',value);else params.set('new','1');replaceAdminUrl(window.location.pathname+'?'+params);
  const current=generation.current;setReadingFile(Boolean(p));try{if(p){const context=await productionCall<SongContext>('productions/'+p.slug+'/songs');if(context.version!==p.version)throw new ProductionFailure('conflict');if(active.current&&current===generation.current)setSongContext(context);}}catch(e){if(current===generation.current)fail(e);}finally{if(active.current&&current===generation.current)setReadingFile(false);}
 }
 async function refreshAll(){setBusy(true);setFailure(null);try{const next=await productionCall<ProductionList>('productions');if(active.current){clearEditor();setSelected(null);setEditorBaseline(null);setList(next);setHome(next.home.slug??'');setHomeBaseline(next.home);const params=new URLSearchParams(window.location.search);params.delete('production');params.delete('new');replaceAdminUrl(window.location.pathname+(params.size?'?'+params:''));}}catch(e){fail(e);}finally{if(active.current)setBusy(false);}}
 async function run(kind:'home'|'settings'|'publish'){
  const targetHome=home;const savedSettings={title:title.trim(),...defaults};const upload=validated?.input;
  setBusy(true);setFailure(null);setNotice('');
  try{
   if(kind==='home')await productionCall('home','PATCH',{slug:targetHome||null,expected:homeBaseline?.version});
   else if(kind==='settings')await productionCall('productions/'+existing!.slug,'PATCH',{...savedSettings,expected:existing!.version});
   else await productionCall(existing?'productions/'+existing.slug+'/publish':'productions','POST',{...upload,acknowledgeUnmatched:acknowledged});
   const next=await productionCall<ProductionList>('productions');if(!active.current)return;
   if(kind==='home'){
    if(next.home.slug!==(targetHome||null))throw new ProductionFailure('conflict');
    setHomeBaseline(next.home);setHome(next.home.slug??'');setList(next);
   }else{
    const p=next.productions.find(p=>p.slug===(kind==='settings'?existing!.slug:upload!.slug));
    if(!p||p.title!==savedSettings.title||p.before!==savedSettings.before||p.after!==savedSettings.after||kind==='settings'&&p.revision!==existing!.revision)throw new ProductionFailure('conflict');
    if(kind==='settings'){setEditorBaseline(p);setTitle(p.title);setDefaults({before:p.before,after:p.after});setSongContext(old=>({...old,version:p.version}));setList(next);reset();}
    else {const songs=await productionCall<SongContext>('productions/'+p.slug+'/songs');if(!active.current)return;if(songs.version!==p.version)throw new ProductionFailure('conflict');clearEditor();setEditorBaseline(p);setSelected(p.slug);setTitle(p.title);setSlug(p.slug);setDefaults({before:p.before,after:p.after});setSongContext(songs);setList(next);const params=new URLSearchParams(window.location.search);params.delete('new');params.set('production',p.slug);replaceAdminUrl(window.location.pathname+'?'+params);}
   }
   setNotice(t.saved);
  }catch(e){fail(e);}finally{if(active.current)setBusy(false);}
 }
 async function openFile(kind:'script'|'cast'|'media',file?:File){reset();setUploadEdits({});setSelectedFiles(old=>({...old,[kind]:Boolean(file)}));setFiles(old=>({...old,[kind]:undefined}));
  const current=generation.current;const token=(fileTokens.current[kind]??0)+1;fileTokens.current[kind]=token;
  if(!file){delete pendingReads.current[kind];setReadingFile(Object.keys(pendingReads.current).length>0);return;}
  pendingReads.current[kind]=true;setReadingFile(true);
  try{if(file.size>5*1024*1024)throw new ProductionFailure('too_large');const value=await file.text();if(active.current&&current===generation.current&&fileTokens.current[kind]===token)setFiles(p=>({...p,[kind]:value}));}
  catch(e){if(current===generation.current&&fileTokens.current[kind]===token)fail(e);}finally{if(active.current&&current===generation.current&&fileTokens.current[kind]===token){delete pendingReads.current[kind];setReadingFile(Object.keys(pendingReads.current).length>0);}}
 }
 async function validate(){const current=draftEpoch.current;const mediaEdits={...uploadEdits};setBusy(true);setFailure(null);setValidated(null);const input:Upload={slug,title,...defaults,expected:existing?songContext.version:null,mediaEdits,script:files.script??'',cast:files.cast??'',...(files.media!==undefined?{media:files.media}:{})};
  try{const summary=await productionCall<{records:number;characters:number;videos:number;media:Record<string,string>;songs:SongLink[];baselineSongs?:SongLink[];unmatched:SongLink[]}>('productions/validate','POST',input);if(!active.current||current!==draftEpoch.current)return;const payload={...preparePublication(input.script,input.cast,input.media),media:summary.media};setValidated({input,payload,...summary,baselineSongs:summary.baselineSongs??summary.songs});setVerified(true);setAcknowledged(false);setCharacter(payload.script.characters[0]?.tag??'');setContext(defaults);}
  catch(e){if(current===draftEpoch.current)fail(e);}finally{if(active.current)setBusy(false);}}
 const reading=validated&&character?applyActionVisibility(buildReadingDocument(validated.payload.script,filterScript(validated.payload.script.records,{...context,character,includeNonDialogue:!hide}),character,{...context,includeNonDialogue:!hide,showKorean:korean}),hide):null;
 const errorText=failure?(failure.code==='validation'?failure.diagnostics:failure.code==='conflict'?t.conflict:['unauthorized','forbidden'].includes(failure.code)?t.forbidden:failure.code==='too_large'?t.size:failure.code==='invalid_request'?t.invalid:t.error):null;
 return <section className="production-manager" aria-busy={busy||readingFile}>
  <div className="admin-heading"><h2>{t.title}</h2><button disabled={busy||readingFile} onClick={()=>guard.request(()=>void refreshAll())}>{t.refresh}</button></div>
  {errorText&&<p className="admin-error" role="alert">{errorText}</p>}{notice&&<p role="status">{notice}</p>}
  {list&&<><section className="admin-card"><label htmlFor="student-home">{t.home}</label><div className="admin-setting-row"><select id="student-home" value={home} disabled={busy} onChange={e=>setHome(e.target.value)}><option value="">{t.blank}</option>{list.productions.filter(p=>p.revision).map(p=><option key={p.slug} value={p.slug}>{p.title}</option>)}</select><button disabled={busy||!homeDirty} onClick={()=>void run('home')}>{t.saveHome}</button></div></section>
  <section className="admin-card"><ProductionPicker id="managed-production" locale={locale} value={selected??''} disabled={busy||readingFile} productions={list.productions} onChange={value=>{if(value&&value!==selected)guard.request(()=>void choose(value),settingsDirty||uploadDirty);}}/><button className="admin-primary" disabled={busy||readingFile} onClick={()=>guard.request(()=>void choose(''),settingsDirty||uploadDirty)}>{t.new}</button></section></>}
  {list&&selected!==null&&<section className="admin-card production-editor"><h3>{existing?existing.title:t.new}</h3>
   <ContextPicker value={defaults} onChange={value=>{reset();setDefaults(value);}} disabled={busy||readingFile} text={text} idPrefix="default-context" legend={locale==='ko'?'기본 대사 범위':'Default context'}/>
   <fieldset disabled={busy||readingFile}><label>{t.name}<input value={title} maxLength={200} onChange={e=>{reset();setTitle(e.target.value);if(!existing){const base=e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,70).replace(/^-|-$/g,'')||`production-${new Date().getFullYear()}-${generatedSuffix.current}`;let candidate=base;let suffix=2;while(list.productions.some(p=>p.slug===candidate))candidate=`${base}-${suffix++}`;setSlug(candidate);}}}/></label>
   {existing&&<button onClick={()=>void run('settings')}>{t.settings}</button>}
   </fieldset>
   {existing&&<div className="admin-shortcuts"><AdminActionLink href={'/p/'+existing.slug} target="_blank" rel="noopener noreferrer">{locale==='ko'?'학생 대본 열기':'Open student reader'}</AdminActionLink><AdminActionLink href={'/admin/songs?production='+existing.slug+(locale==='ko'?'&lang=ko':'')}>{locale==='ko'?'노래 관리':'Manage songs'}</AdminActionLink></div>}
   <details className="upload-card" key={`${selected}:${fileInputKey}`} open={!existing||undefined}><summary>{locale==='ko'?'대본 파일':'Script files'}</summary><fieldset disabled={busy||readingFile}>
    {(['script','cast','media']as const).map(kind=><section className="csv-upload" key={`${selected}:${kind}`}><label>{t[kind]}<input type="file" accept=".csv,text/csv" onChange={e=>void openFile(kind,e.target.files?.[0])}/></label><CsvExample kind={kind} expanded={!existing} locale={locale}/></section>)}
    <div className="upload-validation-actions"><button className="admin-primary" disabled={files.script===undefined||files.cast===undefined} onClick={()=>void validate()}>{t.validate}</button><small className="upload-note"><em>{t.unsaved}</em></small></div>
   </fieldset></details>
   {validated&&<section className="production-preview"><h3>{verified?t.ready:(locale==='ko'?'변경 후 다시 검사하세요.':'Revalidate your changes.')}</h3><p>{validated.records} {t.records} · {validated.characters} {t.characters} · {validated.videos} {t.videos}</p>{validated.unmatched.length>0&&<AdminActionLink href="#song-review" onClick={()=>setReviewOpen(true)}>{locale==='ko'?'노래 연결 검토':'Review song links'}</AdminActionLink>}<button className="admin-primary" disabled={busy||!verified||validated.unmatched.length>0&&!acknowledged} onClick={()=>setConfirmation(true)}>{t.publish}</button>
    <h3>{t.preview}</h3><label>{text.character}<select value={character} onChange={e=>setCharacter(e.target.value)}>{validated.payload.script.characters.map(c=><option key={c.tag} value={c.tag}>{c.label}</option>)}</select></label>
    <ContextPicker value={context} onChange={setContext} disabled={busy} text={text}/><label><input type="checkbox" checked={korean} onChange={e=>setKorean(e.target.checked)}/>{t.korean}</label><label><input type="checkbox" checked={hide} onChange={e=>setHide(e.target.checked)}/>{t.actions}</label>
    {reading&&<ReadingContent document={reading} text={text} media={validated.payload.media}/>}
   </section>}
   {validated&&<details id="song-review" className="admin-card song-review" open={reviewOpen||undefined} onToggle={e=>setReviewOpen(e.currentTarget.open)}><summary>{locale==='ko'?'노래 연결 검토':'Review song links'} · {validated.songs.length}{validated.unmatched.length>0?' · '+(locale==='ko'?'확인 필요':'Needs review'):''}</summary><SongLinksEditor heading={locale==='ko'?'새 버전의 노래 연결':'New revision song links'} songs={validated.baselineSongs} previous={songContext.songs} edits={uploadEdits} onChange={edits=>{setUploadEdits(edits);setVerified(false);setAcknowledged(false);}} locale={locale} disabled={busy}/>{validated.unmatched.length>0&&<div className="admin-warning"><p>{locale==='ko'?'기존 연결을 자동으로 옮기지 못한 노래입니다. 새 연결을 지정하거나 제외 여부를 확인하세요.':'These existing linked songs could not be matched. Assign their videos to the intended songs above, or confirm they are being left out.'}</p><ul>{validated.unmatched.map(song=><li key={song.no}>{song.no} · {song.title} <AdminActionLink href={'https://youtu.be/'+song.video} target="_blank" rel="noopener noreferrer">YouTube</AdminActionLink></li>)}</ul><label><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/>{locale==='ko'?'연결을 검토했습니다.':'I have reviewed these associations.'}</label></div>}<button className="admin-primary" disabled={busy} onClick={()=>void validate()}>{t.validate}</button></details>}
  </section>}
  <dialog ref={dialog} className="admin-dialog" aria-labelledby="production-publish-confirmation" onCancel={()=>setConfirmation(false)}>{validated&&<><h2 id="production-publish-confirmation">{t.confirm}</h2><p>{validated.input.title}</p><div className="admin-dialog-actions"><button onClick={()=>setConfirmation(false)}>{t.cancel}</button><button className="admin-primary" disabled={busy} onClick={()=>{setConfirmation(false);void run('publish');}}>{t.publish}</button></div></>}</dialog>
 {guard.prompt}
 </section>;
}
