import { parentheticalRuns } from './parentheticals';
import { useEffect, useState, type ReactNode } from 'react';
import type { Copy } from './i18n';
import type { ReadingDocument, ReadingEntry } from './reading-document';

function DialogueText({ value }: { value: string }) {
  return parentheticalRuns(value).map((run, index) => run.italic
    ? <em className="inline-stage-action" key={index}>{run.text}</em> : run.text);
}
function ScriptText({ entry }: { entry: ReadingEntry }) {
  return <div className="entry-text"><p lang="en">{entry.kind === 'dialogue' ? <DialogueText value={entry.english} /> : entry.english}</p>
    {entry.korean.trim() && <p lang="ko" className="translation">{entry.kind === 'dialogue' ? <DialogueText value={entry.korean} /> : entry.korean}</p>}
  </div>;
}
function ScriptEntry({ entry, text, video, active, onToggle, attribution }: { attribution?: (entry: ReadingEntry) => ReactNode; entry: ReadingEntry; text: Copy; video?: string; active: boolean; onToggle: () => void }) {
  if (entry.kind === 'song') return <div className="song-group"><div className={`song-marker ${entry.highlighted ? 'highlighted' : ''}`} data-record={entry.no}>
    <span aria-hidden="true">♫</span>{attribution?.(entry)}<ScriptText entry={entry} />
    {entry.highlighted && <span className="visually-hidden">{text.contribution}</span>}
    {video && <button className="video-toggle" aria-expanded={active} aria-label={`${text.play}: ${entry.english}`} onClick={onToggle}>{active ? '−' : '▶'}</button>}
  </div>{video && active && <div className="song-player">
    <iframe title={entry.english} src={`https://www.youtube.com/embed/${video}?autoplay=1&playsinline=1`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    <a href={`https://www.youtube.com/watch?v=${video}`} target="_blank" rel="noopener noreferrer">{text.openYoutube}</a>
  </div>}</div>;
  return <article className={`script-entry ${entry.highlighted ? 'highlighted' : ''} ${entry.kind === 'dialogue' ? 'dialogue' : 'direction'} ${entry.stageDirection ? 'stage-direction' : ''}`} data-record={entry.no}>
    {attribution ? attribution(entry) : <span className="entry-name">{entry.speaker}</span>}<ScriptText entry={entry} />
  </article>;
}
export function ReadingContent({ document, text, media = {}, attribution, sceneIdPrefix }: { sceneIdPrefix?: string; document: Pick<ReadingDocument, 'blocks'> & Partial<Omit<ReadingDocument, 'blocks'>>; text: Copy; media?: Record<string, string>; attribution?: (entry: ReadingEntry) => ReactNode }) {
  const [active, setActive] = useState<number | null>(null);
  const songIds = document.blocks.flatMap(block => block.kind === 'passage' ? block.entries.filter(entry => entry.kind === 'song').map(entry => entry.no) : []);
  const visible = active !== null && songIds.includes(active) && /^[A-Za-z0-9_-]{11}$/.test(media[active] ?? '');
  useEffect(() => { setActive(null); }, [document.character?.tag]);
  useEffect(() => { if (!visible) setActive(null); }, [visible]);
  return <div className="script-pages">{document.blocks.map(block => block.kind === 'passage'
    ? <section key={`window-${block.passage}`} className="passage-window" aria-label={text.passage} data-passage={block.passage}>
      <div className="window-entries">{block.entries.map(entry => <ScriptEntry key={entry.no} attribution={attribution} entry={entry} text={text} video={/^[A-Za-z0-9_-]{11}$/.test(media[entry.no] ?? '') ? media[entry.no] : undefined} active={visible && active === entry.no} onToggle={() => setActive(value => value === entry.no ? null : entry.no)} />)}</div>
    </section>
    : <h3 key={block.entry.no} id={sceneIdPrefix ? `${sceneIdPrefix}${block.entry.no}` : undefined} tabIndex={sceneIdPrefix ? -1 : undefined} className="scene-heading"><span>{text.scene} {block.entry.scene.toString().padStart(2, '0')}</span>
      <span className="scene-title"><span lang="en">{block.entry.english}</span>
        {block.entry.korean.trim() && <span lang="ko" className="translation">{block.entry.korean}</span>}
      </span></h3>)}</div>;
}
