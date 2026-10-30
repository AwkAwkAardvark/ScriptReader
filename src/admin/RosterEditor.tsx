import {useEffect,useRef,useState} from 'react';
import type {Locale} from '../i18n';
import {draftFromRoster,rosterFromDraft,validateRoster,type RosterContext,type RosterDraft} from '../roster';
import {productionCall,ProductionFailure,type ProductionList} from './productions';
import {RosterWorkspace} from './RosterWorkspace';

export function RosterEditor({locale,onLocale,master=false}:{locale:Locale;onLocale:(locale:Locale)=>void;master?:boolean}){
 const ko=locale==='ko';const [list,setList]=useState<ProductionList|null>(null);const [selected,setSelected]=useState('');
 const [context,setContext]=useState<RosterContext|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [epoch,setEpoch]=useState(0);
 const active=useRef(true);const generation=useRef(0);const dirty=useRef(false);const saving=useRef(false);
 function fail(value:unknown){if(!active.current)return;const code=value instanceof ProductionFailure?value.code:'unavailable';setError(code);if(['unauthorized','forbidden'].includes(code)){setContext(null);setList(null);dirty.current=false;}}
 async function load(slug:string){
  const current=++generation.current;setSelected(slug);setContext(null);setError('');setBusy(Boolean(slug));dirty.current=false;
  const params=new URLSearchParams(window.location.search);if(slug)params.set('production',slug);else params.delete('production');window.history.replaceState({},'',window.location.pathname+(params.size?'?'+params:''));
  if(!slug)return;
  try{const next=await productionCall<RosterContext>('productions/'+slug+'/roster');if(active.current&&current===generation.current){setContext(next);setEpoch(value=>value+1);}}
  catch(value){if(current===generation.current)fail(value);}finally{if(active.current&&current===generation.current)setBusy(false);}
 }
 useEffect(()=>{active.current=true;void productionCall<ProductionList>('productions').then(value=>{
  if(!active.current)return;setList(value);const requested=new URLSearchParams(window.location.search).get('production');const slug=value.productions.some(p=>p.slug===requested)?requested!:value.home.slug??value.productions[0]?.slug??'';void load(slug);
 }).catch(fail);return()=>{active.current=false;generation.current++;};},[]);
 useEffect(()=>{
  const check=()=>{if(document.visibilityState!=='visible'||!selected||saving.current)return;const current=generation.current;
   void productionCall<RosterContext>('productions/'+selected+'/roster').then(next=>{if(!active.current||current!==generation.current)return;if(context&&(context.version!==next.version||context.productionVersion!==next.productionVersion)){if(dirty.current)setError('conflict');else{setContext(next);setEpoch(v=>v+1);}}}).catch(fail);
  };document.addEventListener('visibilitychange',check);return()=>document.removeEventListener('visibilitychange',check);
 },[selected,context]);
 async function save(draft:RosterDraft){
  if(!context)throw new ProductionFailure('unavailable');const parsed=validateRoster(rosterFromDraft(draft),context.characters,context.students);
  if(!parsed.ok)throw new ProductionFailure('validation',parsed.errors.join(' '));saving.current=true;setBusy(true);setError('');
  try{const saved=await productionCall<{version:string}>('productions/'+selected+'/roster','PATCH',{...parsed.roster,expected:context.version,productionVersion:context.productionVersion});
   const next=await productionCall<RosterContext>('productions/'+selected+'/roster');if(next.version!==saved.version||next.productionVersion!==context.productionVersion)throw new ProductionFailure('conflict');if(active.current)setContext(next);
  }catch(value){if(value instanceof ProductionFailure&&['unauthorized','forbidden'].includes(value.code))fail(value);throw value;}
  finally{saving.current=false;if(active.current)setBusy(false);}
 }
 const choose=(slug:string)=>{if(dirty.current&&!window.confirm(ko?'저장하지 않은 변경을 버리고 공연을 바꿀까요?':'Discard unsaved changes and switch production?'))return;void load(slug);};
 const picker=<label className="roster-production-picker">{ko?'공연':'Production'}<select aria-label={ko?'공연 선택':'Choose a production'} value={selected} disabled={busy} onChange={event=>choose(event.target.value)}>{list?.productions.map(p=><option key={p.slug} value={p.slug}>{p.title}</option>)}</select></label>;
 return <>{error&&<div className="app-shell roster-load-error" role="alert"><p>{error==='conflict'?(ko?'다른 직원이 수정했습니다. 최신 배정을 확인하세요.':'This roster changed elsewhere. Check the latest version.'):['unauthorized','forbidden'].includes(error)?(ko?'다시 로그인하여 권한을 확인하세요.':'Sign in again to check your access.'):(ko?'배정을 불러오지 못했습니다.':'Unable to load the roster.')}</p>{error==='conflict'&&<button onClick={()=>{if(!dirty.current||window.confirm(ko?'변경을 버리고 최신 배정을 불러올까요?':'Discard unsaved changes and load the latest roster?'))void load(selected);}}>{ko?'최신 배정 불러오기':'Load latest roster'}</button>}</div>}
  {!context&&busy&&<p role="status" className="app-shell">{ko?'불러오는 중…':'Loading…'}</p>}
  {!context&&!busy&&!error&&list&&!list.productions.length&&<p className="app-shell">{ko?'게시된 공연이 없습니다.':'No published productions.'}</p>}
  {context&&<RosterWorkspace key={selected+':'+epoch} locale={locale} onLocale={onLocale} master={master} initial={draftFromRoster(context)} roles={context.characters} title={context.title} productionPicker={picker} onSave={save} onReload={()=>void load(selected)} onDirtyChange={value=>{dirty.current=value;}}/>}
 </>;
}
