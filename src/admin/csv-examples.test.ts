import {expect,it} from 'vitest';
import {csvExamples} from './csv-examples';
import {preparePublication} from '../../server/publishing';
it('provides small matching fictional script/cast/media CSVs that pass publication validation',()=>{
 const result=preparePublication(csvExamples.script,csvExamples.cast,csvExamples.media);
 expect(result.script.records).toHaveLength(3);expect(result.script.characters).toHaveLength(2);expect(Object.keys(result.media)).toEqual(['2','3']);
 for(const text of Object.values(csvExamples))expect(text.split('\n').length).toBeGreaterThanOrEqual(3);
});
