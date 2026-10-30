import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PERFORMANCES, assignmentMatches, type ViewerSelection } from '../assignments';
import { ReadingContent } from '../ReadingContent';
import { buildTeacherDocument } from '../teacher-document';
import { copy, type Locale } from '../i18n';
import { productionCall, ProductionFailure, type ProductionList } from './productions';
import type { TeacherContext } from './teacher';
import { AdminActionLink } from './AdminActionLink';

export function TeacherViewer({ locale }: { locale: Locale }) {
  const ko = locale === 'ko';
  const [list, setList] = useState<ProductionList | null>(null);
  const [selected, setSelected] = useState('');
  const [context, setContext] = useState<TeacherContext | null>(null);
  const [selection, setSelection] = useState<ViewerSelection>({ performance: 'both', classes: [] });
  const [showKorean, setShowKorean] = useState(true);
  const [fontScale, setFontScale] = useState(100);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const settings = useRef<HTMLDetailsElement>(null);
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
    if (!selected) return;
    let live = true; const current = ++generation.current;
    setLoading(true); setError(false);
    const params = new URLSearchParams(window.location.search); params.set('production', selected);
    window.history.replaceState({}, '', window.location.pathname + '?' + params);
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
  const reading = useMemo(() => context && buildTeacherDocument(context.payload.script, context.assignments, selection, showKorean), [context, selection, showKorean]);
  const both = ko ? '전체 공연' : 'Both';
  const summary = `${context?.title ?? (ko ? '공연 선택' : 'Production')} · ${selection.performance === 'both' ? both : selection.performance}${selection.classes.length ? ' · ' + selection.classes.join(', ') : ''}`;
  const chapters = reading?.blocks.filter(block => block.kind === 'scene').map(block => block.entry) ?? [];
  function jumpToChapter(no: number) {
    const target = document.getElementById(`teacher-scene-${no}`);
    if (!target) return;
    if (window.matchMedia?.('(max-width: 899px)').matches && settings.current) settings.current.open = false;
    requestAnimationFrame(() => { target.focus({preventScroll:true});target.scrollIntoView({block:'start'}); });
  }
  return <section className="teacher-view teacher-reading-workspace" aria-busy={loading} style={{'--teacher-font-scale':fontScale/100} as CSSProperties}>
    <div className="teacher-layout">
    <details ref={settings} className="admin-card teacher-settings" onKeyDown={event => { if (event.key === 'Escape' && settings.current?.open) { event.preventDefault(); settings.current.open = false; settings.current.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true }); } }}><summary className="settings-summary" title={summary} aria-label={`${summary} — ${ko ? '대본 설정' : 'Reading settings'}`}><span className="menu-icon" aria-hidden="true">☰</span></summary>
      <div className="teacher-settings-body"><h2 className="teacher-tools-title">{ko?'대본 설정':'Reading settings'}</h2>
      <label className="control-label" htmlFor="teacher-text-size">{ko?'글자 크기':'Text size'} <output htmlFor="teacher-text-size">{fontScale}%</output></label>
      <input id="teacher-text-size" type="range" min="100" max="250" step="25" value={fontScale} onChange={event=>setFontScale(Number(event.target.value))}/>
      <button className="teacher-font-reset" disabled={fontScale===100} onClick={()=>setFontScale(100)}>{ko?'기본 크기':'Reset size'}</button>
      <label className="control-label" htmlFor="viewer-production">{ko ? '공연' : 'Production'}</label>
      <select id="viewer-production" value={selected} onChange={e => setSelected(e.target.value)}><option value="">{ko ? '공연 선택' : 'Choose a production'}</option>{list?.productions.map(p => <option value={p.slug} key={p.slug}>{p.title}</option>)}</select>
      <fieldset className="teacher-performance"><legend className="control-label">{ko ? '공연 회차' : 'Performance'}</legend>{(['both', ...PERFORMANCES] as const).map(value => <label key={value}><input type="radio" name="performance" value={value} checked={selection.performance === value} onChange={() => setSelection(s => ({ ...s, performance: value }))} />{value === 'both' ? both : value}</label>)}</fieldset>
      <fieldset className="teacher-classes"><legend className="control-label">{ko ? '반' : 'Classes'}</legend>{classes.map(value => <label key={value}><input type="checkbox" checked={selection.classes.includes(value)} onChange={() => setSelection(s => ({ ...s, classes: s.classes.includes(value) ? s.classes.filter(c => c !== value) : [...s.classes, value] }))} />{value}</label>)}{!classes.length && <small>{ko ? '등록된 반이 없습니다.' : 'No classes assigned.'}</small>}</fieldset>
      <label className="toggle-row teacher-korean"><input type="checkbox" checked={showKorean} onChange={e => setShowKorean(e.target.checked)} /><span className="toggle-track" aria-hidden="true"/><span>{ko ? '한국어 표기' : 'Display Korean lines'}</span></label>
      {chapters.length>0&&<nav className="teacher-chapters" aria-label={ko?'장 바로가기':'Chapters'}><h3>{ko?'장 바로가기':'Chapters'}</h3><ol>{chapters.map(chapter=><li key={chapter.no}><a href={`#teacher-scene-${chapter.no}`} onClick={event=>{event.preventDefault();jumpToChapter(chapter.no);}}><span>{ko?'장':'Scene'} {chapter.scene}</span><span>{chapter.english}</span></a></li>)}</ol></nav>}
      {selected && <AdminActionLink href={`/admin/roster?production=${selected}${ko ? '&lang=ko' : ''}`}>{ko ? '배역 편집' : 'Edit roster'}</AdminActionLink>}
      </div>
    </details>
    <div className={`teacher-reading-content${fontScale>=175?' teacher-large-type':''}`}>
    {loading && <p role="status">{ko ? '불러오는 중…' : 'Loading…'}</p>}
    {error && <p role="alert" className="admin-error">{ko ? '불러오지 못했습니다. 권한을 확인하고 페이지를 새로고침하세요.' : 'Unable to load. Check your access and refresh the page.'}</p>}
    {context && reading && <>
      {!context.assignments.length && <p className="admin-empty">{ko ? '배역 배정 전입니다. 전체 대본을 표시합니다.' : 'No student assignments yet. Showing the full script.'}</p>}
      <div className="teacher-column-key" aria-hidden="true"><span>{ko ? '배역' : 'Role'}</span><span>1부</span><span>2부</span></div>
      <ReadingContent sceneIdPrefix="teacher-scene-" document={reading} text={copy[locale]} media={context.payload.media} attribution={entry => {
        const tags = entry.tags ?? [];
        const assigned = context.assignments.filter(a => tags.includes(a.tag));
        return <><span className="entry-name">{tags.length ? tags.map((tag, index) => <span key={tag} className={assigned.some(a => a.tag === tag && assignmentMatches(a, selection)) ? 'teacher-role-selected' : undefined}>{index > 0 && ', '}{context.characters.find(c => c.tag === tag)?.label ?? tag}</span>) : entry.speaker}</span>
          {PERFORMANCES.map(performance => <span className="teacher-cast" key={performance} aria-label={performance}>{assigned.filter(a => a.performance === performance).length ? assigned.filter(a => a.performance === performance).map(a => <span className={assignmentMatches(a, selection) ? 'teacher-student-selected' : undefined} key={a.tag}>{a.studentName}</span>) : <span className="teacher-unassigned">—</span>}</span>)}</>;
      }} />
    </>}
    </div>
    </div>
  </section>;
}
