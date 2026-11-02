import {useEffect,useId,useRef,useState} from 'react';
import type {Locale} from '../i18n';
type Pending={run:()=>void;leaving?:boolean};
/** Local preparation only: never stores drafts or intercepts new tabs/downloads/hash jumps. */
export function useUnsavedChanges(dirty:boolean,locale:Locale,busy=false){
 const current=useRef({dirty,busy});current.current={dirty,busy};const bypass=useRef(false);
 const [pending,setPending]=useState<Pending|null>(null);const dialog=useRef<HTMLDialogElement>(null);const keep=useRef<HTMLButtonElement>(null);const title=useId();const ko=locale==='ko';
 function request(run:()=>void,changed=current.current.dirty){if(current.current.busy)return;if(changed)setPending({run});else run();}
 useEffect(()=>{
  const resetBypass=()=>{bypass.current=false;};
  const warn=(event:BeforeUnloadEvent)=>{if(bypass.current){bypass.current=false;return;}if(current.current.dirty){event.preventDefault();event.returnValue='';}};
  const link=(event:MouseEvent)=>{
   if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   const anchor=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href]'):null;
   if(!anchor||anchor.hasAttribute('download')||anchor.target&&anchor.target!=='_self')return;
   const next=new URL(anchor.href,location.href);if(next.origin!==location.origin||next.pathname===location.pathname&&next.search===location.search)return;
   if(!current.current.dirty)return;event.preventDefault();event.stopImmediatePropagation();
   if(!current.current.busy)setPending({leaving:true,run:()=>window.location.assign(next.href)});
  };
  window.addEventListener('beforeunload',warn);document.addEventListener('click',link);window.addEventListener('pageshow',resetBypass);window.addEventListener('pointerdown',resetBypass);window.addEventListener('keydown',resetBypass);
  return()=>{window.removeEventListener('beforeunload',warn);document.removeEventListener('click',link);window.removeEventListener('pageshow',resetBypass);window.removeEventListener('pointerdown',resetBypass);window.removeEventListener('keydown',resetBypass);};
 },[]);
 useEffect(()=>{if(pending){if(!dialog.current?.open)dialog.current?.showModal();keep.current?.focus();}else dialog.current?.close();},[pending]);
 useEffect(()=>{if(!dirty&&!busy)setPending(null);},[dirty,busy]);
 const prompt=<dialog ref={dialog} className="admin-dialog" aria-labelledby={title} onCancel={event=>{event.preventDefault();setPending(null);}}>
  <h2 id={title}>{ko?'저장하지 않은 변경':'Unsaved changes'}</h2><p>{ko?'변경을 버리고 계속할까요?':'Discard your changes and continue?'}</p>
  <div className="admin-dialog-actions"><button ref={keep} className="admin-secondary" onClick={()=>setPending(null)}>{ko?'계속 편집':'Keep editing'}</button><button className="admin-primary" onClick={()=>{const next=pending;setPending(null);if(next?.leaving)bypass.current=true;try{next?.run();}catch(error){bypass.current=false;throw error;}}}>{ko?'변경 버리기':'Discard changes'}</button></div>
 </dialog>;
 return {request,prompt};
}
