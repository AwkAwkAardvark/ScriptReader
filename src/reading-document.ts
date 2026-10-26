import { attribution, type FilteredScript, type Script } from './script';

export type ReadingEntry = {
  no: number; scene: number; english: string; korean: string; speaker: string;
  kind: 'scene' | 'song' | 'dialogue' | 'cue'; highlighted: boolean; stageDirection: boolean;
};
export type ReadingBlock = { kind: 'scene'; entry: ReadingEntry } |
  { kind: 'passage'; passage: number; entries: ReadingEntry[] };
export type ReadingDocument = {
  character: { tag: string; label: string };
  context: { before: number; after: number; includeNonDialogue: boolean; showKorean: boolean };
  blocks: ReadingBlock[]; sceneCount: number; contributionCount: number;
};

/** Screen and output consume only selected records, with the same resolved identities/text. */
export function buildReadingDocument(script: Script, filtered: FilteredScript, character: string,
  context: ReadingDocument['context']): ReadingDocument {
  const selected = script.characters.find(choice => choice.tag === character);
  if (!selected) throw new Error('Select a known character before building a reading document.');
  const blocks: ReadingBlock[] = [];
  for (const { record, highlighted, passage } of filtered.items) {
    const entry: ReadingEntry = {
      no: record.no, scene: record.scene, english: record.source.English,
      korean: context.showKorean ? record.source.Korean : '', speaker: attribution(record, script),
      kind: record.types.includes('Title') ? 'scene' : record.types.includes('Song') ? 'song' : record.types.includes('Line') ? 'dialogue' : 'cue',
      highlighted, stageDirection: record.types.includes('StageDirection'),
    };
    if (entry.kind === 'scene') blocks.push({ kind: 'scene', entry });
    else {
      const last = blocks.at(-1);
      if (last?.kind === 'passage' && passage !== null && last.passage === passage) last.entries.push(entry);
      else blocks.push({ kind: 'passage', passage: passage ?? -record.no, entries: [entry] });
    }
  }
  return { character: { ...selected }, context: { ...context }, blocks,
    sceneCount: new Set(filtered.items.map(item => item.record.scene)).size,
    contributionCount: filtered.items.filter(item => item.highlighted && item.record.types.includes('Line')).length };
}
