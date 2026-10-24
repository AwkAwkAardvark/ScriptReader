import { useEffect, useMemo, useRef, useState } from 'react';
import { filterScript, parseScript, type Diagnostic, type FilteredItem, type Script } from './script';
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

function ScriptEntry({ item: { record, highlighted }, showKorean, text }: { item: FilteredItem; showKorean: boolean; text: Copy }) {
  if (record.types.includes('Song')) return <div className={`song-marker ${highlighted ? 'highlighted' : ''}`} data-record={record.no}>
    <span aria-hidden="true">♫</span><ScriptText english={record.source.English} korean={record.source.Korean} showKorean={showKorean} />
    {highlighted && <span className="visually-hidden">{text.contribution}</span>}
  </div>;
  const dialogue = record.types.includes('Line');
  const stageDirection = record.types.includes('StageDirection');
  return <article className={`script-entry ${highlighted ? 'highlighted' : ''} ${dialogue ? 'dialogue' : 'direction'} ${stageDirection ? 'stage-direction' : ''}`} data-record={record.no}>
    <span className="entry-name" lang="en">{record.source.Role}</span>
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
  const [script, setScript] = useState<Script | null>(null);
  const [filename, setFilename] = useState('');
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
  const [errors, setErrors] = useState<Diagnostic[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const filtered = useMemo(() => filterScript(script?.records ?? [], { character, ...context, includeNonDialogue }),
    [script, character, context, includeNonDialogue]);
  const selectedName = script?.characters.find(choice => choice.tag === character)?.label;
  const sceneCount = new Set(filtered.items.map(item => item.record.scene)).size;
  const contributionCount = filtered.items.filter(item => item.highlighted && item.record.types.includes('Line')).length;
  const blocks = useMemo(() => readingBlocks(filtered.items), [filtered.items]);

  async function openFile(file: File) {
    const current = ++request.current;
    setLoading(true);
    setErrors([]);
    setScript(null);
    setCharacter('');
    setFilename(file.name);
    try {
      // Yield so the loading state can paint before parsing the local text.
      const text = await readFile(file);
      if (current !== request.current) return;
      const result = parseScript(text);
      if (result.ok) setScript(result.script);
      else setErrors(result.errors);
    } catch (error) {
      if (current === request.current) setErrors([{ recordNumber: 0,
        message: error instanceof Error ? error.message : 'Unable to open the file.' }]);
    } finally {
      if (current === request.current) setLoading(false);
    }
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
            <div className={`file-drop ${dragging ? 'is-dragging' : ''}`}
              onDragOver={event => { event.preventDefault(); setDragging(true); }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
              onDrop={event => {
                event.preventDefault(); setDragging(false);
                const files = event.dataTransfer.files;
                if (files.length !== 1) {
                  setErrors([{ recordNumber: 0, message: 'Please open one script file at a time.' }]);
                  return;
                }
                void openFile(files[0]);
              }}>
              <button className="open-button" onClick={() => input.current?.click()}>{text.open} <span aria-hidden="true">↑</span></button>
              <input ref={input} type="file" accept=".csv,text/csv" aria-label={text.scriptFile} className="visually-hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void openFile(file);
                  event.target.value = '';
                }} />
              <p>{filename ? <span className="filename">{filename}</span> : text.drop}</p>
            </div>
          </section>

          <section className="control-section">
            <label className="control-label" htmlFor="character">{text.character}</label>
            <select id="character" value={character} disabled={!script || loading} onChange={event => setCharacter(event.target.value)}>
              <option value="">{text.selectCharacter}</option>
              {script?.characters.map(choice => <option key={choice.tag} value={choice.tag}>{choice.label}</option>)}
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
            : errors.length > 0 ? <div className="validation" role="alert"><h3>{text.checkCsv}</h3><ul>{errors.map((error, index) => <li key={index}><strong>{error.recordNumber ? text.record(error.recordNumber) : text.file}{error.field ? ` · ${error.field}` : ''}</strong><span>{diagnosticMessage(error.message, locale)}</span></li>)}</ul></div>
            : !script || !character ? <div className="empty-state">
              <h3>{script ? text.chooseCharacter : text.openPrompt}</h3>
            </div>
            : filtered.items.length === 0 ? <div className="empty-state"><h3>{text.noMatches}</h3></div>
            : <>
              <div className="reading-meta" role="status"><span>{text.summary(contributionCount, sceneCount)}</span></div>
              <div className="script-pages">{blocks.map(block => {
                if (block.kind === 'window') return <section key={`window-${block.passage}`} className="passage-window" aria-label={text.passage} data-passage={block.passage}>
                  <div className="window-entries">{block.items.map(item => <ScriptEntry key={item.record.no} item={item} showKorean={showKorean} text={text} />)}</div>
                </section>;
                const { record } = block.item;
                if (record.types.includes('Title')) return <h3 key={record.no} className="scene-heading"><span>{text.scene} {record.scene.toString().padStart(2, '0')}</span><span className="scene-title"><span lang="en">{record.source.English}</span>{showKorean && record.source.Korean.trim() && <span lang="ko" className="translation">{record.source.Korean}</span>}</span></h3>;
                return <ScriptEntry key={record.no} item={block.item} showKorean={showKorean} text={text} />;
              })}</div>
            </>}
        </section>
      </div>
    </main>
  </div>;
}
