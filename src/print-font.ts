import fontUrl from './assets/fonts/noto-sans-kr-variable.ttf?url';

let pending: Promise<void> | undefined;
/** One bundled variable font covers English and Korean, including offline file:// demos. */
export function preparePrintFont(): Promise<void> {
  if (!pending) pending = (async () => {
    const face = new FontFace('ScriptReaderPrint', `url("${fontUrl}")`, { weight: '100 900', style: 'normal' });
    await face.load();
    document.fonts.add(face);
    await document.fonts.load('400 11pt ScriptReaderPrint', 'Rehearsal 대본');
    await document.fonts.ready;
  })().catch(error => { pending = undefined; throw error; });
  return pending;
}
