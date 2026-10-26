import type { ApiProblem, Counts, PassageBundle, Production } from './protocol';
export class ApiFailure extends Error {
  constructor(public problem: ApiProblem) { super(problem.error); }
}
async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) {
    const codes = ['not_found', 'invalid_request', 'quota', 'rate', 'revision_changed', 'unavailable'];
    throw new ApiFailure(result && codes.includes(result.error) ? result : { error: 'unavailable' });
  }
  return result as T;
}
export const loadProduction = (slug: string, signal?: AbortSignal) => post<Production>(`/api/productions/${encodeURIComponent(slug)}`, {}, signal);
export const loadPassages = (slug: string, revision: string, character: string, counts: Counts, signal: AbortSignal) =>
  post<PassageBundle>(`/api/productions/${encodeURIComponent(slug)}/passages`, { revision, character, ...counts }, signal);
