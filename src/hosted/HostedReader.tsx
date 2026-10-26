import { useEffect, useMemo, useRef, useState } from 'react';
import { ContextPicker } from '../ContextPicker';
import { copy, type Locale } from '../i18n';
import { loadPassages, loadProduction, ApiFailure } from './client';
import { unpackView, type ApiProblem, type PassageBundle, type Production } from './protocol';
import { ReaderPane } from './ReaderPane';

export function HostedReader({ slug }: { slug: string }) {
  const [locale, setLocale] = useState<Locale>('en'); const text = copy[locale];
  const [production, setProduction] = useState<Production | null>(null);
  const [character, setCharacter] = useState('');
  const [counts, setCounts] = useState({ before: 2, after: 1 });
  const [includeNonDialogue, setCues] = useState(false); const [showKorean, setKorean] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; bundle: PassageBundle } | null>(null);
  const cache = useRef(new Map<string, PassageBundle>());
  const options = useMemo(() => ({ ...counts, includeNonDialogue }), [counts, includeNonDialogue]);
  const key = `${production?.revision}:${character}:${counts.before}:${counts.after}:${Number(includeNonDialogue)}`;
  useEffect(() => { document.documentElement.lang = locale; document.title = text.app; }, [locale, text.app]);
  useEffect(() => {
    let active = true; const abort = new AbortController();
    setProduction(null); setCharacter(''); setProblem(null); setResult(null); cache.current.clear();
    void loadProduction(slug, abort.signal).then(value => { if (active) setProduction(value); }, error => {
      if (active) setProblem(error instanceof ApiFailure ? error.problem : { error: 'unavailable' });
    });
    return () => { active = false; abort.abort(); };
  }, [slug, attempt]);
  useEffect(() => {
    if (!production || !character) return;
    let active = true; const abort = new AbortController();
    setResult(null); setProblem(null);
    const cacheKey = `${production.revision}:${character}:${Number(includeNonDialogue)}`;
    const previous = cache.current.get(cacheKey);
    if (previous && Date.now() < Date.parse(previous.production.resetAt) && unpackView(previous, options, true)) {
      setResult({ key, bundle: previous }); return;
    }
    const timer = setTimeout(() => {
      void loadPassages(slug, production.revision, character, options, abort.signal).then(bundle => {
        if (!active) return;
        const merged = previous && previous.production.revision === bundle.production.revision
          ? { ...bundle, entries: { ...previous.entries, ...bundle.entries }, views: { ...previous.views, ...bundle.views }, media: { ...previous.media, ...bundle.media } } : bundle;
        cache.current.set(cacheKey, merged); setResult({ key, bundle: merged });
        setProduction(current => current ? { ...current, used: bundle.production.used, resetAt: bundle.production.resetAt } : null);
      }, error => {
        if (!active) return;
        const failure = error instanceof ApiFailure ? error.problem : { error: 'unavailable' as const };
        if (failure.error === 'revision_changed' || failure.error === 'not_found') cache.current.clear();
        setProblem(failure);
      });
    }, 200);
    return () => { active = false; clearTimeout(timer); abort.abort(); };
    // Production usage changes don't invalidate passage requests; revisions do.
  }, [slug, production?.revision, character, options, key, includeNonDialogue, retry]);
  const bundle = result?.key === key ? result.bundle : null;
  const reading = bundle ? unpackView(bundle, options, showKorean) : null;
  const busy = !problem && (!production || Boolean(character && !reading));
  const names = production?.characters.map(choice => choice.label) ?? [];
  const reset = problem?.resetAt ?? (problem?.retryAfter ? new Date(Date.now() + problem.retryAfter * 1000).toISOString() : null);
  return <div className="app-shell">
    <header className="masthead"><a className="brand" href={`/p/${slug}`}><span className="brand-mark" aria-hidden="true">sr<span>.</span></span><span>Script Reader</span></a>
      <div className="language-switch" role="group" aria-label={text.interfaceLanguage}>
        <button lang="en" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>ENG</button>
        <button lang="ko" aria-pressed={locale === 'ko'} onClick={() => setLocale('ko')}>한국어</button>
      </div></header>
    <main><h1 className="visually-hidden">{production?.title ?? text.app}</h1><div className="workspace">
      <aside className="controls" aria-label={text.settings}>
        <p className="production-title">{production?.title ?? text.script}</p>
        <section className="control-section"><label className="control-label" htmlFor="character">{text.character}</label>
          <select id="character" value={character} disabled={!production || problem?.error === 'revision_changed'} onChange={event => { setProblem(null); setCharacter(event.target.value); }}>
            <option value="">{text.selectCharacter}</option>
            {production?.characters.map(choice => <option key={choice.tag} value={choice.tag}>{choice.label}{names.filter(name => name === choice.label).length > 1 ? ` (${choice.tag})` : ''}</option>)}
          </select>{production && <p className="allowance">{text.allowance(production.used)}</p>}
        </section>
        <section className="control-section context-section"><ContextPicker value={counts} onChange={setCounts} disabled={!production} text={text} />
          <label className="toggle-row"><input type="checkbox" checked={includeNonDialogue} disabled={!production} onChange={event => setCues(event.target.checked)} /><span className="toggle-track" aria-hidden="true" /><span>{text.actions}</span></label>
          <label className="toggle-row"><input type="checkbox" checked={showKorean} disabled={!production} onChange={event => setKorean(event.target.checked)} /><span className="toggle-track" aria-hidden="true" /><span>{text.korean}</span></label>
        </section>
      </aside>
      <ReaderPane reading={problem ? null : reading} title={production?.characters.find(choice => choice.tag === character)?.label ?? text.script} text={text} busy={busy} media={bundle?.media ?? {}}>
        {problem ? <div className="validation" role="alert"><p>{text.apiError[problem.error]}</p>
          {reset && <p><time dateTime={reset}>{new Date(reset).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-GB', { timeZone: 'Asia/Seoul' })} KST</time></p>}
          <button onClick={() => { if (!production || problem.error === 'revision_changed' || problem.error === 'not_found') setAttempt(value => value + 1); else setRetry(value => value + 1); }}>{problem.error === 'revision_changed' ? text.reload : text.retry}</button>
        </div> : busy ? <div className="empty-state" role="status">{text.opening}</div> : !character && <div className="empty-state">{text.chooseCharacter}</div>}
      </ReaderPane>
    </div></main>
  </div>;
}
