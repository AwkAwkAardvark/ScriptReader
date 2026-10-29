// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localDatabase} from './local-database';
import {publish} from '../scripts/publish';
import {csvFor} from '../src/test/fixtures';
let local:Awaited<ReturnType<typeof localDatabase>>;let dir:string;
let args:string[];
beforeAll(async()=>{local=await localDatabase();dir=await mkdtemp(join(tmpdir(),'publisher-links-'));await writeFile(join(dir,'script.csv'),csvFor());await writeFile(join(dir,'cast.csv'),'Tag,Name\nRo,Rowan\nMi,Mira\nA1,One\nA2,Two\nA3,Three\nA4,Four');await writeFile(join(dir,'media.csv'),'No,YouTubeURL\n9,https://youtu.be/abcdefghijk');args=['--slug','cli-2026','--title','CLI 2026','--script',join(dir,'script.csv'),'--cast',join(dir,'cast.csv'),'--publish'];},60000);
afterAll(async()=>{await local?.db.close();if(dir)await rm(dir,{recursive:true,force:true});});
it('retains omitted CLI media and supports explicit removal and unmatched review',async()=>{
 const log=vi.spyOn(console,'log').mockImplementation(()=>{});
 try{
  await publish([...args,'--media',join(dir,'media.csv')],local.rpc);
  await publish(args,local.rpc);
  expect((await local.rpc('reader_song_context',{p_slug:'cli-2026'}) as any).songs.find((s:any)=>s.no===9).video).toBe('abcdefghijk');
  await writeFile(join(dir,'script.csv'),csvFor().replace('A little time to wonder','A different title'));
  await expect(publish(args,local.rpc)).rejects.toThrow(/could not be matched/);
  await publish([...args,'--media',join(dir,'media.csv'),'--acknowledge-unmatched'],local.rpc);
  await publish([...args,'--remove-media','9'],local.rpc);
  expect((await local.rpc('reader_song_context',{p_slug:'cli-2026'}) as any).payload.media).toEqual({});
 }finally{log.mockRestore();}
});
