import type { MediaEdits } from '../song-links';
export type ManagedProduction = { slug: string; title: string; revision: string; version: string; before: number; after: number; publishedAt: string; mediaCount: number };
export type HomeSetting = { slug: string | null; version: string };
export type ProductionList = { productions: ManagedProduction[]; home: HomeSetting };
export type Upload = { slug: string; title: string; before: number; after: number; expected: string | null; script: string; cast: string; media?: string; mediaEdits?: MediaEdits; acknowledgeUnmatched?: boolean };
export class ProductionFailure extends Error {
 constructor(public code: string, public diagnostics?: string) { super(code); }
}
export async function productionCall<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
 const encoded=body===undefined?undefined:JSON.stringify(body);
 if(encoded && new TextEncoder().encode(encoded).length>5*1024*1024) throw new ProductionFailure('too_large');
 const response=await fetch('/api/admin/'+path,{method,credentials:'same-origin',cache:'no-store',...(encoded?{headers:{'Content-Type':'application/json'},body:encoded}:{})});
 const result=await response.json();
 if(!response.ok || result.error) throw new ProductionFailure(result.error??'unavailable',result.diagnostics);
 return result;
}
