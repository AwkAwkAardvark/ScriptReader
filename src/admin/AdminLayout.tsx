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
 const ko=locale==='ko';
 const [menu, setMenu] = useState<'closed' | 'hover' | 'pinned'>('closed');
 const [production,setProduction]=useState(()=>new URLSearchParams(window.location.search).get('production'));
 const button = useRef<HTMLButtonElement>(null);
 const sidebar = useRef<HTMLElement>(null);
 const leaveTimer = useRef<number | undefined>(undefined);
 const open = menu !== 'closed';

 function scheduleHoverClose() {
  window.clearTimeout(leaveTimer.current);
  // Let the pointer cross the space between the trigger and the panel.
  leaveTimer.current = window.setTimeout(() => {
   if (!sidebar.current?.contains(document.activeElement)) {
    setMenu(current => current === 'hover' ? 'closed' : current);
   }
  }, 220);
 }

 useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
 useEffect(() => {
  if (!open) return;
  const dismissOutside = (event: PointerEvent) => {
   if (event.target instanceof Node && !button.current?.contains(event.target) && !sidebar.current?.contains(event.target)) setMenu('closed');
  };
  const dismissWithEscape = (event: KeyboardEvent) => {
   if (event.key !== 'Escape' || event.defaultPrevented) return;
   event.preventDefault();
   const focusInMenu = sidebar.current?.contains(document.activeElement);
   setMenu('closed');
   if (focusInMenu) button.current?.focus({preventScroll:true});
  };
  document.addEventListener('pointerdown', dismissOutside);
  document.addEventListener('keydown', dismissWithEscape);
  return () => {
   document.removeEventListener('pointerdown', dismissOutside);
   document.removeEventListener('keydown', dismissWithEscape);
  };
 }, [open]);
 useEffect(()=>{const update=()=>setProduction(new URLSearchParams(window.location.search).get('production'));window.addEventListener('admin-location-change',update);window.addEventListener('popstate',update);return()=>{window.removeEventListener('admin-location-change',update);window.removeEventListener('popstate',update);};},[]);
 const links=destinations.filter(item=>(approved||item.page==='overview')&&(item.page!=='accounts'||master));
 return <div className={`staff-shell ${page==='viewer'?'staff-reading':''}`}>
  <a className="staff-skip" href="#staff-main">{ko?'본문으로 이동':'Skip to content'}</a>
  <header className="staff-appbar">
   {navigation && <button
    ref={button}
    className="staff-nav-toggle"
    aria-label={ko?'메뉴':'Navigation'}
    aria-controls="staff-navigation"
    aria-expanded={open}
    onPointerEnter={event => {
     if (event.pointerType !== 'mouse' || !window.matchMedia?.('(any-hover: hover)').matches) return;
     window.clearTimeout(leaveTimer.current);
     setMenu(current => current === 'closed' ? 'hover' : current);
    }}
    onPointerLeave={scheduleHoverClose}
    onClick={() => setMenu(current => current === 'pinned' ? 'closed' : 'pinned')}
   >☰</button>}
   {!navigation&&<a className="staff-home-link" href="/" aria-label={ko?'학생 대본 열기':'Open student reader'} title={ko?'학생 대본 열기':'Open student reader'}><span aria-hidden="true">←</span></a>}
   <a className="staff-brand" href="/" aria-label="Script Reader"><BrandMark/></a><h1>{adminPageTitle(page,locale)}</h1>
   <div className="language-switch" role="group" aria-label={ko?'화면 언어':'Interface language'}><button lang="en" aria-pressed={!ko} onClick={()=>onLocale('en')}>ENG</button><button lang="ko" aria-pressed={ko} onClick={()=>onLocale('ko')}>한국어</button></div>
  </header>
  <div className="staff-layout">
   {navigation && <aside
    ref={sidebar}
    className="staff-sidebar"
    hidden={!open}
    onPointerEnter={() => window.clearTimeout(leaveTimer.current)}
    onPointerLeave={scheduleHoverClose}
    onBlur={event => {
     if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(':hover') && !button.current?.matches(':hover')) scheduleHoverClose();
    }}
   >
    <nav id="staff-navigation" aria-label={ko?'관리 메뉴':'Administration navigation'}>{links.map(item=><a key={item.page} href={adminDestination(item.path,locale,production)} aria-current={page===item.page?'page':undefined}>{item[locale]}</a>)}
     {page==='roster-preview'&&approved&&<a href={adminDestination('/admin/roster-preview',locale,production)} aria-current="page">{ko?'배역 편집 미리보기':'Roster preview'}</a>}
    </nav>
    <a className="staff-reader-link" href="/">{ko?'학생 대본 열기':'Open student reader'}</a>
   </aside>}
   <main id="staff-main" className="staff-main">{children}</main>
  </div>
 </div>;
}
