import { useEffect, useRef, useState } from 'react';
import type { Copy } from './i18n';

export type Context = { before: number; after: number };
export function ContextPicker({ value, onChange, disabled, text }: {
  value: Context; onChange: (counts: Context) => void; disabled: boolean; text: Copy;
}) {
  const [preset, setPreset] = useState('default');
  const [draft, setDraft] = useState({ before: String(value.before), after: String(value.after) });
  const customInput = useRef<HTMLInputElement>(null);
  const isValid = (text: string) => /^\d+$/.test(text) && Number(text) >= 0 && Number(text) <= 10;
  useEffect(() => { if (preset === 'other') customInput.current?.focus(); }, [preset]);
  return <fieldset className="context-picker" disabled={disabled}>
    <legend>{text.context}</legend>
    <div className="context-options">{['default', '1', '3', '5', 'other'].map(option => <label key={option} className={option === 'default' ? 'default-context' : undefined}>
      <input type="radio" name="context" value={option} checked={preset === option} onChange={() => {
        setPreset(option);
        if (option === 'other') setDraft({ before: String(value.before), after: String(value.after) });
        else onChange(option === 'default' ? { before: 2, after: 1 } : { before: Number(option), after: Number(option) });
      }} />
      <span>{option === 'default' ? `${text.before} 2 / ${text.after} 1` : option === 'other' ? text.other : `±${option}`}</span>
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

