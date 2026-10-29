import { useEffect, useRef, useState } from 'react';
import { parseAssignments, type Assignment, type AssignmentDiagnostic } from '../assignments';
import type { Locale } from '../i18n';
import { productionCall, ProductionFailure, type ProductionList } from './productions';
import type { AssignmentContext } from './teacher';
import { AdminActionLink } from './AdminActionLink';

type Preview = { assignments: Assignment[]; warnings: AssignmentDiagnostic[] };
export function AssignmentManager({ locale }: { locale: Locale }) {
  const ko = locale === 'ko';
  const [list, setList] = useState<ProductionList | null>(null);
  const [selected, setSelected] = useState('');
  const [context, setContext] = useState<AssignmentContext | null>(null);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [diagnostics, setDiagnostics] = useState<AssignmentDiagnostic[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmation, setConfirmation] = useState<'save' | 'delete' | null>(null);
  const generation = useRef(0); const active = useRef(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  function fail(value: unknown) {
    if (!active.current) return;
    const code = value instanceof ProductionFailure ? value.code : 'unavailable';
    setError(code);
    if (code === 'unauthorized' || code === 'forbidden') { setContext(null); setCsv(''); setPreview(null); setList(null); setDiagnostics([]); }
  }
  async function choose(slug: string) {
    const current = ++generation.current;
    setSelected(slug); setContext(null); setCsv(''); setPreview(null); setDiagnostics([]); setError(''); setSaved(false); setBusy(true);
    if (input.current) input.current.value = '';
    if (!slug) { setBusy(false); return; }
    const params = new URLSearchParams(window.location.search); params.set('production', slug);
    window.history.replaceState({}, '', window.location.pathname + '?' + params);
    try {
      const value = await productionCall<AssignmentContext>('productions/' + slug + '/assignments');
      if (active.current && current === generation.current) setContext(value);
    } catch (value) { if (current === generation.current) fail(value); }
    finally { if (active.current && current === generation.current) setBusy(false); }
  }
  useEffect(() => {
    active.current = true;
    void productionCall<ProductionList>('productions').then(value => {
      if (!active.current) return;
      setList(value);
      const slug = new URLSearchParams(window.location.search).get('production');
      const initial = value.productions.some(p => p.slug === slug) ? slug! : value.home.slug ?? value.productions[0]?.slug;
      if (initial) void choose(initial);
    }).catch(fail);
    return () => { active.current = false; generation.current++; };
  }, []);
  useEffect(() => { if (confirmation) dialog.current?.showModal(); else dialog.current?.close(); }, [confirmation]);
  async function file(file?: File) {
    const current = ++generation.current;
    setPreview(null); setDiagnostics([]); setCsv(''); setSaved(false); setError('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('too_large'); return; }
    setBusy(true);
    try { const value = await file.text(); if (active.current && current === generation.current) setCsv(value); }
    catch { if (active.current && current === generation.current) setError('unavailable'); }
    finally { if (active.current && current === generation.current) setBusy(false); }
  }
  const body = (clear = false) => ({ expected: context!.version, productionVersion: context!.productionVersion, ...(clear ? { clear: true } : { csv }) });
  async function validate() {
    if (!context) return;
    setPreview(null); setDiagnostics([]); setError('');
    const parsed = parseAssignments(csv, context.characters);
    if (!parsed.ok) { setDiagnostics(parsed.errors); return; }
    setBusy(true);
    try {
      const value = await productionCall<Preview>('productions/' + selected + '/assignments/validate', 'POST', body());
      if (active.current) setPreview(value);
    } catch (value) { fail(value); }
    finally { if (active.current) setBusy(false); }
  }
  async function save(clear: boolean) {
    setConfirmation(null); setError(''); setBusy(true);
    try {
      await productionCall('productions/' + selected + '/assignments', 'PATCH', body(clear));
      await choose(selected);
      if (active.current) setSaved(true);
    } catch (value) { fail(value); }
    finally { if (active.current) setBusy(false); }
  }
  const problem = error === 'conflict' ? (ko ? '공연 또는 배정이 변경되었습니다. 새로고침 후 다시 확인하세요.' : 'The production or assignments changed. Refresh and validate again.')
    : error === 'too_large' ? (ko ? '파일은 5 MiB 이하여야 합니다.' : 'Use a file smaller than 5 MiB.')
    : ['unauthorized', 'forbidden'].includes(error) ? (ko ? '다시 로그인하여 권한을 확인하세요.' : 'Sign in again to check your access.')
    : (ko ? '요청을 완료하지 못했습니다. 파일을 확인하고 다시 시도하세요.' : 'Unable to complete the request. Check the file and try again.');
  function table(rows: Assignment[]) {
    return <div className="assignment-table-wrap"><table className="assignment-table"><thead><tr>{(ko ? ['학생 ID', '이름', '반', '회차', '배역 태그'] : ['Student ID', 'Name', 'Class', 'Performance', 'Role tag']).map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(a => <tr key={`${a.performance}:${a.tag}`}><td>{a.studentId}</td><td>{a.studentName}</td><td>{a.className || '—'}</td><td>{a.performance}</td><td>{a.tag}</td></tr>)}</tbody></table></div>;
  }
  return <section className="assignment-manager" aria-busy={busy}>
    {error && <p role="alert" className="admin-error">{problem}</p>}{saved && <p role="status">{ko ? '저장했습니다.' : 'Saved.'}</p>}
    {list && <section className="admin-card"><label htmlFor="assignments-production">{ko ? '공연 선택' : 'Choose a production'}</label><select id="assignments-production" value={selected} disabled={busy} onChange={e => void choose(e.target.value)}><option value="">{ko ? '공연 선택' : 'Choose a production'}</option>{list.productions.map(p => <option key={p.slug} value={p.slug}>{p.title}</option>)}</select></section>}
    {context && <>
      <section className="admin-card"><div className="admin-heading"><h2>{context.title}</h2><AdminActionLink href={`/admin/viewer?production=${selected}${ko ? '&lang=ko' : ''}`}>{ko ? '교사용 대본 열기' : 'Open teacher viewer'}</AdminActionLink></div>
        <p>{ko ? `배정 ${context.assignments.length}개` : `${context.assignments.length} assignments`}</p>
        {!!context.assignments.length && <details><summary>{ko ? '현재 배정' : 'Current assignments'}</summary>{table(context.assignments)}</details>}
        <label htmlFor="assignment-file">{ko ? '배역 배정 CSV' : 'Assignment CSV'}</label><input ref={input} id="assignment-file" type="file" accept=".csv,text/csv" disabled={busy} onChange={e => void file(e.target.files?.[0])} />
        <details className="csv-example"><summary>{ko ? 'CSV 형식' : 'CSV format'}</summary><pre>StudentId,StudentName,Class,Performance,Tag</pre><p>{ko ? '학생 ID는 공연 내에서 유지하는 임의의 코드입니다. 같은 학생은 모든 배역과 회차에 같은 ID를 사용하세요. 반은 비워 둘 수 있습니다. 회차는 1부 또는 2부입니다. 배역 태그는 이 공연의 등장인물 태그를 사용하세요.' : 'Use a stable, production-local student code for every role and performance belonging to that student. Class may be blank. Performance is 1부 or 2부. Tag must match this production’s character roster.'}</p></details>
        <div className="admin-dialog-actions"><button className="admin-primary" disabled={busy || !csv} onClick={() => void validate()}>{ko ? '검증 및 미리보기' : 'Validate and preview'}</button><small className="upload-unsaved-note">{ko ? '확인 후 저장하면 전체 배정이 교체됩니다.' : 'Saving replaces the complete assignment list after confirmation.'}</small></div>
        {diagnostics.length > 0 && <ul role="alert" className="admin-error">{diagnostics.map((d, i) => <li key={i}>{ko ? '행' : 'Record'} {d.recordNumber}: {d.message}</li>)}</ul>}
      </section>
      {preview && <section className="admin-card"><h2>{ko ? '배정 미리보기' : 'Assignment preview'}</h2><p>{ko ? `${new Set(preview.assignments.map(a => a.studentId)).size}명 · 배정 ${preview.assignments.length}개` : `${new Set(preview.assignments.map(a => a.studentId)).size} students · ${preview.assignments.length} assignments`}</p>
        {preview.warnings.length > 0 && <ul role="status">{preview.warnings.map((d, i) => <li key={i}>{ko ? '행' : 'Record'} {d.recordNumber}: {d.message}</li>)}</ul>}{table(preview.assignments)}
        <button className="admin-primary" disabled={busy} onClick={() => setConfirmation('save')}>{ko ? '배정 저장' : 'Save assignments'}</button></section>}
      {!!context.assignments.length && <details className="admin-card"><summary>{ko ? '배정 삭제' : 'Delete assignments'}</summary><p>{ko ? '학생 배정만 삭제됩니다. 대본과 등장인물은 유지됩니다.' : 'Deletes student assignments for this production. The script and character roster remain available.'}</p><button className="admin-secondary" disabled={busy} onClick={() => setConfirmation('delete')}>{ko ? '모든 배정 삭제' : 'Delete all assignments'}</button></details>}
    </>}
    <dialog ref={dialog} className="admin-dialog" aria-labelledby="assignment-confirmation" onCancel={e => { e.preventDefault(); if (!busy) setConfirmation(null); }}>
      <h2 id="assignment-confirmation">{confirmation === 'delete' ? (ko ? '모든 학생 배정을 삭제할까요?' : 'Delete all student assignments?') : (ko ? '전체 학생 배정을 교체할까요?' : 'Replace all student assignments?')}</h2>
      <p>{context?.title}</p><div className="admin-dialog-actions"><button disabled={busy} onClick={() => setConfirmation(null)}>{ko ? '취소' : 'Cancel'}</button><button className="admin-primary" disabled={busy} onClick={() => void save(confirmation === 'delete')}>{ko ? '확인' : 'Confirm'}</button></div>
    </dialog>
  </section>;
}
