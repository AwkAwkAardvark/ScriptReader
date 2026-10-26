import { useEffect, useState, type ReactNode } from 'react';
import { ReadingContent } from '../ReadingContent';
import type { ReadingDocument } from '../reading-document';
import type { Copy } from '../i18n';
import { preparePrintFont } from '../print-font';
import { preparePrintLayout } from '../print-layout';

export function ReaderPane({ reading, title, text, media, children, busy }: {
  reading: ReadingDocument | null; title: string; text: Copy; media: Record<string, string>; children?: ReactNode; busy: boolean;
}) {
  const [font, setFont] = useState('loading'); const [attempt, setAttempt] = useState(0);
  const hasReading = Boolean(reading?.blocks.length);
  useEffect(() => {
    if (!hasReading) return;
    let active = true; setFont('loading');
    void preparePrintFont().then(() => { if (active) setFont('ready'); }, () => { if (active) setFont('error'); });
    return () => { active = false; };
  }, [hasReading, attempt]);
  useEffect(() => {
    const prepare = () => preparePrintLayout();
    window.addEventListener('beforeprint', prepare);
    return () => window.removeEventListener('beforeprint', prepare);
  }, []);
  const canPrint = hasReading && !busy && font === 'ready';
  return <section className="reader" aria-labelledby="reader-title" aria-busy={busy}>
    <header className="reader-header"><h2 id="reader-title">{title}</h2>
      <div className="print-actions"><button className="print-button" disabled={!canPrint} onClick={() => { if (canPrint) window.print(); }}>{text.print}</button></div>
    </header>
    {reading && <><div className="reading-meta" role="status">{text.summary(reading.contributionCount, reading.sceneCount)}</div>
      <p className="print-context">{text.before} {reading.context.before} · {text.after} {reading.context.after}</p>
      {font === 'loading' && <p className="print-status" role="status">{text.preparingPrint}</p>}
      {font === 'error' && <p className="print-status" role="status">{text.printError} <button onClick={() => setAttempt(value => value + 1)}>{text.retry}</button></p>}
      {hasReading ? <ReadingContent key={reading.character.tag} document={reading} text={text} media={media} /> : <div className="empty-state">{text.noMatches}</div>}
    </>}
    {children}
  </section>;
}
