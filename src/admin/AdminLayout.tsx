import {useEffect,useRef,useState,type ReactNode} from 'react';
import {BrandMark} from '../BrandMark';
import type {Locale} from '../i18n';
export type AdminPage='overview'|'scripts'|'songs'|'viewer'|'roster'|'assignments'|'accounts'|'roster-preview';
const destinations=[
 {page:'viewer',path:'/admin/viewer',en:'Teacher Viewer',ko:'교사용 대본'},
 {page:'roster',path:'/admin/roster',en:'Roster',ko:'배역 배정'},
 {page:'scripts',path:'/admin/scripts',en:'Scripts',ko:'공연 대본'},
 {page:'songs',path:'/admin/songs',en:'Songs',ko:'노래'},
 {page:'overview',path:'/admin',en:'My Account',ko:'내 계정'},
 {page:'accounts',path:'/admin/accounts',en:'Access Management',ko:'권한 관리'},
] as const;
export function adminPageTitle(page:AdminPage,locale:Locale){if(page==='assignments')return locale==='ko'?'배역 배정':'Roster';return page==='roster-preview'?(locale==='ko'?'배역 편집 미리보기':'Roster preview'):destinations.find(item=>item.page===page)![locale];}
export function replaceAdminUrl(url:string){window.history.replaceState({},'',url);window.dispatchEvent(new Event('admin-location-change'));}
export function adminDestination(path:string,locale:Locale,production:string|null){const params=new URLSearchParams();if(production&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(production))params.set('production',production);if(locale==='ko')params.set('lang','ko');return path+(params.size?'?'+params:'');}
export function AdminLayout({page,locale,onLocale,approved=true,master=false,navigation=true,children}:{page:AdminPage;locale:Locale;onLocale:(locale:Locale)=>void;approved?:boolean;master?:boolean;navigation?:boolean;children:ReactNode}){
 const ko=locale==='ko';const [wide,setWide]=useState(()=>window.matchMedia?.('(min-width: 900px)').matches??true);
 const [desktopOpen,setDesktopOpen]=useState(page!=='viewer');const [mobileOpen,setMobileOpen]=useState(false);
 const [production,setProduction]=useState(()=>new URLSearchParams(window.location.search).get('production'));
 const button=useRef<HTMLButtonElement>(null);const open=wide?desktopOpen:mobileOpen;
 function close(){if(wide)setDesktopOpen(false);else setMobileOpen(false);button.current?.focus({preventScroll:true});}
 useEffect(()=>{const media=window.matchMedia?.('(min-width: 900px)');if(!media)return;const change=()=>{setWide(media.matches);setMobileOpen(false);};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useEffect(()=>{const update=()=>setProduction(new URLSearchParams(window.location.search).get('production'));window.addEventListener('admin-location-change',update);window.addEventListener('popstate',update);return()=>{window.removeEventListener('admin-location-change',update);window.removeEventListener('popstate',update);};},[]);
 const links=destinations.filter(item=>(approved||item.page==='overview')&&(item.page!=='accounts'||master));
 return <div className={`staff-shell ${page==='viewer'?'staff-reading':''} ${open&&navigation?'staff-nav-open':''}`}>
  <a className="staff-skip" href="#staff-main">{ko?'본문으로 이동':'Skip to content'}</a>
  <header className="staff-appbar">
   {navigation&&<button ref={button} className="staff-nav-toggle" aria-label={ko?'메뉴':'Navigation'} aria-controls="staff-navigation" aria-expanded={open} onClick={()=>wide?setDesktopOpen(!open):setMobileOpen(!open)}>☰</button>}
   {!navigation&&<a className="staff-home-link" href="/" aria-label={ko?'학생 대본 열기':'Open student reader'} title={ko?'학생 대본 열기':'Open student reader'}><span aria-hidden="true">←</span></a>}
   <a className="staff-brand" href="/" aria-label="Script Reader"><BrandMark/></a><h1>{adminPageTitle(page,locale)}</h1>
   <div className="language-switch" role="group" aria-label={ko?'화면 언어':'Interface language'}><button lang="en" aria-pressed={!ko} onClick={()=>onLocale('en')}>ENG</button><button lang="ko" aria-pressed={ko} onClick={()=>onLocale('ko')}>한국어</button></div>
  </header>
  <div className="staff-layout">
   {navigation&&<aside className="staff-sidebar" hidden={!open} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close();}}}>
    <nav id="staff-navigation" aria-label={ko?'관리 메뉴':'Administration navigation'}>{links.map(item=><a key={item.page} href={adminDestination(item.path,locale,production)} aria-current={page===item.page?'page':undefined}>{item[locale]}</a>)}
     {page==='roster-preview'&&approved&&<a href={adminDestination('/admin/roster-preview',locale,production)} aria-current="page">{ko?'배역 편집 미리보기':'Roster preview'}</a>}
    </nav>
    <a className="staff-reader-link" href="/">{ko?'학생 대본 열기':'Open student reader'}</a>
   </aside>}
   <main id="staff-main" className="staff-main">{children}</main>
  </div>
 </div>;
}
