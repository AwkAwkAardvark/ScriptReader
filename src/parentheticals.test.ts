import { describe, expect, it } from 'vitest';
import { parentheticalRuns } from './parentheticals';

describe('dialogue parentheticals', () => {
  it.each([
    ['Follow me. (quietly)', ['(quietly)']],
    ['(points (toward the gate)) Follow me.', ['(points (toward the gate))']],
    ['(one)(two) then (three)', ['(one)', '(two)', '(three)']],
    ['Look (toward\nthe gate) now.', ['(toward\nthe gate)']],
    ['문 (조용히 (가리키며)) 열어요.', ['(조용히 (가리키며))']],
    ['No direction [ordinary text].', []],
    ['Close ) then (quietly) and (unfinished', ['(quietly)']],
    ['An (unfinished (inner) direction', []],
    ['', []],
  ])('preserves source and formats only complete outer spans: %s', (source, italic) => {
    const runs=parentheticalRuns(source);
    expect(runs.map(run=>run.text).join('')).toBe(source);
    expect(runs.filter(run=>run.italic).map(run=>run.text)).toEqual(italic);
  });
  it('handles deeply nested and unmatched input without recursion', () => {
    const source='('.repeat(20000)+'a'+')'.repeat(20000);
    expect(parentheticalRuns(source)).toEqual([{text:source,italic:true}]);
    expect(parentheticalRuns('('.repeat(20000))).toEqual([{text:'('.repeat(20000),italic:false}]);
  });
});
