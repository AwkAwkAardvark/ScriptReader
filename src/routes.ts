export type ReaderRoute = { kind: 'home' } | { kind: 'admin'; page: 'overview' | 'scripts' | 'accounts' } | { kind: 'local' } | { kind: 'production'; slug: string } | { kind: 'not-found' };

/** Local development and portable file demos retain CSV import at their entry point. */
export function readerRoute(path: string, protocol: string, development: boolean): ReaderRoute {
  if (protocol === 'file:' || /^\/import\/?$/.test(path) || (path === '/' && development)) return { kind: 'local' };
  const admin=path.match(/^\/admin(?:\/(scripts|accounts))?\/?$/);
  if(admin)return {kind:'admin',page:(admin[1]??'overview') as 'overview'|'scripts'|'accounts'};
  if (path === '/') return { kind: 'home' };
  const production = path.match(/^\/p\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  if (production && production[1].length <= 80) return { kind: 'production', slug: production[1] };
  return { kind: 'not-found' };
}
