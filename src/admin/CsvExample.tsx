import type {ReactNode} from 'react';
import {csvExamples} from './csv-examples';
import type {Locale} from '../i18n';
type Kind=keyof typeof csvExamples|'assignments';
export function CsvExample({kind,expanded=false,locale,value:custom,note,children}:{kind:Kind;expanded?:boolean;locale:Locale;value?:string;note?:string;children?:ReactNode}){
 const value=custom??(kind==='assignments'?'':csvExamples[kind]);const ko=locale==='ko';
 const labels={script:ko?'대본 CSV 예시':'Script CSV example',cast:ko?'등장인물 CSV 예시':'Cast CSV example',media:ko?'YouTube 연결 CSV 예시':'YouTube mapping CSV example',assignments:ko?'배역 배정 CSV 예시':'Assignment CSV example'};
 const helper=note??(kind==='script'?(ko?'3장 발췌 · 원본 번호 유지':'Chapter 3 excerpt · original record numbers'):undefined);
 function download(){const url=URL.createObjectURL(new Blob(['\ufeff'+value+'\n'],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${kind}-example.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <details className="csv-example" open={expanded||undefined}><summary>{ko?'CSV 예시':'CSV example'}</summary><div className="csv-example-body">{helper&&<p className="csv-example-note"><em>{helper}</em></p>}<pre tabIndex={0} aria-label={labels[kind]}>{value}</pre><button type="button" className="admin-secondary csv-example-download" onClick={download}>{ko?'예시 다운로드':'Download example'}</button>{children}</div></details>;
}
