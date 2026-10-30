import {ProductionPicker} from './ProductionPicker';
import {replaceAdminUrl} from './AdminLayout';
import { useEffect, useRef, useState } from 'react';
import { productionCall, ProductionFailure, type ProductionList } from './productions';
import { SongLinksEditor } from './SongLinksEditor';
import type { SongContext, MediaEdits } from '../song-links';
import type { Locale } from '../i18n';
export function SongManager({locale}:{locale:Locale}) {
 const ko=locale==='ko';
 const [list,setList]=useState<ProductionList|null>(null);const [selected,setSelected]=useState('');const [context,setContext]=useState<SongContext|null>(null);
 const [edits,setEdits]=useState<MediaEdits>({});const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState(false);const [confirm,setConfirm]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);const generation=useRef(0);const active=useRef(true);
 function fail(value:unknown){if(!active.current)return;const code=value instanceof ProductionFailure?value.code:'unavailable';setError(code);if(['forbidden','unauthorized'].includes(code)){setList(null);setContext(null);setEdits({});}}
 async function choose(slug:string,listing=list){const current=++generation.current;setSelected(slug);setContext(null);setEdits({});setSaved(false);setError('');setBusy(true);
  const params=new URLSearchParams(window.location.search);params.set('production',slug);replaceAdminUrl(window.location.pathname+'?'+params);
  try{const value=await productionCall<SongContext>('productions/'+slug+'/songs');if(value.version!==listing?.productions.find(p=>p.slug===slug)?.version)throw new ProductionFailure('conflict');if(active.current&&current===generation.current)setContext(value);}
  catch(value){if(current===generation.current)fail(value);}finally{if(active.current&&current===generation.current)setBusy(false);}
 }
 useEffect(()=>{active.current=true;void productionCall<ProductionList>('productions').then(value=>{if(!active.current)return;setList(value);const slug=new URLSearchParams(window.location.search).get('production');if(slug&&value.productions.some(p=>p.slug===slug))void choose(slug,value);}).catch(fail);return()=>{active.current=false;generation.current++;};},[]);
 useEffect(()=>{if(confirm)dialog.current?.showModal();else dialog.current?.close();},[confirm]);
 async function save(){if(!context)return;setConfirm(false);setBusy(true);setError('');try{await productionCall('productions/'+selected+'/songs','PATCH',{expected:context.version,mediaEdits:edits});const next=await productionCall<ProductionList>('productions');if(active.current){setList(next);await choose(selected,next);setSaved(true);}}catch(value){fail(value);}finally{if(active.current)setBusy(false);}}
 const problem=error==='conflict'?(ko?'공연이 변경되었습니다. 페이지를 새로고침하세요.':'This production changed. Refresh the page before editing.'):['forbidden','unauthorized'].includes(error)?(ko?'권한을 확인하려면 다시 로그인하세요.':'Sign in again to check your access.'):(ko?'링크를 확인하고 다시 시도하세요.':'Check the links and try again.');
 return <section className="production-manager songs-manager" aria-busy={busy}>
  {error&&<p role="alert" className="admin-error">{problem}</p>}{saved&&<p role="status">{ko?'저장했습니다.':'Saved.'}</p>}
  {list&&<section className="admin-card"><ProductionPicker id="songs-production" locale={locale} value={selected} disabled={busy} productions={list.productions} onChange={value=>{if(value)void choose(value);}}/></section>}
  {context&&<details className="admin-card songs-card" key={selected}><summary>{ko?'노래 연결':'Song links'} · {context.songs.length}</summary><SongLinksEditor songs={context.songs} edits={edits} onChange={setEdits} locale={locale} disabled={busy}/><button className="admin-primary" disabled={busy||!Object.keys(edits).length} onClick={()=>setConfirm(true)}>{ko?'노래 연결 저장':'Save song links'}</button></details>}
  <dialog ref={dialog} className="admin-dialog" onCancel={()=>setConfirm(false)}><h2>{ko?'노래 연결 변경을 새 버전으로 저장할까요?':'Save song links as a new revision?'}</h2><div className="admin-dialog-actions"><button disabled={busy} onClick={()=>setConfirm(false)}>{ko?'취소':'Cancel'}</button><button className="admin-primary" disabled={busy} onClick={()=>void save()}>{ko?'확인':'Confirm'}</button></div></dialog>
 </section>;
}
