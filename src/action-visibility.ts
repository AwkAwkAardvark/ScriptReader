import type { ReadingBlock, ReadingDocument } from './reading-document';

/** Hide standalone cues after context selection; preserve source-based grouping and inline directions. */
export function applyActionVisibility(document: ReadingDocument, hide: boolean): ReadingDocument {
  if (!hide) return document;
  const blocks: ReadingBlock[] = [];
  for (const block of document.blocks) {
    if (block.kind === 'scene') blocks.push(block);
    else {
      const entries = block.entries.filter(entry => entry.kind !== 'cue');
      if (entries.length) blocks.push({ ...block, entries });
    }
  }
  return { ...document, blocks };
}
