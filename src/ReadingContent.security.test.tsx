import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ReadingContent } from './ReadingContent';
import { copy } from './i18n';

it('treats source markup and speaker labels as text, without creating executable elements', () => {
  const attack = '(<img src=x onerror="window.compromised=true">)';
  const speaker = '<svg onload="window.compromised=true">';
  const { container } = render(<ReadingContent text={copy.en} document={{character:{tag:'Ro',label:speaker},context:{before:2,after:1,includeNonDialogue:false,showKorean:true},sceneCount:1,contributionCount:1,blocks:[{kind:'passage',passage:1,entries:[{no:2,scene:1,english:attack,korean:'(<script>window.compromised=true</script>)',speaker,kind:'dialogue',highlighted:true,stageDirection:false}]}]}} />);
  expect(screen.getByText(attack)).toBeInTheDocument();
  expect(screen.getByText(speaker)).toBeInTheDocument();
  expect(container.querySelector('img, svg, script')).toBeNull();
});
