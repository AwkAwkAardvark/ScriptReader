/** Called by beforeprint, once the browser has applied the A4 print styles. */
export function preparePrintLayout(root: ParentNode = document): void {
  // CSS defines 14 mm margins on a 297 mm A4 page. CSS px are 96/in in print.
  const pageHeight = (297 - 14 * 2) * 96 / 25.4;
  for (const element of root.querySelectorAll<HTMLElement>('.passage-window, .script-entry, .song-marker')) {
    element.classList.remove('print-split');
    // Avoid moving an oversized group to a fresh page only to split it there.
    element.classList.toggle('print-split', element.getBoundingClientRect().height > pageHeight);
  }
}
