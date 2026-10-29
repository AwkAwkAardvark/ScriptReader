import { csvExamples } from './csv-examples';
import type { Locale } from '../i18n';
export function CsvExample({kind,expanded,locale}:{kind:keyof typeof csvExamples;expanded:boolean;locale:Locale}) {
 const value=csvExamples[kind];const ko=locale==='ko';
 function download(){const url=URL.createObjectURL(new Blob(['\ufeff'+value+'\n'],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${kind}-example.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <details className="csv-example" open={expanded||undefined}><summary>{ko?'CSV 예시':'CSV example'}</summary><pre>{value}</pre><button type="button" onClick={download}>{ko?'예시 다운로드':'Download example'}</button></details>;
}
