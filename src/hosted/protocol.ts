import type { Character } from '../script';
import type { ReadingBlock, ReadingDocument, ReadingEntry } from '../reading-document';

export type Counts = { before: number; after: number; includeNonDialogue: boolean };
export const viewKey = (counts: Counts) => `${counts.before}:${counts.after}:${Number(counts.includeNonDialogue)}`;
export type Production = { slug: string; title: string; revision: string; defaults?: { before: number; after: number }; characters: Character[]; used: number; resetAt: string };
type BlockReferences = { kind: 'scene'; no: number } | { kind: 'passage'; passage: number; entries: number[] };
export type View = { context: Counts; blocks: BlockReferences[]; sceneCount: number; contributionCount: number };
export type PassageBundle = {
  production: Production; character: Character; entries: Record<string, ReadingEntry>;
  views: Record<string, View>; media: Record<string, string>;
};
export type ApiCode = 'not_found' | 'invalid_request' | 'quota' | 'rate' | 'revision_changed' | 'unavailable';
export type ApiProblem = { error: ApiCode; resetAt?: string; retryAfter?: number };
export function unpackView(bundle: PassageBundle, counts: Counts, showKorean: boolean): ReadingDocument | null {
  const view = bundle.views[viewKey(counts)];
  if (!view) return null;
  const entry = (no: number): ReadingEntry => ({ ...bundle.entries[no], korean: showKorean ? bundle.entries[no].korean : '' });
  const blocks: ReadingBlock[] = view.blocks.map(block => block.kind === 'scene'
    ? { kind: 'scene', entry: entry(block.no) }
    : { kind: 'passage', passage: block.passage, entries: block.entries.map(entry) });
  return { character: bundle.character, context: { ...counts, showKorean }, blocks,
    sceneCount: view.sceneCount, contributionCount: view.contributionCount };
}
