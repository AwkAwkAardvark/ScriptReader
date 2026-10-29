import { useEffect, useRef, useState } from 'react';
import { MAX_CONTEXT, validContextCount, type Context } from './context';
import type { Copy } from './i18n';
export type { Context } from './context';

export function ContextPicker({ value, onChange, disabled, text, idPrefix='context', legend }: {
  value: Context; onChange: (counts: Context) => void; disabled: boolean; text: Copy; idPrefix?: string; legend?: string;
}) {
  const [draft, setDraft] = useState(value);
  const latest = useRef(value);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) { latest.current = value; setDraft(value); }
  }, [value]);
  const commit = () => {
    dragging.current = false;
    if (latest.current.before !== value.before || latest.current.after !== value.after) onChange(latest.current);
  };
  const cancel = () => { dragging.current = false; latest.current = value; setDraft(value); };
  return <fieldset className="context-picker" disabled={disabled}>
    <legend>{legend ?? text.context}</legend>
    <div className="context-sliders">{(['before', 'after'] as const).map(side => <div className="context-slider" key={side}>
      <div className="context-slider-heading"><label htmlFor={`${idPrefix}-${side}`}>{text[side]}</label><output aria-hidden="true">{draft[side]}</output></div>
      <input id={`${idPrefix}-${side}`} type="range" min="0" max={MAX_CONTEXT} step="1" value={draft[side]}
        onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture?.(event.pointerId); }}
        onPointerUp={commit} onPointerCancel={cancel} onLostPointerCapture={() => { if (dragging.current) cancel(); }}
        onChange={event => {
          const count = Number(event.target.value);
          if (!validContextCount(count)) return;
          latest.current = { ...latest.current, [side]: count }; setDraft(latest.current);
          if (!dragging.current) commit();
        }} />
      <div className="context-endpoints" aria-hidden="true"><span>0</span><span>{MAX_CONTEXT}</span></div>
    </div>)}</div>
  </fieldset>;
}
