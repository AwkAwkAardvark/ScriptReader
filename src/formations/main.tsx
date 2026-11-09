import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { positionAt } from './rotation';
import { prepareRehearsal, type Rehearsal } from './rehearsal';
import './stage.css';

type Direction = -1 | 0 | 1;

function Formations() {
  const [rehearsal, setRehearsal] = useState<Rehearsal | null>(null);
  const [cueIndex, setCueIndex] = useState(0);
  const [error, setError] = useState('');
  const [time, setTime] = useState(0);
  const [direction, setDirection] = useState<Direction>(0);
  const [slow, setSlow] = useState(false);
  const [smooth, setSmooth] = useState(true);
  const [selected, setSelected] = useState('');
  const clock = useRef(0);
  const fileRequest = useRef(0);
  const loaded = rehearsal?.cues[cueIndex];
  const duration = loaded?.rotation.duration ?? 0;
  const cueCount = rehearsal?.cues.length ?? 0;
  const isSequence = cueCount > 1;

  const seek = useCallback((next: number) => {
    clock.current = next;
    setTime(next);
  }, []);

  const play = useCallback((next: -1 | 1) => {
    if (!duration) return;
    const atEdge = next === 1 ? clock.current >= duration : clock.current <= 0;
    if (atEdge && isSequence) {
      const neighbor = rehearsal?.cues[cueIndex + next];
      if (!neighbor) return;
      setCueIndex(cueIndex + next);
      seek(next === 1 ? 0 : neighbor.rotation.duration);
    } else if (atEdge) {
      seek(next === 1 ? 0 : duration);
    }
    setDirection(next);
  }, [cueIndex, duration, isSequence, rehearsal, seek]);

  function selectMotion(next: boolean) {
    if (next === smooth) return;
    if (clock.current > 0 && clock.current < duration) seek(direction === -1 ? duration : 0);
    setSmooth(next);
  }

  async function load(file: File) {
    const request = ++fileRequest.current;
    setRehearsal(null);
    setCueIndex(0);
    setDirection(0);
    seek(0);
    setSelected('');
    setError('');
    try {
      const next = prepareRehearsal(JSON.parse(await file.text()));
      if (request === fileRequest.current) setRehearsal(next);
    } catch (failure) {
      if (request === fileRequest.current) {
        setError(failure instanceof SyntaxError ? 'This file is not a valid formation JSON file.' :
          failure instanceof Error ? failure.message : 'Could not open this formation file.');
      }
    }
  }

  useEffect(() => {
    if (!direction || !duration) return;
    let frame = 0;
    let previous: number | undefined;
    function advance(now: number) {
      const elapsed = (now - (previous ?? now)) / 1000;
      const step = elapsed * direction * (slow ? 0.5 : 1);
      const next = Math.max(0, Math.min(duration, clock.current + step));
      previous = now;
      if (elapsed > 0) seek(next);
      if (next === (direction === 1 ? duration : 0)) setDirection(0);
      else frame = requestAnimationFrame(advance);
    }
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [direction, duration, seek, slow]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!duration || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
          (event.target instanceof HTMLElement && event.target.closest('input:not([type="file"]):not([type="checkbox"]), select, textarea, [contenteditable]'))) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      if (!event.repeat) play(event.key === 'ArrowLeft' ? -1 : 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration, play]);

  const tracks = smooth ? loaded?.rotation.smoothTracks : loaded?.rotation.tracks;
  const focusedTrack = tracks?.find(track => track.performer.id === selected);
  const stage = loaded?.cue.stage;
  const atStart = time <= 0;
  const atEnd = time >= duration;
  const atFinalFormation = isSequence && cueIndex === cueCount - 1 && atEnd;

  return <main>
    <header className="page-header">
      <div>
        <p className="eyebrow">Formation rehearsal · Local prototype</p>
        <h1>{rehearsal?.title ?? 'Open a formation'}</h1>
      </div>
      <label className="file-picker">
        Open formation file
        <input type="file" accept=".json,application/json" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void load(file);
        }} />
      </label>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    {!loaded && !error && <p className="empty">Choose a local formation JSON file to rehearse a rotation or a sequence of cues.</p>}
    {rehearsal && loaded && stage && tracks && <>
      {isSequence && <div className="cue-panel">
        <div>
          <label htmlFor="formation-cue">Cue</label>{' '}
          <select id="formation-cue" value={cueIndex} onChange={event => {
            setDirection(0);
            setCueIndex(Number(event.currentTarget.value));
            seek(0);
          }}>
            {rehearsal.cues.map(({ cue }, index) => <option key={index} value={index}>{cue.title}</option>)}
          </select>
        </div>
        <span>{loaded.from} → {loaded.to}</span>
        <p>{atFinalFormation ? rehearsal.endNote : loaded.note}</p>
      </div>}
      <div className="stage-shell">
        <div className="stage-labels">
          <span>A · Stage right</span><span>Upstage</span><span>B · Stage left</span>
        </div>
        <svg className="stage" viewBox={`0 0 ${stage.width} ${stage.height}`} role="img"
          aria-label={`Stage formation for ${loaded.cue.title}`}>
          <rect x="0.5" y="0.5" width={stage.width - 1} height={stage.height - 1} rx="2" className="stage-border" />
          <path d={`M ${stage.sideA} ${stage.height - stage.square / 2} V ${loaded.rotation.approachY} H ${stage.sideB} V ${stage.height - stage.square / 2}`}
            className="lanes" />
          {focusedTrack && <polyline className="trace"
            points={focusedTrack.frames.map(({ x, y }) => `${x},${y}`).join(' ')} />}
          {[...tracks].sort((a, b) => Number(a === focusedTrack) - Number(b === focusedTrack)).map(track => {
            const { performer } = track;
            const { x, y } = positionAt(track, time);
            const size = stage.square;
            const words = performer.label.split(/\s+/);
            const lines = words.length === 1 ? words : [words.slice(0, -1).join(' '), words.at(-1)!];
            return <g key={performer.id} transform={`translate(${x} ${y})`}
              className={focusedTrack === track ? 'marker selected' : focusedTrack ? 'marker dimmed' : 'marker'}
              data-performer={performer.id} onClick={() => setSelected(selected === performer.id ? '' : performer.id)}>
              <title>{performer.label}</title>
              <rect x={-size / 2} y={-size / 2} width={size} height={size} rx={0.7} fill={performer.color} />
              {lines.map((line, index) => <text key={index} x="0" y={(index - (lines.length - 1) / 2) * 1.65}
                fontSize={Math.min(1.5, (size - 0.75) / (line.length * 0.61))}>{line}</text>)}
            </g>;
          })}
        </svg>
        <div className="audience">Audience · Front of stage</div>
      </div>
      <section aria-label="Playback controls" className="controls">
        <div className="buttons">
          <button onClick={() => play(-1)} disabled={isSequence && atStart && cueIndex === 0}>
            {isSequence && atStart && cueIndex > 0 ? '← Previous cue' : '← Rewind'}
          </button>
          <button onClick={() => play(1)} disabled={atFinalFormation}>
            {atFinalFormation ? 'End of sequence' : isSequence && atEnd ? 'Next cue →' : 'Play →'}
          </button>
          <button onClick={() => setDirection(0)} disabled={!direction}>Pause</button>
          <button onClick={() => { seek(0); setDirection(1); }}>Replay</button>
        </div>
        <div className="options">
          <label><input type="checkbox" checked={slow} onChange={event => setSlow(event.currentTarget.checked)} /> Half speed</label>
          <div className="motion-options" role="group" aria-label="Playback motion" aria-describedby="motion-hint">
            <button type="button" aria-pressed={smooth} onClick={() => selectMotion(true)}>Smooth</button>
            <button type="button" aria-pressed={!smooth} onClick={() => selectMotion(false)}>Steady</button>
          </div>
          <label>Highlight <select value={selected} onChange={event => setSelected(event.currentTarget.value)}>
            <option value="">All performers</option>
            {loaded.cue.performers.map(performer => <option key={performer.id} value={performer.id}>{performer.label}</option>)}
          </select></label>
        </div>
        <small id="motion-hint" className="motion-hint">Switching motion modes restarts a cue in progress.</small>
        <div className="timeline">
          <label htmlFor="position">Position</label>
          <input id="position" type="range" min={0} max={duration} step="any" value={time}
            onChange={event => { setDirection(0); seek(event.currentTarget.valueAsNumber); }} />
          <span>{time.toFixed(1)} / {duration.toFixed(1)} s</span>
        </div>
      </section>
    </>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Formations />);
