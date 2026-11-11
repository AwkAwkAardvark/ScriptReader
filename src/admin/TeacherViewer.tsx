import {replaceAdminUrl} from './AdminLayout';
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PERFORMANCES, assignmentMatches, type ViewerSelection } from '../assignments';
import { ReadingContent } from '../ReadingContent';
import { buildFocusedTeacherDocument, buildTeacherDocument } from '../teacher-document';
import { copy, type Locale } from '../i18n';
import { productionCall, ProductionFailure, type ProductionList } from './productions';
import type { TeacherContext } from './teacher';
import { AdminActionLink } from './AdminActionLink';
import { ContextPicker } from '../ContextPicker';
import { DEFAULT_CONTEXT, validContextCount, type Context } from '../context';

export function TeacherViewer({ locale }: { locale: Locale }) {
  const ko = locale === 'ko';
  const [list, setList] = useState<ProductionList | null>(null);
  const [selected, setSelected] = useState('');
  const [context, setContext] = useState<TeacherContext | null>(null);
  const [selection, setSelection] = useState<ViewerSelection>({ performance: 'both', classes: [] });
  const [roles, setRoles] = useState<string[]>([]);
  const [roleSearch, setRoleSearch] = useState('');
  const [focusContext, setFocusContext] = useState<Context>(DEFAULT_CONTEXT);
  const [hideActions, setHideActions] = useState(false);
  const [showKorean, setShowKorean] = useState(true);
  const [fontScale, setFontScale] = useState(100);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const settings = useRef<HTMLDetailsElement>(null);
  const readingContent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const content = readingContent.current;
    const narrow = window.matchMedia?.('(max-width: 899px)');
    if (!content || !narrow) return;

    let previousY = Math.max(0, window.scrollY);
    let direction = 0;
    let distance = 0;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const delta = y - previousY;
      previousY = y;
      if (!narrow.matches || content.getBoundingClientRect().top >= 6) {
        content.removeAttribute('data-casting-hidden');
        distance = 0;
        direction = 0;
        return;
      }
      if (!delta || settings.current?.open) return;
      const nextDirection = Math.sign(delta);
      if (nextDirection !== direction) distance = 0;
      direction = nextDirection;
      distance += Math.abs(delta);
      // Ignore small scroll corrections while reading.
      if (direction > 0 && distance >= 16) content.setAttribute('data-casting-hidden', '');
      if (direction < 0 && distance >= 56) content.removeAttribute('data-casting-hidden');
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    narrow.addEventListener('change', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      narrow.removeEventListener('change', schedule);
    };
  }, []);
  useEffect(() => {
    let live = true;
    void productionCall<ProductionList>('productions').then(value => {
      if (!live) return;
      setList(value);
      const slug = new URLSearchParams(window.location.search).get('production');
      setSelected(value.productions.some(p => p.slug === slug) ? slug! : value.home.slug ?? value.productions[0]?.slug ?? '');
    }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    setContext(null); setSelection({ performance: 'both', classes: [] });
    setRoles([]); setRoleSearch(''); setHideActions(false);
    const production = list?.productions.find(p => p.slug === selected);
    setFocusContext({ before: validContextCount(production?.before) ? production.before : DEFAULT_CONTEXT.before, after: validContextCount(production?.after) ? production.after : DEFAULT_CONTEXT.after });
    if (!selected) return;
    let live = true; const current = ++generation.current;
    setLoading(true); setError(false);
    const params = new URLSearchParams(window.location.search); params.set('production', selected);
    replaceAdminUrl(window.location.pathname + '?' + params);
    void productionCall<TeacherContext>('productions/' + selected + '/viewer').then(value => {
      if (live && current === generation.current) setContext(value);
    }).catch(() => { if (live) setError(true); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; generation.current++; };
  }, [selected]);
  // Clear already-rendered private data if another protected request detects revoked access.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible' || !selected) return;
      const current = generation.current;
      void productionCall<TeacherContext>('productions/' + selected + '/viewer').then(value => {
        if (current === generation.current) setContext(value);
      }).catch(value => {
        if (current === generation.current && value instanceof ProductionFailure) { setContext(null); setError(true); }
      });
    };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [selected]);
  const classes = useMemo(() => [...new Set([...(context?.assignments.map(a => a.className).filter(Boolean) ?? []), ...selection.classes])].sort(), [context, selection.classes]);
  const activeRoles = useMemo(() => roles.filter(tag => context?.characters.some(character => character.tag === tag)), [context, roles]);
  const isFocused = activeRoles.length > 0;
  const roleQuery = roleSearch.trim().toLocaleLowerCase();
  const roleChoices = context?.characters.filter(character => character.label.toLocaleLowerCase().includes(roleQuery)) ?? [];
  const reading = useMemo(() => context && (activeRoles.length
    ? buildFocusedTeacherDocument(context.payload.script, activeRoles, focusContext, showKorean, hideActions)
    : buildTeacherDocument(context.payload.script, context.assignments, selection, showKorean)), [context, activeRoles, focusContext, hideActions, selection, showKorean]);
  const roleSummary = activeRoles.length === 0 ? (ko ? '전체 배역' : 'All roles')
    : activeRoles.length === 1 ? context?.characters.find(character => character.tag === activeRoles[0])?.label
      : (ko ? `${activeRoles.length}개 배역` : `${activeRoles.length} roles`);
  const both = ko ? '전체 공연' : 'Both';
  const settingsLabel = ko ? '대본 설정' : 'Reading settings';
  const summary = `${context?.title ?? (ko ? '공연 선택' : 'Production')}${isFocused ? ' · ' + roleSummary : ''} · ${selection.performance === 'both' ? both : selection.performance}${selection.classes.length ? ' · ' + selection.classes.join(', ') : ''}`;
  const chapters = reading?.blocks.filter(block => block.kind === 'scene').map(block => block.entry) ?? [];
  function jumpToChapter(no: number) {
    const target = document.getElementById(`teacher-scene-${no}`);
    if (!target) return;
    if (window.matchMedia?.('(max-width: 899px)').matches && settings.current) settings.current.open = false;
    requestAnimationFrame(() => { target.focus({preventScroll:true});target.scrollIntoView({block:'start'}); });
  }
  return <section className="teacher-view teacher-reading-workspace" aria-busy={loading} style={{'--teacher-font-scale':fontScale/100} as CSSProperties}>
    <div className="teacher-layout">
    <div className="teacher-tools">
    <details ref={settings} className="admin-card teacher-settings" onKeyDown={event => { if (event.key === 'Escape' && settings.current?.open) { event.preventDefault(); settings.current.open = false; settings.current.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true }); } }}>
      <summary className="settings-summary" aria-label={`${summary} — ${settingsLabel}`}>
        <svg className="teacher-settings-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M3 6h6m4 0h8M3 12h12m4 0h2M3 18h3m4 0h11"/>
          <circle cx="11" cy="6" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>
        </svg>
        <span className="teacher-settings-label" aria-hidden="true">{settingsLabel}</span>
      </summary>
      <div className="teacher-settings-body"><h2 className="teacher-tools-title">{settingsLabel}</h2>
      <label className="control-label" htmlFor="teacher-text-size">{ko?'글자 크기':'Text size'} <output htmlFor="teacher-text-size">{fontScale}%</output></label>
      <input id="teacher-text-size" type="range" min="100" max="250" step="25" value={fontScale} onChange={event=>setFontScale(Number(event.target.value))}/>
      <button className="teacher-font-reset" disabled={fontScale===100} onClick={()=>setFontScale(100)}>{ko?'기본 크기':'Reset size'}</button>
      <label className="control-label" htmlFor="viewer-production">{ko ? '공연' : 'Production'}</label>
      <select id="viewer-production" value={selected} onChange={e => setSelected(e.target.value)}><option value="">{ko ? '공연 선택' : 'Choose a production'}</option>{list?.productions.map(p => <option value={p.slug} key={p.slug}>{p.title}</option>)}</select>
      <details className="teacher-role-filter" key={selected}>
        <summary>{ko ? '배역' : 'Characters'} <span>{roleSummary}</span></summary>
        <label className="visually-hidden" htmlFor="teacher-role-search">{ko ? '배역 검색' : 'Search roles'}</label>
        <input id="teacher-role-search" type="search" placeholder={ko ? '배역 검색' : 'Search roles'} value={roleSearch} onChange={event => setRoleSearch(event.target.value)} disabled={!context || loading}/>
        <div className="teacher-role-options">
          {roleChoices.map(character => <label key={character.tag} className={!roleQuery && character.dividerBefore ? 'role-divider' : undefined}>
            <input type="checkbox" value={character.tag} checked={activeRoles.includes(character.tag)} onChange={() => setRoles(current =>
              current.includes(character.tag) ? current.filter(tag => tag !== character.tag) : [...current, character.tag]
            )}/>
            <span>{character.label}</span>
          </label>)}
          {context && !roleChoices.length && <p>{ko ? '검색 결과가 없습니다.' : 'No matching roles.'}</p>}
        </div>
        {isFocused && <button type="button" className="admin-secondary teacher-clear-roles" onClick={() => setRoles([])}>{ko ? '전체 배역 보기' : 'Show all roles'}</button>}
      </details>
      {isFocused && <><ContextPicker idPrefix="teacher-context" value={focusContext} onChange={setFocusContext} disabled={!context || loading} text={copy[locale]}/>
      <label className="toggle-row"><input type="checkbox" checked={hideActions} onChange={e => setHideActions(e.target.checked)}/><span className="toggle-track" aria-hidden="true"/><span>{copy[locale].actions}</span></label></>}
      <fieldset className="teacher-performance"><legend className="control-label">{ko ? '공연 회차' : 'Performance'}</legend>{(['both', ...PERFORMANCES] as const).map(value => <label key={value}><input type="radio" name="performance" value={value} checked={selection.performance === value} onChange={() => setSelection(s => ({ ...s, performance: value }))} />{value === 'both' ? both : value}</label>)}</fieldset>
      <fieldset className="teacher-classes"><legend className="control-label">{ko ? '반' : 'Classes'}</legend>{classes.map(value => <label key={value}><input type="checkbox" checked={selection.classes.includes(value)} onChange={() => setSelection(s => ({ ...s, classes: s.classes.includes(value) ? s.classes.filter(c => c !== value) : [...s.classes, value] }))} />{value}</label>)}{!classes.length && <small>{ko ? '등록된 반이 없습니다.' : 'No classes assigned.'}</small>}</fieldset>
      <label className="toggle-row teacher-korean"><input type="checkbox" checked={showKorean} onChange={e => setShowKorean(e.target.checked)} /><span className="toggle-track" aria-hidden="true"/><span>{ko ? '한국어 표기' : 'Display Korean lines'}</span></label>
      {chapters.length>0&&<nav className="teacher-chapters" aria-label={ko?'장 바로가기':'Chapters'}><h3>{ko?'장 바로가기':'Chapters'}</h3><ol>{chapters.map(chapter=><li key={chapter.no}><a href={`#teacher-scene-${chapter.no}`} onClick={event=>{event.preventDefault();jumpToChapter(chapter.no);}}><span>{ko?'장':'Scene'} {chapter.scene}</span><span>{chapter.english}</span></a></li>)}</ol></nav>}
      {selected && <AdminActionLink href={`/admin/roster?production=${selected}${ko ? '&lang=ko' : ''}`}>{ko ? '배역 편집' : 'Edit roster'}</AdminActionLink>}
      </div>
    </details>
    </div>
    <div ref={readingContent} className={`teacher-reading-content${fontScale>=175?' teacher-large-type':''}`} onClick={event => {
      if (!settings.current?.open || window.getSelection()?.isCollapsed === false) return;
      if (event.target instanceof Element && event.target.closest('button, a')) return;
      settings.current.open = false;
    }}>
    {loading && <p role="status">{ko ? '불러오는 중…' : 'Loading…'}</p>}
    {error && <p role="alert" className="admin-error">{ko ? '불러오지 못했습니다. 권한을 확인하고 페이지를 새로고침하세요.' : 'Unable to load. Check your access and refresh the page.'}</p>}
    {context && reading && <>
      <div className="teacher-column-key" aria-hidden="true"><span>{ko ? '배역' : 'Role'}</span><span>1부</span><span>2부</span></div>
      {!context.assignments.length && <p className="admin-empty">{ko ? (isFocused ? '배역 배정 전입니다.' : '배역 배정 전입니다. 전체 대본을 표시합니다.') : (isFocused ? 'No student assignments yet.' : 'No student assignments yet. Showing the full script.')}</p>}
      {isFocused && !reading.blocks.some(b => b.kind === 'passage') && <p className="admin-empty" role="status">{copy[locale].noMatches}</p>}
      <ReadingContent sceneIdPrefix="teacher-scene-" focusKey={JSON.stringify(activeRoles)} document={reading} text={copy[locale]} media={context.payload.media} attribution={entry => {
        const tags = entry.tags ?? [];
        const assigned = context.assignments.filter(a => tags.includes(a.tag));
        return <><span className="entry-name">{tags.length ? tags.map((tag, index) => <Fragment key={tag}>{index > 0 && ', '}<span className={assigned.some(a => a.tag === tag && assignmentMatches(a, selection)) ? 'teacher-role-selected' : undefined}>{context.characters.find(c => c.tag === tag)?.label ?? tag}</span></Fragment>) : entry.speaker}</span>
          {PERFORMANCES.map(performance => <span className="teacher-cast" key={performance} aria-label={performance}>{assigned.filter(a => a.performance === performance).length ? assigned.filter(a => a.performance === performance).map(a => <span className={assignmentMatches(a, selection) ? 'teacher-student-selected' : undefined} key={a.tag}>{a.studentName}</span>) : <span className="teacher-unassigned">—</span>}</span>)}</>;
      }} />
    </>}
    </div>
    </div>
  </section>;
}
