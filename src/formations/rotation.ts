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

function easeSpan(track: Track, start: number, end: number, distanceAt: (progress: number) => number): Track {
  if (end <= start) return track;
  const span = end - start;
  const frames = track.frames.filter(frame => frame.time < start || frame.time > end);
  frames.push({ ...positionAt(track, start), time: start });
  for (let step = 1; step < 32; step++) {
    const progress = step / 32;
    frames.push({ ...positionAt(track, start + distanceAt(progress) * span), time: start + progress * span });
  }
  frames.push({ ...positionAt(track, end), time: end });
  // Keep any original corner exactly on the path after retiming. Clearance
  // is checked continuously over the same linear segments used for playback.
  for (const corner of track.frames.filter(frame => frame.time > start && frame.time < end)) {
    const distance = (corner.time - start) / span;
    let low = 0;
    let high = 1;
    for (let step = 0; step < 36; step++) {
      const mid = (low + high) / 2;
      if (distanceAt(mid) < distance) low = mid;
      else high = mid;
    }
    frames.push({ ...corner, time: start + (low + high) / 2 * span });
  }
  frames.sort((a, b) => a.time - b.time);
  return { ...track, frames };
}

function easePerformers(tracks: Track[], separation: number, duration: number): Track[] {
  const leaderArrival = new Map<string, number>();
  for (const side of ['A', 'B'] as const) {
    const sign = side === 'A' ? 1 : -1;
    const group = tracks.filter(track => track.performer.side === side)
      .sort((a, b) => sign * (a.performer.start.x - b.performer.start.x));
    for (let i = 1; i < group.length; i++) {
      leaderArrival.set(group[i].performer.id, group[i - 1].frames.at(-1)!.time);
    }
  }
  const accelerate = (progress: number) => progress ** 4 * (4 - 3 * progress);
  for (const strength of [1, 0.75, 0.5, 0.25]) {
    const blend = (progress: number, eased: number) => progress + strength * (eased - progress);
    const easedTracks = tracks.map(track => {
      const { frames, performer } = track;
      const firstMove = frames.findIndex((frame, index) => index > 0 &&
        (frame.x !== frames[index - 1].x || frame.y !== frames[index - 1].y));
      if (firstMove < 0) return track;
      const departure = frames[firstMove - 1].time;
      const arrival = frames.at(-1)!.time;

      // For a single advancing row step, ease both ends of the same movement.
      if (!performer.side) {
        return easeSpan(track, departure, arrival,
          progress => blend(progress, progress ** 2 * (3 - 2 * progress)));
      }

      // Give every return the same rules. Keep its original timing until the
      // preceding performer has settled, so followers still pass behind them.
      const approach = Math.max(frames.at(-3)!.time, arrival - 1.6, leaderArrival.get(performer.id) ?? 0);
      const launchEnd = Math.min(departure + 0.55, frames[firstMove].time, approach);
      const launched = easeSpan(track, departure, launchEnd, progress => blend(progress, accelerate(progress)));
      return easeSpan(launched, approach, arrival, progress => blend(progress, 1 - accelerate(1 - progress)));
    });
    const clear = easedTracks.every((track, index) => easedTracks.slice(index + 1)
      .every(other => !findConflict(track, other, separation, duration)));
    if (clear) return easedTracks;
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
  return { tracks, smoothTracks: easePerformers(tracks, spacing, duration), duration };
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
