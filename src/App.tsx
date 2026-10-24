import { useEffect, useMemo, useRef, useState } from 'react';
import { attribution, filterScript, parseScript, type Diagnostic, type FilteredItem, type Script } from './script';
import { parseCast } from './cast';
import { copy, diagnosticMessage, type Copy, type Locale } from './i18n';

type ReaderBlock = { kind: 'marker'; item: FilteredItem } | { kind: 'window'; passage: number; items: FilteredItem[] };

function readingBlocks(items: FilteredItem[]): ReaderBlock[] {
  const blocks: ReaderBlock[] = [];
  for (const item of items) {
    if (item.passage === null) blocks.push({ kind: 'marker', item });
    else {
      const last = blocks.at(-1);
      if (last?.kind === 'window' && last.passage === item.passage) last.items.push(item);
      else blocks.push({ kind: 'window', passage: item.passage, items: [item] });
    }
  }
  return blocks;
}

function ScriptText({ english, korean, showKorean }: { english: string; korean: string; showKorean: boolean }) {
  return <div className="entry-text"><p lang="en">{english}</p>
    {showKorean && korean.trim() && <p lang="ko" className="translation">{korean}</p>}
  </div>;
}

function ScriptEntry({ item: { record, highlighted }, showKorean, text, label }: { item: FilteredItem; showKorean: boolean; text: Copy; label: string }) {
  if (record.types.includes('Song')) return <div className={`song-marker ${highlighted ? 'highlighted' : ''}`} data-record={record.no}>
    <span aria-hidden="true">♫</span><ScriptText english={record.source.English} korean={record.source.Korean} showKorean={showKorean} />
    {highlighted && <span className="visually-hidden">{text.contribution}</span>}
  </div>;
  const dialogue = record.types.includes('Line');
  const stageDirection = record.types.includes('StageDirection');
  return <article className={`script-entry ${highlighted ? 'highlighted' : ''} ${dialogue ? 'dialogue' : 'direction'} ${stageDirection ? 'stage-direction' : ''}`} data-record={record.no}>
    <span className="entry-name">{label}</span>
    <ScriptText english={record.source.English} korean={record.source.Korean} showKorean={showKorean} />
  </article>;
}

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

type Context = { before: number; after: number };
function ContextPicker({ value, onChange, disabled, text }: {
  value: Context; onChange: (counts: Context) => void; disabled: boolean; text: Copy;
}) {
  const [preset, setPreset] = useState('3');
  const [draft, setDraft] = useState({ before: String(value.before), after: String(value.after) });
  const customInput = useRef<HTMLInputElement>(null);
  const isValid = (text: string) => /^\d+$/.test(text) && Number(text) >= 0 && Number(text) <= 10;
  useEffect(() => { if (preset === 'other') customInput.current?.focus(); }, [preset]);
  return <fieldset className="context-picker" disabled={disabled}>
    <legend>{text.context}</legend>
    <div className="context-options">{['1', '3', '5', 'other'].map(option => <label key={option}>
      <input type="radio" name="context" value={option} checked={preset === option} onChange={() => {
        setPreset(option);
        if (option === 'other') setDraft({ before: String(value.before), after: String(value.after) });
        else onChange({ before: Number(option), after: Number(option) });
      }} />
      <span>{option === 'other' ? text.other : `±${option}`}</span>
    </label>)}</div>
    {preset === 'other' && <div className="custom-context">
      {(['before', 'after'] as const).map(side => <div className="custom-count" key={side}>
        <label htmlFor={`context-${side}`}>{text[side]}</label>
        <input id={`context-${side}`} ref={side === 'before' ? customInput : undefined} type="number" inputMode="numeric" min="0" max="10" step="1" value={draft[side]}
          aria-invalid={!isValid(draft[side])} aria-describedby={!isValid(draft[side]) ? `context-${side}-error` : undefined}
          onChange={event => {
            const next = event.target.value;
            setDraft(previous => ({ ...previous, [side]: next }));
            if (isValid(next)) onChange({ ...value, [side]: Number(next) });
          }} />
        {!isValid(draft[side]) && <span className="field-error" id={`context-${side}-error`}>{text.rangeError}</span>}
      </div>)}
    </div>}
  </fieldset>;
}

