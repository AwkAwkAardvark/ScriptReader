import { filterScript } from '../src/script';
import { buildReadingDocument, type ReadingEntry } from '../src/reading-document';
import { viewKey, type Counts, type PassageBundle, type Production, type View } from '../src/hosted/protocol';
import type { PublishedPayload } from './publishing';

/** Always filter the FULL revision. References preserve real source gaps and grouping. */
export function passageBundle(production: Production, payload: PublishedPayload, character: string, requested: Counts): PassageBundle {
  const selected = payload.script.characters.find(choice => choice.tag === character);
  if (!selected) throw new Error('Unknown character');
  const bundle: PassageBundle = { production, character: selected, entries: {}, views: {}, media: {} };
  const counts: Counts[] = [];
  for (let before = 0; before <= 3; before++) for (let after = 0; after <= 2; after++) {
    counts.push({ before, after, includeNonDialogue: requested.includeNonDialogue });
  }
  if (requested.before > 3 || requested.after > 2) counts.push(requested);
  for (const context of counts) {
    const filtered = filterScript(payload.script.records, { ...context, character });
    const document = buildReadingDocument(payload.script, filtered, character, { ...context, showKorean: true });
    const keep = (entry: ReadingEntry) => {
      bundle.entries[entry.no] = entry;
      if (payload.media[entry.no]) bundle.media[entry.no] = payload.media[entry.no];
      return entry.no;
    };
    const view: View = { context, sceneCount: document.sceneCount, contributionCount: document.contributionCount,
      blocks: document.blocks.map(block => block.kind === 'scene' ? { kind: 'scene', no: keep(block.entry) }
        : { kind: 'passage', passage: block.passage, entries: block.entries.map(keep) }) };
    bundle.views[viewKey(context)] = view;
  }
  return bundle;
}
