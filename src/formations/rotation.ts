export type Point = { x: number; y: number };
type Side = 'A' | 'B';
export type Performer = {
  id: string;
  label: string;
  color: string;
  start: Point;
  end: Point;
  side?: Side;
};
export type Cue = {
  title: string;
  performers: Performer[];
  stage: {
    width: number;
    height: number;
    sideA: number;
    sideB: number;
    rear: number;
    square: number;
    clearance: number;
    preferredGap: number;
  };
};
export type Keyframe = Point & { time: number };
export type Track = { performer: Performer; frames: Keyframe[] };
export type Rotation = { tracks: Track[]; duration: number };

const epsilon = 1e-7;
const walkSpeed = 58;
const rowAdvanceTime = 1.0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readPoint(value: unknown): Point {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y)) {
    throw new Error('Each performer needs a valid starting and ending position.');
  }
  return { x: value.x, y: value.y };
}

export function readCue(value: unknown): Cue {
  if (!isRecord(value) || typeof value.title !== 'string' || !value.title.trim() ||
      !Array.isArray(value.performers) || value.performers.length === 0 ||
      !isRecord(value.stage)) {
    throw new Error('Choose a formation file with a title, stage, and performers.');
  }
  const { width, height, sideA, sideB, rear, square, clearance, preferredGap } = value.stage;
  if (!finite(width) || !finite(height) || !finite(sideA) || !finite(sideB) ||
      !finite(rear) || !finite(square) || !finite(clearance) || !finite(preferredGap) ||
      width <= 0 || height <= 0 || square <= 0 || clearance <= 0 || preferredGap < clearance ||
      sideA >= sideB) {
    throw new Error('The formation file has invalid stage or clearance settings.');
  }
  const performers = value.performers.map((entry: unknown): Performer => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim() ||
        typeof entry.label !== 'string' || !entry.label.trim() ||
        typeof entry.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(entry.color) ||
        (entry.side !== undefined && entry.side !== 'A' && entry.side !== 'B')) {
      throw new Error('Each performer needs a label, unique ID, and color, with A or B for a return.');
    }
    return {
      id: entry.id,
      label: entry.label,
      color: entry.color,
      start: readPoint(entry.start),
      end: readPoint(entry.end),
      side: entry.side,
    };
  });
  if (new Set(performers.map(p => p.id)).size !== performers.length) {
    throw new Error('Each performer ID must be unique.');
  }
  return { title: value.title, performers, stage: { width, height, sideA, sideB, rear, square, clearance, preferredGap } };
}

export function positionAt(track: Track, time: number): Point {
  const { frames } = track;
  for (let index = 1; index < frames.length; index++) {
    const to = frames[index];
    if (time > to.time) continue;
    const from = frames[index - 1];
    const fraction = Math.max(0, (time - from.time) / (to.time - from.time));
    return { x: from.x + fraction * (to.x - from.x), y: from.y + fraction * (to.y - from.y) };
  }
  return frames[frames.length - 1];
}

function append(track: Track, point: Point, time: number) {
  const last = track.frames[track.frames.length - 1];
  if (time > last.time) track.frames.push({ x: point.x, y: point.y, time });
}

function walk(track: Track, point: Point, start: number) {
  const last = track.frames[track.frames.length - 1];
  append(track, last, start);
  const end = start + Math.hypot(point.x - last.x, point.y - last.y) / walkSpeed;
  append(track, point, end);
  return end;
}

// Return the open interval over which one axis has less than the required clearance.
function conflictInterval(from: number, to: number, separation: number): [number, number] {
  const delta = to - from;
  if (Math.abs(delta) < epsilon) {
    return Math.abs(from) < separation ? [0, 1] : [1, 0];
  }
  const a = (-separation - from) / delta;
  const b = (separation - from) / delta;
  return [Math.min(a, b), Math.max(a, b)];
}

