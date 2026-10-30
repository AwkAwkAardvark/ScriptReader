import type {Locale} from '../i18n';
export function ProductionPicker({id,value,productions,onChange,disabled=false,locale,allowEmpty=true}:{id:string;value:string;productions:readonly {slug:string;title:string}[];onChange:(slug:string)=>void;disabled?:boolean;locale:Locale;allowEmpty?:boolean}){
 const ko=locale==='ko';return <label className="admin-production-picker" htmlFor={id}>{ko?'공연':'Production'}<select id={id} aria-label={ko?'공연 선택':'Choose a production'} value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}>{allowEmpty&&<option value="">{ko?'공연 선택':'Choose a production'}</option>}{productions.map(p=><option key={p.slug} value={p.slug}>{p.title}</option>)}</select></label>;
}
