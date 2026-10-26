import type { Copy } from './i18n';
import type { ReadingDocument, ReadingEntry } from './reading-document';

function ScriptText({ entry }: { entry: ReadingEntry }) {
  return <div className="entry-text"><p lang="en">{entry.english}</p>
    {entry.korean.trim() && <p lang="ko" className="translation">{entry.korean}</p>}
  </div>;
}
function ScriptEntry({ entry, text }: { entry: ReadingEntry; text: Copy }) {
  if (entry.kind === 'song') return <div className={`song-marker ${entry.highlighted ? 'highlighted' : ''}`} data-record={entry.no}>
    <span aria-hidden="true">♫</span><ScriptText entry={entry} />
    {entry.highlighted && <span className="visually-hidden">{text.contribution}</span>}
  </div>;
  return <article className={`script-entry ${entry.highlighted ? 'highlighted' : ''} ${entry.kind === 'dialogue' ? 'dialogue' : 'direction'} ${entry.stageDirection ? 'stage-direction' : ''}`} data-record={entry.no}>
    <span className="entry-name">{entry.speaker}</span><ScriptText entry={entry} />
  </article>;
}
export function ReadingContent({ document, text }: { document: ReadingDocument; text: Copy }) {
  return <div className="script-pages">{document.blocks.map(block => block.kind === 'passage'
    ? <section key={`window-${block.passage}`} className="passage-window" aria-label={text.passage} data-passage={block.passage}>
      <div className="window-entries">{block.entries.map(entry => <ScriptEntry key={entry.no} entry={entry} text={text} />)}</div>
    </section>
    : <h3 key={block.entry.no} className="scene-heading"><span>{text.scene} {block.entry.scene.toString().padStart(2, '0')}</span>
      <span className="scene-title"><span lang="en">{block.entry.english}</span>
        {block.entry.korean.trim() && <span lang="ko" className="translation">{block.entry.korean}</span>}
      </span></h3>)}</div>;
}
