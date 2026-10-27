import { Fragment } from 'react';
import type { Character } from './script';

/** Separators are presentation metadata, never character identities. */
export function CharacterOptions({ characters }: { characters: readonly Character[] }) {
  const names = new Map<string, number>();
  for (const { label } of characters) names.set(label, (names.get(label) ?? 0) + 1);
  return characters.map((choice, index) => <Fragment key={choice.tag}>
    {index > 0 && choice.dividerBefore && <option value="" disabled className="character-divider">────────</option>}
    <option value={choice.tag}>{choice.label}{(names.get(choice.label) ?? 0) > 1 ? ` (${choice.tag})` : ''}</option>
  </Fragment>);
}
