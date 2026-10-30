import type { Locale } from '../i18n';
import { RosterWorkspace } from './RosterWorkspace';
import { sampleDraft, sampleRoles } from './roster-sample';
/** Isolated, in-memory sample; never loads or saves production casting. */
export function RosterPreview({locale,onLocale,master=false,embedded=false}:{embedded?:boolean;locale:Locale;onLocale:(locale:Locale)=>void;master?:boolean}) {
 return <RosterWorkspace embedded={embedded} locale={locale} onLocale={onLocale} master={master} initial={sampleDraft()} roles={sampleRoles} title={locale==='ko'?'연습 공연 2026':'Rehearsal 2026'} sampleMode/>;
}
