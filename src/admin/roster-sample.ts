import type { RosterDraft } from '../roster';
export const sampleRoles = [{ tag: 'Gua1', label: 'Guard One', ko: '경비병 1' }, { tag: 'Gua2', label: 'Guard Two', ko: '경비병 2' }, { tag: 'Mer1', label: 'Merchant One', ko: '상인 1' }, { tag: 'Mer2', label: 'Merchant Two', ko: '상인 2' }];
export const sampleDraft = (): RosterDraft => ({ students: [
  { id: 'sample-a', name: '김민준', className: 'EPG', label: '' },
  { id: 'sample-b', name: '김민준', className: 'EPI', label: '' },
  { id: 'sample-c', name: '이서연', className: 'EPC/EPD', label: '' },
  { id: 'sample-d', name: '이서연', className: 'EPC/EPD', label: '' },
  { id: 'sample-e', name: '박지우', className: 'EI6', label: '' },
], casting: { 'Gua1:1부': 'sample-a', 'Gua1:2부': 'sample-b', 'Gua2:1부': 'sample-c', 'Gua2:2부': 'sample-d', 'Mer1:1부': 'sample-e', 'Mer2:1부': 'sample-a' } });
