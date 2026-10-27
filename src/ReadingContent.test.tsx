import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ReadingContent } from './ReadingContent';
import type { ReadingDocument, ReadingEntry } from './reading-document';
import { copy } from './i18n';

it('formats only dialogue, preserves literal text, and shares markup for screen and print', () => {
  const english='Come (quietly (toward me)) [now] (unfinished';
  const entries:ReadingEntry[]=[
    {no:2,scene:1,english,korean:'와요 (작게 (속삭이며))',speaker:'Rowan',kind:'dialogue',highlighted:true,stageDirection:false},
    {no:3,scene:1,english:'(An existing stage direction.)',korean:'',speaker:'',kind:'cue',highlighted:false,stageDirection:true},
    {no:4,scene:1,english:'A song (reprise)',korean:'',speaker:'',kind:'song',highlighted:false,stageDirection:false},
  ];
  const document:ReadingDocument={character:{tag:'Ro',label:'Rowan'},context:{before:2,after:1,includeNonDialogue:false,showKorean:true},blocks:[{kind:'passage',passage:1,entries}],sceneCount:1,contributionCount:1};
  const {container}=render(<ReadingContent document={document} text={copy.en}/>);
  const paragraph=container.querySelector('[data-record="2"] [lang="en"]')!;
  expect(paragraph.textContent).toBe(english);
  expect(paragraph.querySelectorAll('em')).toHaveLength(1);
  expect(paragraph.querySelector('em')?.textContent).toBe('(quietly (toward me))');
  expect(container.querySelector('[lang="ko"] em')?.textContent).toBe('(작게 (속삭이며))');
  expect(container.querySelector('[data-record="3"] em')).toBeNull();
  expect(container.querySelector('[data-record="4"] em')).toBeNull();
});
