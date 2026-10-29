import { SettingsLabel } from './SettingsLabel';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Copy } from './i18n';

/** Keep the desktop sidebar open; mobile settings fold after character selection. */
export function ControlsPanel({ character, title, text, children }: {
  character: string; title?: string; text: Copy; children: ReactNode;
}) {
  const [mobile, setMobile] = useState(() => window.matchMedia?.('(max-width: 720px)').matches ?? false);
  const [expanded, setExpanded] = useState(true);
  const summary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 720px)');
    if (!query) return;
    const update = () => setMobile(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!character) setExpanded(true);
    else if (mobile) { setExpanded(false); summary.current?.focus({ preventScroll: true }); }
  }, [character, mobile]);
  const open = !mobile || expanded;
  return <aside className={`controls${open ? '' : ' controls-collapsed'}${character ? ' controls-reading' : ''}`} aria-label={text.settings} onKeyDown={event => { if (event.key === 'Escape' && mobile && character && expanded) { event.preventDefault(); setExpanded(false); summary.current?.focus({ preventScroll: true }); } }}>
    <button ref={summary} className="settings-summary" aria-label={`${title || text.app} — ${text.settingsButton}`} aria-expanded={open} aria-controls="settings-body" onClick={() => setExpanded(value => !value)}>
      <SettingsLabel title={title || text.app}/>
    </button>
    <div id="settings-body" hidden={!open}>{children}</div>
  </aside>;
}