function findConflict(first: Track, second: Track, separation: number, duration: number) {
  const times = [...new Set([0, duration, ...first.frames.map(f => f.time), ...second.frames.map(f => f.time)])]
    .sort((a, b) => a - b);
  separation -= epsilon;
  for (let index = 0; index < times.length; index++) {
    const start = times[index];
    const end = times[index + 1] ?? start;
    const a = positionAt(first, start);
    const b = positionAt(second, start);
    const c = positionAt(first, end);
    const d = positionAt(second, end);
    const x = conflictInterval(a.x - b.x, c.x - d.x, separation);
    const y = conflictInterval(a.y - b.y, c.y - d.y, separation);
    if (Math.max(0, x[0], y[0]) < Math.min(1, x[1], y[1])) return true;
  }
  return false;
}

function makeTracks(cue: Cue, gap: number): Rotation {
  const { stage } = cue;
  const tracks: Track[] = cue.performers.map(performer => ({
    performer,
    frames: [{ ...performer.start, time: 0 }],
  }));
  const sideA = tracks.filter(t => t.performer.side === 'A')
    .sort((a, b) => a.performer.start.x - b.performer.start.x);
  const sideB = tracks.filter(t => t.performer.side === 'B')
    .sort((a, b) => b.performer.start.x - a.performer.start.x);
  const returns = Array.from({ length: Math.max(sideA.length, sideB.length) },
    (_, index) => [sideA[index], sideB[index]].filter(Boolean).map(track => ({ track, index }))).flat();
  const standing = tracks.filter(t => !t.performer.side);
  if (!returns.length || !standing.length) throw new Error('A rotation needs both returning and advancing performers.');

  const rowFront = Math.max(...tracks.map(t => t.performer.start.y));
  const rowBack = Math.min(...tracks.map(t => t.performer.end.y));
  const left = Math.min(...tracks.flatMap(t => [t.performer.start.x, t.performer.end.x]));
  const right = Math.max(...tracks.flatMap(t => [t.performer.start.x, t.performer.end.x]));
  const spacing = stage.square + gap;
  let time = 0;
  let advanceEnd = 0;
  for (const [order, { track, index }] of returns.entries()) {
    const { performer } = track;
    const x = performer.side === 'A' ? stage.sideA : stage.sideB;
    const y = stage.rear + (index + 1) * spacing;
    const sideClearance = performer.side === 'A' ? left - x : x - right;
    if (performer.start.y !== rowFront || performer.end.y !== rowBack ||
        sideClearance < spacing - epsilon || rowBack - stage.rear < spacing - epsilon ||
        y > rowFront) {
      throw new Error(`Route blocked for ${performer.label}. Check the side lane, rear lane, and row positions.`);
    }
    const clear = walk(track, { x, y: rowFront }, time);
    if (order === returns.length - 1) {
      advanceEnd = clear + rowAdvanceTime;
      for (const rowTrack of standing) {
        append(rowTrack, rowTrack.performer.start, clear);
        append(rowTrack, rowTrack.performer.end, advanceEnd);
      }
    }
    time = walk(track, { x, y }, clear);
  }

  for (const { track } of returns) {
    const { end, side } = track.performer;
    time = walk(track, { x: side === 'A' ? stage.sideA : stage.sideB, y: stage.rear }, time);
    time = walk(track, { x: end.x, y: stage.rear }, time);
    time = walk(track, end, Math.max(time, advanceEnd));
  }

  const duration = Math.max(time, advanceEnd);
  const radius = stage.square / 2;
  tracks.forEach((track, index) => {
    if (track.frames.some(({ x, y }) => x < radius || x > stage.width - radius ||
        y < radius || y > stage.height - radius)) {
      throw new Error(`Route blocked for ${track.performer.label}. Their square would leave the walking area.`);
    }
    for (const other of tracks.slice(index + 1)) {
      if (findConflict(track, other, spacing, duration)) {
        throw new Error(`Route blocked for ${track.performer.label} and ${other.performer.label}. Their paths need more clearance.`);
      }
    }
  });
  return { tracks, duration };
}

export function planRotation(cue: Cue): Rotation {
  if (cue.stage.preferredGap > cue.stage.clearance) {
    try {
      return makeTracks(cue, cue.stage.preferredGap);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('Route blocked')) throw error;
      // A tighter path may still satisfy the required minimum.
    }
  }
  return makeTracks(cue, cue.stage.clearance);
}
