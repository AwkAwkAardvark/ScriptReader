import {useEffect,useRef,useState} from 'react';
import type {Locale} from '../i18n';
import {productionCall,ProductionFailure} from './productions';
type Today={day:string;count:number};
type Attempt={expectedDay:string;operationId:string};
export function ReaderAllowances({locale,onDenied}:{locale:Locale;onDenied?:()=>void}){
 const ko=locale==='ko';const [today,setToday]=useState<Today|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [result,setResult]=useState<Today|null>(null);const [attempt,setAttempt]=useState<Attempt|null>(null);const [confirm,setConfirm]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);const keep=useRef<HTMLButtonElement>(null);const active=useRef(true);const inFlight=useRef(false);const attempted=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{if(confirm){if(!dialog.current?.open)dialog.current?.showModal();keep.current?.focus();}else dialog.current?.close();},[confirm]);
 function fail(value:unknown){if(!active.current)return;const code=value instanceof ProductionFailure?value.code:'unavailable';setError(code);if(['forbidden','unauthorized'].includes(code)){setToday(null);setAttempt(null);setConfirm(false);onDenied?.();}}
 async function refresh(){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{const next=await productionCall<Today>('quotas/today');if(active.current)setToday(next);}catch(value){fail(value);}finally{inFlight.current=false;if(active.current)setBusy(false);}}
 function cancel(){setConfirm(false);if(!attempted.current)setAttempt(null);}
 async function reset(){if(!attempt||inFlight.current)return;attempted.current=true;inFlight.current=true;setBusy(true);setError('');try{const next=await productionCall<Today>('quotas/reset','POST',attempt);if(!active.current)return;setResult(next);attempted.current=false;setAttempt(null);setConfirm(false);setToday(null);}catch(value){fail(value);if(value instanceof ProductionFailure&&value.code==='day_changed'){setToday(null);attempted.current=false;setAttempt(null);setConfirm(false);}}finally{inFlight.current=false;if(active.current)setBusy(false);}}
 const message=error==='day_changed'?(ko?'한국 날짜가 바뀌었습니다. 새 날짜를 불러온 뒤 다시 확인하세요.':'The Korean date changed. Load the new date and confirm again.'):['forbidden','unauthorized'].includes(error)?(ko?'마스터 권한을 다시 확인하세요.':'Check your master access again.'):attempt?(ko?'초기화 결과를 확인하지 못했습니다. 다시 시도하면 같은 요청의 결과를 확인합니다.':'Unable to confirm the result. Retrying checks the same reset request.'):(ko?'열람 기록을 불러오지 못했습니다. 다시 시도하세요.':'Unable to load allowances. Try again.');
 const date=(value:string)=>`${value} (KST)`;
 return <details className="admin-card reader-allowances" onToggle={event=>{if(event.currentTarget.open&&!today&&!attempt)void refresh();}}><summary>{ko?'학생 열람 제한':'Reader allowances'}</summary>
  <p>{ko?'오늘의 캐릭터 열람 기록을 모든 공연과 모든 브라우저에서 초기화합니다.':'Reset today’s character allowances for every production and browser.'}</p>
  {today&&<p>{date(today.day)} · {ko?`기록 ${today.count}개`:`${today.count} allowance records`}</p>}
  {result&&<p role="status">{ko?`${date(result.day)} 기록 ${result.count}개를 초기화했습니다.`:`Reset ${result.count} allowance records for ${date(result.day)}.`}</p>}
  {error&&!confirm&&<p className="admin-error" role="alert">{message}</p>}
  <div className="admin-dialog-actions"><button className="admin-secondary" disabled={busy||Boolean(attempt)} onClick={()=>void refresh()}>{ko?'새로고침':'Refresh'}</button><button className="admin-secondary" disabled={busy||!today&&!attempt} onClick={()=>{if(!attempt&&today)setAttempt({expectedDay:today.day,operationId:crypto.randomUUID()});setConfirm(true);}}>{attempt?(ko?'초기화 다시 확인':'Retry reset'):(ko?'초기화 검토':'Review reset')}</button></div>
  <dialog ref={dialog} className="admin-dialog" aria-labelledby="quota-reset-title" onCancel={event=>{event.preventDefault();if(!busy)cancel();}}>
   <h2 id="quota-reset-title">{ko?'학생 열람 제한 초기화':'Reset reader allowances'}</h2><p>{attempt&&date(attempt.expectedDay)}</p><p>{ko?'모든 공연과 모든 브라우저의 오늘 열람 기록을 초기화할까요? 학생들은 캐릭터를 다시 선택할 수 있습니다.':'Reset today’s allowances across all productions and all browsers? Students can choose characters again.'}</p>
   {error&&confirm&&<p className="admin-error" role="alert">{message}</p>}
   <div className="admin-dialog-actions"><button ref={keep} className="admin-secondary" disabled={busy} onClick={cancel}>{ko?'취소':'Cancel'}</button><button className="admin-primary" disabled={busy||!attempt} onClick={()=>void reset()}>{busy?(ko?'확인 중…':'Checking…'):(ko?'모든 열람 제한 초기화':'Reset all allowances')}</button></div>
  </dialog>
 </details>;
}
