import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RosterDraft, RosterStudent } from '../roster';
import { ProductionFailure } from './productions';
import { BrandMark } from '../BrandMark';
import { assignmentExample } from './assignment-example';
import type { Locale } from '../i18n';

type Student = RosterStudent;
type Draft = RosterDraft;
type Slot = { role: string; performance: '1부' | '2부' };
type Modal = { kind: 'pick'; slot: Slot } | { kind: 'student'; id?: string; slot?: Slot } | { kind: 'review' } | null;
const performances = ['1부','2부'] as const;
const slotKey = (slot: Slot) => slot.role + ':' + slot.performance;

export function RosterWorkspace({ locale, onLocale, master = false, initial, roles, title, sampleMode=false, productionPicker, onSave, onReload, onDirtyChange }: {
 locale: Locale; onLocale:(locale:Locale)=>void; master?:boolean; initial:Draft; roles:{tag:string;label:string;ko?:string}[]; title:string; sampleMode?:boolean;
 productionPicker?:ReactNode; onSave?:(draft:Draft)=>Promise<void>; onReload?:()=>void; onDirtyChange?:(dirty:boolean)=>void;
}) {
  const ko = locale === 'ko';
  const [draft, setDraft] = useState<Draft>(()=>structuredClone(initial));
  const [baseline, setBaseline] = useState<Draft>(()=>structuredClone(initial));
  const [history, setHistory] = useState<Draft[]>([]);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [name, setName] = useState(''); const [className, setClassName] = useState(''); const [label, setLabel] = useState('');
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [busy,setBusy]=useState(false);const [saveError,setSaveError]=useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const navButton = useRef<HTMLButtonElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const changedSlots = roles.flatMap(role => performances.map(performance => ({ role: role.tag, performance }))).filter(slot => draft.casting[slotKey(slot)] !== baseline.casting[slotKey(slot)]);
  const student = (id?: string) => draft.students.find(s => s.id === id);
  const roleName = (tag: string) => { const role = roles.find(r => r.tag === tag)!; return ko ? role.ko ?? role.label : role.label; };
  const identity = (s?: Student) => s ? [s.name, s.className, s.label].filter(Boolean).join(' · ') : ko ? '미배정' : 'Unassigned';
  const assignedRoles = (id: string) => roles.flatMap(role => performances.filter(p => draft.casting[slotKey({role:role.tag,performance:p})] === id).map(p => `${p} ${roleName(role.tag)}`)).join(', ');
  const duplicateName = (s: Student) => draft.students.some(other => other.id !== s.id && other.name.trim().toLocaleLowerCase() === s.name.trim().toLocaleLowerCase());
  const multipleRoles = (id: string) => roles.filter(role => performances.some(performance => draft.casting[slotKey({role:role.tag,performance})] === id)).length > 1;
  const nameMarker = (s: Student) => duplicateName(s) ? <abbr className="roster-name-marker" title={ko ? '동명이인' : 'Shared name'}>*</abbr> : null;
  function change(next: Draft) { if (JSON.stringify(next) === JSON.stringify(draft)) return; setHistory(values => [...values.slice(-19), draft]); setDraft(next); setMessage(''); }
  function openPicker(slot: Slot) { setPickerSearch(''); setError(''); setModal({ kind: 'pick', slot }); }
  function openStudent(value?: Student, slot?: Slot) { setName(value?.name ?? ''); setClassName(value?.className ?? ''); setLabel(value?.label ?? ''); setError(''); setModal({ kind: 'student', id: value?.id, slot }); }
  function assign(slot: Slot, id: string) { const casting = { ...draft.casting }; if (id) casting[slotKey(slot)] = id; else delete casting[slotKey(slot)]; change({ ...draft, casting }); setModal(null); }
  function saveStudent() {
    if (!name.trim()) { setError(ko ? '이름을 입력하세요.' : 'Enter a name.'); return; }
    if (modal?.kind !== 'student') return;
    const id = modal.id ?? crypto.randomUUID();
    const next: Student = { id, name: name.trim(), className: className.trim(), label: label.trim() };
    change({ students: modal.id ? draft.students.map(s => s.id === id ? next : s) : [...draft.students, next], casting: modal.slot && !modal.id ? { ...draft.casting, [slotKey(modal.slot)]: id } : draft.casting });
    setModal(modal.slot && modal.id ? { kind: 'pick', slot: modal.slot } : null);
  }
  useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
  async function apply(){
    setBusy(true);setSaveError('');
    try { if(!sampleMode){if(!onSave)throw new Error('Unavailable');await onSave(draft);}setBaseline(draft);setHistory([]);setMessage(sampleMode?(ko?'예시에 반영했습니다.':'Sample updated.'):(ko?'저장했습니다.':'Saved.'));setModal(null); }
    catch(value){setSaveError(value instanceof ProductionFailure?value.code:'unavailable');setModal(null);}
    finally{setBusy(false);}
  }
  useEffect(() => { if (modal) { if (!dialog.current?.open) dialog.current?.showModal(); dialog.current?.querySelector<HTMLInputElement>('input')?.focus(); } else dialog.current?.close(); }, [modal]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const navigation = [
    { href: '/admin/viewer', en: 'Teacher Viewer', ko: '교사용 대본' },
    { href: '/admin/roster', en: 'Roster', ko: '배역 배정', active: !sampleMode },
    ...(sampleMode?[{ href: '/admin/roster-preview', en: 'Roster preview', ko: '배역 편집 미리보기', active: true }]:[]),
    { href: '/admin/assignments', en: 'Assignments / CSV', ko: '배역 배정 / CSV' },
    { href: '/admin/scripts', en: 'Scripts', ko: '공연 대본' },
    { href: '/admin/songs', en: 'Songs', ko: '노래' },
    { href: '/admin', en: 'My Account', ko: '내 계정' },
    ...(master ? [{href:'/admin/accounts',en:'Access Management',ko:'권한 관리'}] : []),
  ];
  const params = new URLSearchParams(window.location.search);
  if (ko) params.set('lang', 'ko'); else params.delete('lang');
  const href = (path: string) => path + (params.size ? '?' + params : '');
  const nav = <nav id="roster-navigation" aria-label={ko ? '관리 메뉴' : 'Administration navigation'}>{navigation.map(item => <a key={item.href} href={href(item.href)} aria-current={item.active ? 'page' : undefined}>{ko ? item.ko : item.en}</a>)}</nav>;
  return <div className="roster-preview-shell roster-workspace" aria-busy={busy}>
    <a className="roster-skip" href="#roster-main">{ko ? '본문으로 이동' : 'Skip to roster'}</a>
    <header className="roster-appbar">
      <button className="roster-menu-button" ref={navButton} aria-label={ko ? '메뉴' : 'Navigation'} aria-controls="roster-navigation" aria-expanded={menu} onClick={() => setMenu(value => !value)}>☰</button>
      <a className="roster-brand" href="/admin" aria-label="Script Reader"><BrandMark /></a>
      <h1>{ko ? '배역 편집' : 'Roster'}</h1>
      <div className="language-switch" role="group" aria-label={ko ? '화면 언어' : 'Interface language'}><button lang="en" aria-pressed={!ko} onClick={() => onLocale('en')}>ENG</button><button lang="ko" aria-pressed={ko} onClick={() => onLocale('ko')}>한국어</button></div>
    </header>
    <div className="roster-layout">
      <aside className={`roster-sidebar ${menu ? 'is-open' : ''}`} onKeyDown={event => { if (event.key === 'Escape') { setMenu(false); navButton.current?.focus(); } }}>
        <p>{ko ? '직원 메뉴' : 'Staff workspace'}</p>{nav}
      </aside>
      <main id="roster-main" className="roster-main">
        {sampleMode&&<p className="roster-preview-notice">{ko ? '예시 배역 · 저장되지 않습니다.' : 'Sample roster · changes are not saved'}</p>}
        {saveError&&<div className="admin-error roster-error" role="alert"><p>{saveError==='conflict'?(ko?'다른 직원이 수정했습니다. 최신 배정을 불러와 확인하세요.':'Someone else updated this roster. Load the latest version before saving.'):(ko?'저장하지 못했습니다. 배정을 다시 확인하세요.':'Unable to confirm the save. Check the latest roster.')}</p>{onReload&&<button onClick={()=>{if(!dirty||window.confirm(ko?'저장하지 않은 변경을 버리고 최신 배정을 불러올까요?':'Discard unsaved changes and load the latest roster?'))onReload();}}>{ko?'최신 배정 불러오기':'Load latest roster'}</button>}</div>}
        <div className="roster-production"><div>{productionPicker??<><small>{ko ? '예시 공연' : 'Sample production'}</small><h2>{title}</h2></>}</div><button className="admin-secondary" onClick={() => openStudent()}>{ko ? '학생 추가' : 'Add student'}</button></div>
        <div className="roster-filters"><label><span className="visually-hidden">{ko ? '배역 또는 학생 검색' : 'Search roles or students'}</span><input type="search" placeholder={ko ? '배역 또는 학생 검색' : 'Search roles or students'} value={search} onChange={event => setSearch(event.target.value)} /></label><label className="roster-unassigned-filter"><input type="checkbox" checked={onlyUnassigned} onChange={event => setOnlyUnassigned(event.target.checked)} />{ko ? '미배정만' : 'Unassigned only'}</label></div>
        <div className="roster-cards">{roles.filter(role => {
          const values = performances.map(performance => student(draft.casting[slotKey({role:role.tag,performance})]));
          return (!onlyUnassigned || values.some(s => !s)) && [roleName(role.tag), ...values.map(s => identity(s))].some(value => value.toLowerCase().includes(search.toLowerCase()));
        }).map(role => <section className="roster-role-card" key={role.tag}><h3>{roleName(role.tag)}</h3><div className="roster-performances">{performances.map(performance => {
          const slot = { role: role.tag, performance }; const current = student(draft.casting[slotKey(slot)]); const changed = draft.casting[slotKey(slot)] !== baseline.casting[slotKey(slot)];
          return <div key={performance}><div className="roster-slot-heading"><span>{performance}</span>{changed && <small>{ko ? '변경됨' : 'Changed'}</small>}</div><button className={`roster-cast-button ${current ? '' : 'is-empty'}${current && multipleRoles(current.id) ? ' roster-multi-role' : ''}`} aria-label={`${roleName(role.tag)} · ${performance}: ${identity(current)}`} onClick={() => openPicker(slot)}><span className="roster-student-name"><strong>{current ? <>{current.name}{nameMarker(current)}</> : (ko ? '학생 선택' : 'Choose student')}</strong>{current&&<small>{current.className||(ko?'반 미지정':'No class')}</small>}</span>{current?.label&&<span>{current.label}</span>}<span className="roster-edit-hint">{ko ? '변경' : 'Change'} ›</span></button></div>;
        })}</div></section>)}</div>
        <details className="roster-csv-help"><summary>{ko ? 'CSV 도움말 및 예시' : 'CSV help & example'}</summary><div className="roster-help-body"><p>{ko ? 'CSV는 최초 등록이나 일괄 교체에 사용합니다.' : 'Use CSV for initial setup or bulk replacement.'}</p><pre tabIndex={0} aria-label={ko ? '배역 배정 CSV 예시' : 'Assignment CSV example'}>{assignmentExample(roles)}</pre><p className="roster-helper">{ko ? '학생과 반은 가상 예시입니다.' : 'Student names and classes are fictional.'}</p><a href={href('/admin/assignments')}>{ko ? 'CSV 가져오기 열기' : 'Open CSV import'}</a></div></details>
        <div className="roster-savebar"><span role="status">{message || (dirty ? (sampleMode?(ko ? '저장하지 않은 예시 변경' : 'Unsaved sample changes'):(ko?'저장하지 않은 변경':'Unsaved changes')) : (ko ? '변경 사항 없음' : 'No changes'))}</span><button className="roster-undo" disabled={!history.length} onClick={() => { setDraft(history.at(-1)!); setHistory(values => values.slice(0,-1)); setMessage(''); }}>{ko ? '실행 취소' : 'Undo'}</button><button className="admin-primary" disabled={!dirty||busy} onClick={() => setModal({kind:'review'})}>{ko ? '변경 검토' : 'Review changes'}</button></div>
      </main>
    </div>
    <span id="roster-shared-name" className="visually-hidden">{ko ? '별표는 동명이인을 표시합니다.' : 'An asterisk marks a shared name.'}</span>
    <dialog ref={dialog} className="roster-dialog" aria-labelledby="roster-dialog-title" onCancel={event => { event.preventDefault(); if(!busy)setModal(null); }}>
      <div className="roster-dialog-heading"><h2 id="roster-dialog-title">{modal?.kind === 'pick' ? `${roleName(modal.slot.role)} · ${modal.slot.performance}` : modal?.kind === 'student' ? (ko ? '학생 정보' : 'Student details') : (sampleMode?(ko ? '예시 변경 검토' : 'Review sample changes'):(ko?'변경 검토':'Review changes'))}</h2><button disabled={busy} aria-label={ko ? '닫기' : 'Close'} onClick={() => setModal(null)}>×</button></div>
      <fieldset disabled={busy} className="roster-dialog-body">{modal?.kind === 'pick' && <><label className="visually-hidden" htmlFor="roster-student-search">{ko ? '학생 검색' : 'Search students'}</label><input id="roster-student-search" type="search" placeholder={ko ? '이름 또는 반 검색' : 'Search name or class'} value={pickerSearch} onChange={event => setPickerSearch(event.target.value)} />
        <ul className="roster-student-options">{draft.students.filter(s => identity(s).toLowerCase().includes(pickerSearch.toLowerCase())).map(s => <li key={s.id} className={multipleRoles(s.id) ? 'roster-multi-role' : undefined}><button className="roster-student-option" aria-label={`${identity(s)} · ${assignedRoles(s.id) || (ko ? '현재 배역 없음' : 'No current roles')}`} aria-describedby={duplicateName(s) ? 'roster-shared-name' : undefined} onClick={() => assign(modal.slot, s.id)}><span className="roster-student-name"><strong>{s.name}{nameMarker(s)}</strong><small>{s.className || (ko?'반 미지정':'No class')}</small></span>{s.label&&<span>{s.label}</span>}<small>{assignedRoles(s.id) || (ko ? '현재 배역 없음' : 'No current roles')}</small></button><button className="roster-student-edit" aria-label={`${ko ? '정보 수정' : 'Edit details'}: ${s.name} · ${assignedRoles(s.id)}`} onClick={() => openStudent(s, modal.slot)}>{ko ? '수정' : 'Edit'}</button></li>)}</ul>
        <div className="roster-dialog-actions"><button onClick={() => assign(modal.slot, '')}>{ko ? '배정 해제' : 'Clear assignment'}</button><button className="admin-secondary" onClick={() => openStudent(undefined, modal.slot)}>{ko ? '새 학생 추가' : 'Add new student'}</button></div></>}
      {modal?.kind === 'student' && <form onSubmit={event => { event.preventDefault(); saveStudent(); }}><label>{ko ? '이름' : 'Name'}<input value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label><label>{ko ? '반' : 'Class'}<input value={className} maxLength={100} onChange={event => setClassName(event.target.value)} /></label><label>{ko ? '구분 메모 (선택)' : 'Distinguishing label (optional)'}<input value={label} maxLength={60} onChange={event => setLabel(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<div className="roster-dialog-actions"><button type="button" onClick={() => setModal(null)}>{ko ? '취소' : 'Cancel'}</button><button className="admin-primary" type="submit">{sampleMode?(ko ? '예시에 반영' : 'Update sample'):(ko?'반영':'Update student')}</button></div></form>}
      {modal?.kind === 'review' && <>{sampleMode&&<p>{ko ? '이 변경은 체험용 예시에만 반영됩니다.' : 'These changes apply only to this sample.'}</p>}<ul className="roster-change-list">{changedSlots.map(slot => <li key={slotKey(slot)} className={[baseline.casting[slotKey(slot)],draft.casting[slotKey(slot)]].some(id => id && multipleRoles(id)) ? 'roster-multi-role' : undefined}><strong>{roleName(slot.role)} · {slot.performance}</strong><span>{identity(baseline.students.find(s => s.id === baseline.casting[slotKey(slot)]))} → {identity(student(draft.casting[slotKey(slot)]))}</span></li>)}{draft.students.filter(s=>JSON.stringify(s)!==JSON.stringify(baseline.students.find(old=>old.id===s.id))).map(s=><li key={s.id}><strong>{ko?'학생 정보':'Student details'}</strong><span>{baseline.students.some(old=>old.id===s.id)?identity(baseline.students.find(old=>old.id===s.id))+' → ':''}{identity(s)}</span></li>)}</ul><div className="roster-dialog-actions"><button onClick={() => setModal(null)}>{ko ? '돌아가기' : 'Back'}</button><button className="admin-primary" onClick={() => void apply()}>{busy?(ko?'저장 중…':'Saving…'):sampleMode?(ko ? '예시에 적용' : 'Apply to sample'):(ko?'변경 저장':'Save changes')}</button></div></>}
      </fieldset>
    </dialog>
  </div>;
}
