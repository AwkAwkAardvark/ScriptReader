import { Home } from './Home';
import { applyActionVisibility } from './action-visibility';
import { AdminPanel } from './admin/AdminPanel';
import { BrandMark } from './BrandMark';
import { DEFAULT_CONTEXT } from './context';
import { readerRoute,legacyRosterLocation } from './routes';
import { ControlsPanel } from './ControlsPanel';
import { CharacterOptions } from './CharacterOptions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { filterScript, parseScript, type Diagnostic, type Script } from './script';
import { parseCast } from './cast';
import { copy, diagnosticMessage, type Copy, type Locale } from './i18n';

import { buildReadingDocument } from './reading-document';
import { ReadingContent } from './ReadingContent';
import { preparePrintFont } from './print-font';
import { preparePrintLayout } from './print-layout';
import { ContextPicker, type Context } from './ContextPicker';
import { HostedReader } from './hosted/HostedReader';

const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('The file could not be read. Please try opening it again.'));
  reader.onabort = () => reject(new Error('Opening the file was interrupted. Please try again.'));
  reader.readAsText(file, 'UTF-8');
});

type ImportKind = 'script' | 'cast';
type ImportedFile = { name: string; text: string | null; loading: boolean; error?: string };

function FileImport({ kind, file, text, onOpen, onIssue, onClear }: {
  kind: ImportKind; file: ImportedFile | null; text: Copy;
  onOpen: (file: File) => void; onIssue: () => void; onClear?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <div className={`file-drop ${kind === 'cast' ? 'cast-drop' : ''} ${dragging ? 'is-dragging' : ''}`}
    onDragOver={event => { event.preventDefault(); setDragging(true); }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
    onDrop={event => {
      event.preventDefault(); setDragging(false);
      if (event.dataTransfer.files.length !== 1) { onIssue(); return; }
      onOpen(event.dataTransfer.files[0]);
    }}>
    <button className={`open-button ${kind === 'cast' ? 'secondary-button' : ''}`} onClick={() => input.current?.click()}>
      {kind === 'cast' ? text.openCast : text.open} <span aria-hidden="true">↑</span>
    </button>
    <input ref={input} type="file" accept=".csv,text/csv" aria-label={kind === 'cast' ? text.castFile : text.scriptFile} className="visually-hidden"
      onChange={event => {
        const selected = event.target.files?.[0];
        if (selected) onOpen(selected);
        event.target.value = '';
      }} />
    {file ? <p className="imported-name"><span className="filename">{file.name}</span>
      {onClear && <button className="clear-file" aria-label={text.removeCast} onClick={onClear}>×</button>}
    </p> : kind === 'script' && <p>{text.drop}</p>}
  </div>;
}

function LocalReader() {
  const [files, setFiles] = useState<Record<ImportKind, ImportedFile | null>>({ script: null, cast: null });
  const [character, setCharacter] = useState('');
  const [context, setContext] = useState<Context>(DEFAULT_CONTEXT);
  const [hideActions, setHideActions] = useState(false);
  const includeNonDialogue = !hideActions;
  const [locale, setLocale] = useState<Locale>('en');
  const [showKorean, setShowKorean] = useState(false);
  const text = copy[locale];
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = text.app;
  }, [locale, text.app]);
  useEffect(() => {
    const prepare = () => preparePrintLayout();
    window.addEventListener('beforeprint', prepare);
    return () => window.removeEventListener('beforeprint', prepare);
  }, []);
  const request = useRef({ script: 0, cast: 0 });
  const loading = Boolean(files.script?.loading || files.cast?.loading);
  const imported = useMemo<{ script: Script | null; errors: Diagnostic[] }>(() => {
    if (files.script?.loading || files.cast?.loading) return { script: null, errors: [] };
    const errors: Diagnostic[] = [];
    for (const kind of ['script', 'cast'] as const) {
      if (files[kind]?.error) errors.push({ document: kind, recordNumber: 0, message: files[kind]!.error! });
    }
    if (errors.length) return { script: null, errors };
    const cast = files.cast?.text != null ? parseCast(files.cast.text) : null;
    if (cast && !cast.ok) return { script: null, errors: cast.errors };
    if (files.script?.text == null) return { script: null, errors: [] };
    const result = parseScript(files.script.text, cast?.characters);
    return result.ok ? { script: result.script, errors: [] } : { script: null, errors: result.errors };
  }, [files]);
  const { script, errors } = imported;
  const filtered = useMemo(() => filterScript(script?.records ?? [], { character, ...context, includeNonDialogue }),
    [script, character, context, includeNonDialogue]);
  const selectedName = script?.characters.find(choice => choice.tag === character)?.label;
  const reading = useMemo(() => script && character ? applyActionVisibility(buildReadingDocument(script, filtered, character,
    { ...context, includeNonDialogue, showKorean }), hideActions) : null, [script, filtered, character, context, includeNonDialogue, showKorean, hideActions]);
  const [fontState, setFontState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fontAttempt, setFontAttempt] = useState(0);
  useEffect(() => {
    if (!reading?.blocks.length) return;
    let active = true;
    setFontState('loading');
    void preparePrintFont().then(() => { if (active) setFontState('ready'); }, () => { if (active) setFontState('error'); });
    return () => { active = false; };
  }, [Boolean(reading?.blocks.length), fontAttempt]);
  const canPrint = Boolean(reading?.blocks.length && !loading && !errors.length && fontState === 'ready');

  async function openFile(kind: ImportKind, file: File) {
    const current = ++request.current[kind];
    setCharacter('');
    setFiles(previous => ({ ...previous, [kind]: { name: file.name, text: null, loading: true } }));
    try {
      const content = await readFile(file);
      if (current !== request.current[kind]) return;
      setFiles(previous => ({ ...previous, [kind]: { name: file.name, text: content, loading: false } }));
    } catch (error) {
      if (current !== request.current[kind]) return;
      setFiles(previous => ({ ...previous, [kind]: { name: file.name, text: null, loading: false,
        error: error instanceof Error ? error.message : 'Unable to open the file.' } }));
    }
  }

  function importIssue(kind: ImportKind) {
    request.current[kind]++;
    setCharacter('');
    setFiles(previous => ({ ...previous, [kind]: { name: '', text: null, loading: false, error: 'Please open one CSV file per control.' } }));
  }

  function clearCast() {
    request.current.cast++;
    setCharacter('');
    setFiles(previous => ({ ...previous, cast: null }));
  }

  return <div className="app-shell">
    <header className="masthead">
      <a className="brand" href="#"><BrandMark /><span>{text.app}</span></a>
      <div className="language-switch" role="group" aria-label={text.interfaceLanguage}>
        <button lang="en" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>ENG</button>
        <button lang="ko" aria-pressed={locale === 'ko'} onClick={() => setLocale('ko')}>한국어</button>
      </div>
    </header>

    <main>
      <h1 className="visually-hidden">{text.app}</h1>

      <div className="workspace">
        <ControlsPanel character={character} text={text}>
          <section className="control-section file-section">
            <FileImport kind="script" file={files.script} text={text} onOpen={file => void openFile('script', file)} onIssue={() => importIssue('script')} />
            <FileImport kind="cast" file={files.cast} text={text} onOpen={file => void openFile('cast', file)} onIssue={() => importIssue('cast')} onClear={clearCast} />
          </section>

          <section className="control-section">
            <label className="control-label" htmlFor="character">{text.character}</label>
            <select id="character" value={character} disabled={!script || loading} onChange={event => setCharacter(event.target.value)}>
              <option value="">{text.selectCharacter}</option>
              <CharacterOptions characters={script?.characters ?? []} />
            </select>
          </section>

          <section className="control-section context-section">
            <ContextPicker value={context} onChange={setContext} disabled={!script || loading} text={text} />
            <label className="toggle-row">
              <input type="checkbox" checked={hideActions} disabled={!script || loading}
                onChange={event => setHideActions(event.target.checked)} />
              <span className="toggle-track" aria-hidden="true" />
              <span>{text.actions}</span>
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={showKorean} disabled={!script || loading}
                onChange={event => setShowKorean(event.target.checked)} />
              <span className="toggle-track" aria-hidden="true" />
              <span>{text.korean}</span>
            </label>
          </section>
        </ControlsPanel>

        <section className="reader" aria-labelledby="reader-title" aria-busy={loading}>
          <header className="reader-header">
            <h2 id="reader-title" className="print-reader-title">{selectedName || text.script}</h2>
            {reading && !loading && !errors.length && reading.blocks.length > 0 && <div className="reading-meta" role="status">{text.summary(reading.contributionCount, reading.sceneCount)}</div>}
            <div className="print-actions"><button className="print-button" disabled={!canPrint} onClick={() => { if (canPrint) window.print(); }}>{text.print}</button></div>
          </header>

          {loading ? <div className="empty-state" role="status"><h3>{text.opening}</h3></div>
            : errors.length > 0 ? <div className="validation" role="alert"><h3>{text.checkCsv}</h3><ul>{errors.map((error, index) => <li key={index}><strong>{error.document === 'cast' ? text.castFile : text.scriptFile} · {error.recordNumber ? text.record(error.recordNumber) : text.file}{error.field ? ` · ${error.field}` : ''}</strong><span>{diagnosticMessage(error.message, locale)}</span></li>)}</ul></div>
            : !script || !character ? <div className="empty-state">
              <h3>{script ? text.chooseCharacter : text.openPrompt}</h3>
            </div>
            : filtered.items.length === 0 ? <div className="empty-state"><h3>{text.noMatches}</h3></div>
            : <>
              <p className="print-context">{text.before} {context.before} · {text.after} {context.after}</p>
              {fontState === 'loading' && <p className="print-status" role="status">{text.preparingPrint}</p>}
              {fontState === 'error' && <p className="print-status" role="status">{text.printError} <button onClick={() => setFontAttempt(value => value + 1)}>{text.retry}</button></p>}
              <ReadingContent document={reading!} text={text} />
            </>}
        </section>
      </div>
    </main>
  </div>;
}

function LegacyRosterRedirect(){useEffect(()=>{window.location.replace(legacyRosterLocation(window.location.search));},[]);return <p role="status">{new URLSearchParams(window.location.search).get('lang')==='ko'?'배역 배정을 여는 중…':'Opening roster…'}</p>;}

export default function App() {
  const route = readerRoute(window.location.pathname, window.location.protocol, import.meta.env.DEV);
  if (route.kind === 'roster-redirect')return <LegacyRosterRedirect/>;
  if (route.kind === 'home') return <Home />;
  if (route.kind === 'admin') return <AdminPanel page={route.page} />;
  if (route.kind === 'production') return <HostedReader slug={route.slug} />;
  if (route.kind === 'local') return <LocalReader />;
  return <main className="app-shell"><h1>Page not found</h1><a href="/">Script Reader</a></main>;
}
