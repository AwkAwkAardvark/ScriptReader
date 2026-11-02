export function legacyRosterLocation(search:string){const source=new URLSearchParams(search);const target=new URLSearchParams();const production=source.get('production');if(production&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(production)&&production.length<=80)target.set('production',production);if(source.get('lang')==='ko')target.set('lang','ko');return '/admin/roster'+(target.size?'?'+target:'');}

export type ReaderRoute = {kind:'roster-redirect'} | { kind: 'home' } | { kind: 'admin'; page: 'overview' | 'scripts' | 'accounts' | 'songs' | 'viewer' | 'assignments' | 'roster-preview' | 'roster' } | { kind: 'local' } | { kind: 'production'; slug: string } | { kind: 'not-found' };

/** Local development and portable file demos retain CSV import at their entry point. */
export function readerRoute(path: string, protocol: string, development: boolean): ReaderRoute {
  if (protocol === 'file:' || /^\/import\/?$/.test(path) || (path === '/' && development)) return { kind: 'local' };
  if(/^\/admin\/assignments\/?$/.test(path))return {kind:'roster-redirect'};
  const admin=path.match(/^\/admin(?:\/(scripts|accounts|songs|viewer|assignments|roster-preview|roster))?\/?$/);
  if(admin)return {kind:'admin',page:(admin[1]??'overview') as 'overview'|'scripts'|'accounts'|'songs'|'viewer'|'assignments' | 'roster-preview' | 'roster'};
  if (path === '/') return { kind: 'home' };
  const production = path.match(/^\/p\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  if (production && production[1].length <= 80) return { kind: 'production', slug: production[1] };
  return { kind: 'not-found' };
}
