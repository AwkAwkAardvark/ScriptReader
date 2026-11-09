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
export type Rotation = { tracks: Track[]; smoothTracks: Track[]; duration: number };

const epsilon = 1e-7;
const walkSpeed = 42;
const sideSpeed = walkSpeed * 0.5;

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

function walk(track: Track, point: Point, start: number, speed = walkSpeed) {
  const last = track.frames[track.frames.length - 1];
  append(track, last, start);
  const end = start + Math.hypot(point.x - last.x, point.y - last.y) / speed;
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

function settleArrivals(tracks: Track[], separation: number, duration: number): Track[] {
  // Keep the final leg on its original line and preserve its arrival time.
  // Validate the same linear segments that playback will actually draw.
  for (const strength of [1, 0.75, 0.5, 0.25]) {
    const settled = tracks.map(track => {
      const from = track.frames.at(-2);
      const to = track.frames.at(-1)!;
      if (!from || (from.x === to.x && from.y === to.y)) return track;
      const frames = track.frames.slice(0, -1);
      for (let step = 1; step < 16; step++) {
        const progress = step / 16;
        // Begin at the original speed, then ease toward zero at the destination.
        const distance = progress + strength * progress ** 2 * (1 - progress);
        frames.push({
          x: from.x + (to.x - from.x) * distance,
          y: from.y + (to.y - from.y) * distance,
          time: from.time + (to.time - from.time) * progress,
        });
      }
      frames.push(to);
      return { ...track, frames };
    });
    const clear = settled.every((track, index) => settled.slice(index + 1)
      .every(other => !findConflict(track, other, separation, duration)));
    if (clear) return settled;
  }
  return tracks;
}

function makeTracks(cue: Cue, gap: number): Rotation {
  const { stage } = cue;
  const tracks: Track[] = cue.performers.map(performer => ({
    performer,
    frames: [{ ...performer.start, time: 0 }],
  }));
  const standing = tracks.filter(t => !t.performer.side);
  if (standing.length === tracks.length || !standing.length) {
    throw new Error('A rotation needs both returning and advancing performers.');
  }

  const rowFront = Math.max(...tracks.map(t => t.performer.start.y));
  const rowBack = Math.min(...tracks.map(t => t.performer.end.y));
  const left = Math.min(...tracks.flatMap(t => [t.performer.start.x, t.performer.end.x]));
  const right = Math.max(...tracks.flatMap(t => [t.performer.start.x, t.performer.end.x]));
  const spacing = stage.square + gap;
  const rearApproach = rowBack - stage.rear;
  let frontClear = 0;
  let duration = 0;

  for (const side of ['A', 'B'] as const) {
    const sign = side === 'A' ? 1 : -1;
    const lane = side === 'A' ? stage.sideA : stage.sideB;
    const clearX = side === 'A' ? left - spacing : right + spacing;
    const group = tracks.filter(t => t.performer.side === side)
      .sort((a, b) => sign * (a.performer.start.x - b.performer.start.x));
    let previousTurn: number | undefined;

    for (const track of group) {
      const { performer } = track;
      const distance = sign * (performer.start.x - lane);
      if (performer.start.y !== rowFront || performer.end.y !== rowBack ||
          sign * (clearX - lane) < -epsilon || rearApproach < spacing - epsilon ||
          distance <= spacing) {
        throw new Error(`Route blocked for ${performer.label}. Check the side lane, rear lane, and row positions.`);
      }

      // Everyone starts together. A follower slows its first leg so it stays
      // one square plus clearance away until the leader is clear of the turn.
      let turn = distance / walkSpeed;
      if (previousTurn !== undefined) {
        const corner = (previousTurn + spacing / sideSpeed) / (1 - spacing / distance);
        turn = Math.max(turn, corner, previousTurn + rearApproach / walkSpeed);
      }
      append(track, { x: lane, y: rowFront }, turn);
      previousTurn = turn;

      frontClear = Math.max(frontClear, turn * (1 - sign * (clearX - lane) / distance));
      const upstage = walk(track, { x: lane, y: stage.rear }, turn, sideSpeed);
      const behind = walk(track, { x: performer.end.x, y: stage.rear }, upstage);
      duration = Math.max(duration, walk(track, performer.end, behind));
    }
  }

  const rowAdvanceTime = Math.max(...standing.map(({ performer: { start, end } }) =>
    Math.hypot(end.x - start.x, end.y - start.y))) / (walkSpeed * 0.65);
  const advanceEnd = frontClear + rowAdvanceTime;
  for (const track of standing) {
    append(track, track.performer.start, frontClear);
    append(track, track.performer.end, advanceEnd);
  }
  duration = Math.max(duration, advanceEnd);
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
  return { tracks, smoothTracks: settleArrivals(tracks, spacing, duration), duration };
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
