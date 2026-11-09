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

  it('eases every departure and arrival while keeping the original slot and timing', () => {
    const { tracks, smoothTracks } = planRotation(cue);
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
      if (track.performer.side) {
        expect(end.time - approach.time).toBeGreaterThan(end.time - start.time);
      }
      const firstMove = track.frames.findIndex((frame, index) => index > 0 &&
        (frame.x !== track.frames[index - 1].x || frame.y !== track.frames[index - 1].y));
      const departure = track.frames[firstMove - 1];
      const step = Math.min(0.8, track.frames[firstMove].time - departure.time) / 5;
      const first = positionAt(smooth, departure.time + step);
      const second = positionAt(smooth, departure.time + 2 * step);
      expect(Math.hypot(second.x - first.x, second.y - first.y))
        .toBeGreaterThan(Math.hypot(first.x - departure.x, first.y - departure.y));
      expect(beforeStop).toBeGreaterThan(finalStep);
    }
  });

  it('uses the same cruise speed around the side and across the rear when clearance allows', () => {
    const centered = performers.map(performer => performer.side ? {
      ...performer,
      start: { ...performer.start, x: performer.start.x - 12 },
      end: { ...performer.end, x: performer.end.x - 12 },
    } : performer);
    const { tracks } = planRotation({ ...cue, performers: centered });
    const speed = (from: typeof tracks[number]['frames'][number], to: typeof from) =>
      Math.hypot(to.x - from.x, to.y - from.y) / (to.time - from.time);
    for (const { frames: [, turn, rear, slot, end] } of tracks.filter(track => track.performer.side)) {
      expect(speed(turn, rear)).toBeCloseTo(speed(rear, slot));
      expect(speed(rear, slot)).toBeCloseTo(speed(slot, end));
    }
  });

  it('leaves fixed performers in place and aligns an advancing performer before passing the held center', () => {
    const marker = (id: string, start: Performer['start'], end: Performer['end'], side?: Performer['side']): Performer =>
      ({ id, label: id, color: '#112233', start, end, side });
    const partial = {
      title: 'Partial rotation',
      stage: { ...stage, height: 106, rear: 12 },
      performers: [
        marker('return', { x: 24, y: 94 }, { x: 24, y: 48 }, 'A'),
        marker('advance', { x: 24, y: 71 }, { x: 24, y: 94 }),
        marker('center', { x: 72, y: 94 }, { x: 72, y: 94 }),
        marker('align', { x: 72, y: 71 }, { x: 84, y: 94 }),
        marker('back', { x: 72, y: 25 }, { x: 72, y: 25 }),
      ],
    };
    expect(() => planRotation(partial)).toThrow(/center and align/);
    const { tracks, approachY, duration } = planRotation({ ...partial, advance: 'align-early' });
    expect(approachY).toBeGreaterThan(25);
    expect(approachY).toBeLessThan(48);
    for (const track of tracks) {
      expect(positionAt(track, duration)).toMatchObject(track.performer.end);
      if (track.performer.id === 'center' || track.performer.id === 'back') {
        expect(track.frames).toHaveLength(1);
      }
      if (track.performer.id === 'return') {
        expect(track.frames.at(-2)).toMatchObject({ x: 24, y: approachY });
      }
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