export default function App() {
  const [files, setFiles] = useState<Record<ImportKind, ImportedFile | null>>({ script: null, cast: null });
  const [character, setCharacter] = useState('');
  const [context, setContext] = useState<Context>({ before: 3, after: 3 });
  const [includeNonDialogue, setIncludeNonDialogue] = useState(false);
  const [locale, setLocale] = useState<Locale>('en');
  const [showKorean, setShowKorean] = useState(false);
  const text = copy[locale];
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = text.app;
  }, [locale, text.app]);
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
  const sceneCount = new Set(filtered.items.map(item => item.record.scene)).size;
  const contributionCount = filtered.items.filter(item => item.highlighted && item.record.types.includes('Line')).length;
  const blocks = useMemo(() => readingBlocks(filtered.items), [filtered.items]);
  const repeatedNames = useMemo(() => {
    const counts = new Map<string, number>();
    script?.characters.forEach(choice => counts.set(choice.label, (counts.get(choice.label) ?? 0) + 1));
    return counts;
  }, [script]);

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
      <a className="brand" href="#"><span className="brand-mark" aria-hidden="true">sr<span>.</span></span><span>{text.app}</span></a>
      <div className="language-switch" role="group" aria-label={text.interfaceLanguage}>
        <button lang="en" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>ENG</button>
        <button lang="ko" aria-pressed={locale === 'ko'} onClick={() => setLocale('ko')}>한국어</button>
      </div>
    </header>

    <main>
      <h1 className="visually-hidden">{text.app}</h1>

      <div className="workspace">
        <aside className="controls" aria-label={text.settings}>
          <section className="control-section file-section">
            <FileImport kind="script" file={files.script} text={text} onOpen={file => void openFile('script', file)} onIssue={() => importIssue('script')} />
            <FileImport kind="cast" file={files.cast} text={text} onOpen={file => void openFile('cast', file)} onIssue={() => importIssue('cast')} onClear={clearCast} />
          </section>

          <section className="control-section">
            <label className="control-label" htmlFor="character">{text.character}</label>
            <select id="character" value={character} disabled={!script || loading} onChange={event => setCharacter(event.target.value)}>
              <option value="">{text.selectCharacter}</option>
              {script?.characters.map(choice => <option key={choice.tag} value={choice.tag}>{choice.label}{(repeatedNames.get(choice.label) ?? 0) > 1 ? ` (${choice.tag})` : ''}</option>)}
            </select>
          </section>

          <section className="control-section context-section">
            <ContextPicker value={context} onChange={setContext} disabled={!script || loading} text={text} />
            <label className="toggle-row">
              <input type="checkbox" checked={includeNonDialogue} disabled={!script || loading}
                onChange={event => setIncludeNonDialogue(event.target.checked)} />
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
        </aside>

        <section className="reader" aria-labelledby="reader-title" aria-busy={loading}>
          <header className="reader-header">
            <h2 id="reader-title">{selectedName || text.script}</h2>
          </header>

          {loading ? <div className="empty-state" role="status"><h3>{text.opening}</h3></div>
            : errors.length > 0 ? <div className="validation" role="alert"><h3>{text.checkCsv}</h3><ul>{errors.map((error, index) => <li key={index}><strong>{error.document === 'cast' ? text.castFile : text.scriptFile} · {error.recordNumber ? text.record(error.recordNumber) : text.file}{error.field ? ` · ${error.field}` : ''}</strong><span>{diagnosticMessage(error.message, locale)}</span></li>)}</ul></div>
            : !script || !character ? <div className="empty-state">
              <h3>{script ? text.chooseCharacter : text.openPrompt}</h3>
            </div>
            : filtered.items.length === 0 ? <div className="empty-state"><h3>{text.noMatches}</h3></div>
            : <>
              <div className="reading-meta" role="status"><span>{text.summary(contributionCount, sceneCount)}</span></div>
              <div className="script-pages">{blocks.map(block => {
                if (block.kind === 'window') return <section key={`window-${block.passage}`} className="passage-window" aria-label={text.passage} data-passage={block.passage}>
                  <div className="window-entries">{block.items.map(item => <ScriptEntry key={item.record.no} item={item} showKorean={showKorean} text={text} label={attribution(item.record, script)} />)}</div>
                </section>;
                const { record } = block.item;
                if (record.types.includes('Title')) return <h3 key={record.no} className="scene-heading"><span>{text.scene} {record.scene.toString().padStart(2, '0')}</span><span className="scene-title"><span lang="en">{record.source.English}</span>{showKorean && record.source.Korean.trim() && <span lang="ko" className="translation">{record.source.Korean}</span>}</span></h3>;
                return <ScriptEntry key={record.no} item={block.item} showKorean={showKorean} text={text} label={attribution(record, script)} />;
              })}</div>
            </>}
        </section>
      </div>
    </main>
  </div>;
}
