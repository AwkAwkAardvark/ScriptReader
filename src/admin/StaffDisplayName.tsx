import {useEffect,useRef,useState} from 'react';
import type {AdminAccount} from './protocol';
import type {Locale} from '../i18n';
export function StaffDisplayName({account,locale,onSave,disabled=false}:{account:AdminAccount;locale:Locale;onSave:(name:string|null)=>Promise<void>;disabled?:boolean}){
 const ko=locale==='ko';const [editing,setEditing]=useState(false);const [value,setValue]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState(false);const [message,setMessage]=useState('');const input=useRef<HTMLInputElement>(null);const button=useRef<HTMLButtonElement>(null);const returnFocus=useRef(false);const inFlight=useRef(false);const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{if(returnFocus.current&&!editing&&!busy&&!disabled){returnFocus.current=false;button.current?.focus();}},[editing,busy,disabled]);
 useEffect(()=>{if(editing){input.current?.focus();input.current?.select();}},[editing]);
 function cancel(){if(busy)return;setEditing(false);setError(false);button.current?.focus();}
 async function save(name:string|null){if(inFlight.current)return;if(name!==null&&(!name.trim()||name.trim().length>100||/[\u0000-\u001f\u007f-\u009f]/.test(name))){setError(true);return;}inFlight.current=true;setBusy(true);setError(false);try{await onSave(name===null?null:name.trim());if(active.current){returnFocus.current=true;setEditing(false);setMessage(name===null?(ko?'계정 이름을 사용합니다.':'Using account name.'):(ko?'표시 이름을 저장했습니다.':'Display name saved.'));}}catch{if(active.current)setError(true);}finally{inFlight.current=false;if(active.current)setBusy(false);}}
 return <div className="admin-staff-name-editor"><div className="admin-staff-name"><strong>{account.name}</strong><button ref={button} className="admin-name-pencil" aria-label={ko?`${account.email} 표시 이름 수정`:`Edit display name for ${account.email}`} disabled={disabled||busy} onClick={()=>{setValue(account.name);setError(false);setMessage('');setEditing(true);}}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z"/></svg></button></div>
  {editing&&<form className="admin-name-form" aria-label={ko?`${account.email} 표시 이름`:`Display name for ${account.email}`} onSubmit={event=>{event.preventDefault();void save(value);}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();cancel();}}}>
   <label>{ko?'표시 이름':'Display name'}<input ref={input} value={value} maxLength={100} disabled={busy||disabled} onChange={event=>{setValue(event.target.value);setError(false);}}/></label>
   <div className="admin-name-actions"><button className="admin-primary" disabled={busy||disabled} type="submit">{ko?'저장':'Save'}</button><button className="admin-secondary" disabled={busy||disabled} type="button" onClick={cancel}>{ko?'취소':'Cancel'}</button><button className="admin-secondary" disabled={busy||disabled} type="button" onClick={()=>void save(null)}>{ko?'계정 이름 사용':'Use account name'}</button></div>
   {error&&<p className="admin-error" role="alert">{ko?'저장하지 못했습니다. 1–100자의 표시 이름을 확인하고 다시 시도하세요.':'Unable to save. Check the display name (1–100 characters) and try again.'}</p>}
  </form>}
  {message&&<small role="status">{message}</small>}
 </div>;
}
