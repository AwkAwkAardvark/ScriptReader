import { planRotation, readCue, type Cue, type Rotation } from './rotation';

export type PreparedCue = {
  cue: Cue;
  rotation: Rotation;
  note?: string;
  from?: string;
  to?: string;
};
export type Rehearsal = { title: string; cues: PreparedCue[]; endNote?: string };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function prepareRehearsal(value: unknown): Rehearsal {
  if (!record(value) || !('moves' in value)) {
    const cue = readCue(value);
    return { title: cue.title, cues: [{ cue, rotation: planRotation(cue) }] };
  }

  const { title, performers, formations, moves, stage, endNote } = value;
  if (typeof title !== 'string' || !title.trim() || !Array.isArray(performers) ||
      !Array.isArray(formations) || !Array.isArray(moves) || !moves.length ||
      formations.length !== moves.length + 1 || (endNote !== undefined && typeof endNote !== 'string')) {
    throw new Error('A sequence needs a title, performers, and one more formation than movement cues.');
  }
  const roster = performers.map((person: unknown) => {
    if (!record(person) || typeof person.id !== 'string') throw new Error('Each performer needs an ID.');
    return { id: person.id, label: person.label, color: person.color };
  });
  const snapshots = formations.map((formation: unknown) => {
    if (!record(formation) || typeof formation.label !== 'string' || !record(formation.positions)) {
      throw new Error('Each formation needs a label and positions.');
    }
    return { label: formation.label, positions: formation.positions };
  });

  const cues = moves.map((move: unknown, index): PreparedCue => {
    if (!record(move) || typeof move.label !== 'string' ||
        (move.note !== undefined && typeof move.note !== 'string') || !record(move.returns)) {
      throw new Error(`Movement cue ${index + 1} needs a label and return sides.`);
    }
    const returns = move.returns;
    if (Object.keys(returns).some(id => !roster.some(person => person.id === id))) {
      throw new Error(`${move.label}: a return side refers to an unknown performer.`);
    }
    const from = snapshots[index];
    const to = snapshots[index + 1];
    try {
      const cue = readCue({
        title: move.label,
        stage,
        advance: move.advance,
        performers: roster.map(person => ({
          ...person,
          start: from.positions[person.id],
          end: to.positions[person.id],
          side: Object.hasOwn(returns, person.id) ? returns[person.id] : undefined,
        })),
      });
      return { cue, rotation: planRotation(cue), note: move.note, from: from.label, to: to.label };
    } catch (error) {
      throw new Error(`${move.label}: ${error instanceof Error ? error.message : 'Could not prepare movement.'}`);
    }
  });
  return { title, cues, endNote };
}
