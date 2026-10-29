import { expect,it } from 'vitest';
import { preparePublication } from '../server/publishing';
import { resolveSongLinks } from './song-links';
import { csvFor } from './test/fixtures';
const payload=()=>preparePublication(csvFor(),'Tag,Name\nRo,Rowan\nMi,Mira\nA1,One\nA2,Two\nA3,Three\nA4,Four');
it('retains unique titles across changed numbers and ignores case/spacing',()=>{
 const p=payload();const r=resolveSongLinks(p,[{no:999,title:'  A LITTLE   TIME TO WONDER ',video:'abcdefghijk'}]);expect(r.payload.media[9]).toBe('abcdefghijk');expect(r.unmatched).toHaveLength(0);
});
it('never transfers by record number and flags renamed or removed linked songs',()=>{
 const r=resolveSongLinks(payload(),[{no:9,title:'A different song',video:'abcdefghijk'}]);expect(r.payload.media[9]).toBeUndefined();expect(r.unmatched).toHaveLength(1);
});
it('does not automatically resolve repeated titles on either side',()=>{
 const p=payload();const old=[{no:1,title:'A little time to wonder',video:'abcdefghijk'},{no:2,title:'A little time to wonder',video:'lmnopqrstuv'}];expect(resolveSongLinks(p,old).payload.media[9]).toBeUndefined();
 p.script.records.find(r=>r.no===17)!.source.English='A little time to wonder';expect(resolveSongLinks(p,old.slice(0,1)).payload.media).toEqual({});
});
it('overrides only supplied CSV entries and explicitly removes individual links',()=>{
 const p=payload();p.media[17]='lmnopqrstuv';const previous=[{no:99,title:'A little time to wonder',video:'abcdefghijk'}];
 expect(resolveSongLinks(p,previous).payload.media).toEqual({9:'abcdefghijk',17:'lmnopqrstuv'});
 expect(resolveSongLinks(p,previous,{'9':null,'17':'https://youtu.be/zyxwvutsrqp'}).payload.media).toEqual({17:'zyxwvutsrqp'});
 expect(()=>resolveSongLinks(p,previous,{'17':''})).toThrow();expect(()=>resolveSongLinks(p,previous,{'3':null})).toThrow();
});
