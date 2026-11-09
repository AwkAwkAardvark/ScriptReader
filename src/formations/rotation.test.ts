import { describe, expect, it } from 'vitest';
import { planRotation, positionAt, type Cue, type Performer } from './rotation';

const stage = {
  width: 132, height: 68, sideA: 9, sideB: 123, rear: 8,
  square: 8, clearance: 0.5, preferredGap: 2,
};
const performers: Performer[] = Array.from({ length: 4 }, (_, row) =>
  Array.from({ length: 8 }, (_, column): Performer => ({
    id: `r${row}c${column}`,
    label: `Marker ${row}-${column}`,
    color: '#f4bc82',
    start: { x: 24 + 12 * column, y: 58 - 12 * row },
    end: { x: 24 + 12 * column, y: row === 0 ? 22 : 70 - 12 * row },
    side: row === 0 ? (column < 6 ? 'A' : 'B') : undefined,
  })).filter((_, column) => row > 0 || column > 1)).flat();
const cue: Cue = { title: 'Practice rotation', stage, performers };

describe('formation rotation', () => {
  it('uses the side lanes and the rear approach, while advancing the other rows as the last return clears', () => {
    const { tracks, duration } = planRotation(cue);
    const frameEnd = (track: typeof tracks[number]) => track.frames[track.frames.length - 1].time;
    expect(tracks).toHaveLength(30);
    for (const track of tracks) {
      const { start, end, side } = track.performer;
      expect(positionAt(track, 0)).toEqual(start);
      expect(positionAt(track, duration)).toMatchObject(end);
      if (side) {
        const lane = side === 'A' ? stage.sideA : stage.sideB;
        expect(track.frames).toContainEqual(expect.objectContaining({ x: lane, y: start.y }));
        expect(track.frames.at(-2)).toMatchObject({ x: end.x, y: stage.rear });
      }
    }
    const byId = (id: string) => tracks.find(track => track.performer.id === id)!;
    const lastToLeave = byId('r0c5');
    const standing = byId('r1c0');
    const advanceStart = standing.frames[1].time;
    const lastTurn = lastToLeave.frames[1].time;
    expect(advanceStart).toBeLessThan(lastTurn);
    const clearX = positionAt(lastToLeave, advanceStart).x;
    expect(clearX).toBeGreaterThanOrEqual(24 - stage.square - stage.preferredGap - 0.001);
    expect(clearX).toBeLessThanOrEqual(24 - stage.square - stage.clearance + 0.001);

    const lead = byId('r0c2');
    const bLead = byId('r0c7');
    const follower = byId('r0c3');
    for (const track of tracks.filter(track => track.performer.side)) {
      expect(positionAt(track, 0.1)).not.toEqual(track.performer.start);
    }
    expect(positionAt(standing, (advanceStart + frameEnd(standing)) / 2).y)
      .toBeGreaterThan(standing.performer.start.y);
    const overlappingTime = (advanceStart + frameEnd(standing)) / 2;
    expect(positionAt(lastToLeave, overlappingTime)).not.toEqual(positionAt(lastToLeave, overlappingTime + 0.01));

    // When the follower crosses the leader's column, the leader is already in place.
    const rear = follower.frames.find(frame => frame.y === stage.rear)!;
    const approach = follower.frames.at(-2)!;
    const fraction = (lead.performer.end.x - rear.x) / (approach.x - rear.x);
    const passing = rear.time + fraction * (approach.time - rear.time);
    expect(passing).toBeGreaterThanOrEqual(frameEnd(lead));
    expect(positionAt(bLead, 0.1).x).toBeGreaterThan(bLead.performer.start.x);
  });

  it('slows each individual arrival while keeping its original slot and timing', () => {
    const { tracks, smoothTracks, duration } = planRotation(cue);
    for (const [index, track] of tracks.entries()) {
      const smooth = smoothTracks[index];
      const start = track.frames.at(-2)!;
      const end = track.frames.at(-1)!;
      const time = (fraction: number) => start.time + fraction * (end.time - start.time);
      const middle = positionAt(smooth, time(0.75));
      const late = positionAt(smooth, time(0.875));
      const beforeStop = Math.hypot(late.x - middle.x, late.y - middle.y);
      const finalStep = Math.hypot(end.x - late.x, end.y - late.y);

      expect(smooth.frames.at(-1)).toEqual(end);
      const approach = smooth.frames.find(frame => frame.x === start.x && frame.y === start.y)!;
      expect(approach).toBeDefined();
      if (track.performer.side && end.time < duration) {
        expect(end.time - approach.time).toBeGreaterThan((end.time - start.time) * 1.3);
      }
      expect(beforeStop).toBeGreaterThan(finalStep);
    }
  });

  it('falls back to hard clearance when the preferred spacing cannot fit', () => {
    expect(() => planRotation({ ...cue, stage: { ...stage, preferredGap: 14 } })).not.toThrow();
  });

  it('identifies the blocked performer if the side lane is too narrow', () => {
    expect(() => planRotation({ ...cue, stage: { ...stage, sideA: 17 } }))
      .toThrow(/Route blocked for Marker 0-2/);
  });

  it('rejects paths that cross between their otherwise clear endpoints', () => {
    const crossed = performers.map(performer => {
      if (performer.id === 'r1c0') return { ...performer, end: { x: 36, y: 58 } };
      if (performer.id === 'r1c1') return { ...performer, end: { x: 24, y: 58 } };
      return performer;
    });
    expect(() => planRotation({ ...cue, performers: crossed }))
      .toThrow(/Marker 1-0 and Marker 1-1.*clearance/);
  });
});
