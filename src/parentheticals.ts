export type TextRun = { text: string; italic: boolean };

/** Format balanced outer parentheses; malformed tails remain literal, readable text. */
export function parentheticalRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let depth = 0;
  let start = 0;
  let plainStart = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === ')' && depth > 0) {
      depth--;
      if (depth === 0) {
        if (start > plainStart) runs.push({ text: text.slice(plainStart, start), italic: false });
        runs.push({ text: text.slice(start, i + 1), italic: true });
        plainStart = i + 1;
      }
    }
  }
  if (plainStart < text.length) runs.push({ text: text.slice(plainStart), italic: false });
  return runs;
}
