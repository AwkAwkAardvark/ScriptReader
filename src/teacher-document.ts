import { assignmentMatches, type Assignment, type ViewerSelection } from './assignments';
import { attribution, filterScript, type Script } from './script';
import { buildReadingDocument, type ReadingBlock, type ReadingEntry } from './reading-document';
import { applyActionVisibility } from './action-visibility';
import type { Context } from './context';

/** Full script in source order; staff selection changes emphasis, never membership. */
export function buildTeacherDocument(script: Script, assignments: Assignment[], selection: ViewerSelection, showKorean: boolean) {
  const selectedTags = new Set(assignments.filter(a => assignmentMatches(a, selection)).map(a => a.tag));
  const blocks: ReadingBlock[] = [];
  let passage = 0;
  for (const record of script.records) {
    const entry: ReadingEntry = {
      no: record.no, scene: record.scene, english: record.source.English, korean: showKorean ? record.source.Korean : '',
      speaker: attribution(record, script), tags: record.tags,
      kind: record.types.includes('Title') ? 'scene' : record.types.includes('Song') ? 'song' : record.types.includes('Line') ? 'dialogue' : 'cue',
      highlighted: record.tags.some(tag => selectedTags.has(tag)), stageDirection: record.types.includes('StageDirection'),
    };
    if (entry.kind === 'scene') { blocks.push({ kind: 'scene', entry }); passage++; }
    else {
      const last = blocks.at(-1);
      if (last?.kind === 'passage' && last.passage === passage) last.entries.push(entry);
      else blocks.push({ kind: 'passage', passage, entries: [entry] });
    }
  }
  return { blocks };
}

/** Role focus shares the student passage pipeline; rehearsal selection never filters rows. */
export function buildFocusedTeacherDocument(script: Script, character: string, context: Context, showKorean: boolean, hideActions: boolean) {
  const includeNonDialogue = !hideActions;
  const filtered = filterScript(script.records, { character, ...context, includeNonDialogue });
  return applyActionVisibility(buildReadingDocument(script, filtered, character, { ...context, includeNonDialogue, showKorean }), hideActions);
}
