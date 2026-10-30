import { describe, expect, it } from 'vitest';
import { readerRoute } from './routes';

describe('reader entry points', () => {
  it('resolves the configured homepage at the hosted root and preserves production links', () => {
    expect(readerRoute('/', 'https:', false)).toEqual({kind:'home'});
    expect(readerRoute('/p/aladdin-pilot/', 'https:', false)).toEqual({kind:'production',slug:'aladdin-pilot'});
    expect(readerRoute('/p/another-script', 'https:', false)).toEqual({kind:'production',slug:'another-script'});
  });
  it('opens administration only at its explicit hosted route', () => {
    expect(readerRoute('/admin', 'https:', false)).toEqual({kind:'admin',page:'overview'});
    expect(readerRoute('/admin/', 'https:', false)).toEqual({kind:'admin',page:'overview'});
    expect(readerRoute('/admin/scripts','https:',false)).toEqual({kind:'admin',page:'scripts'});
    expect(readerRoute('/admin/songs','https:',false)).toEqual({kind:'admin',page:'songs'});
    expect(readerRoute('/admin/viewer','https:',false)).toEqual({kind:'admin',page:'viewer'});
    expect(readerRoute('/admin/roster','https:',false)).toEqual({kind:'admin',page:'roster'});
    expect(readerRoute('/admin/roster-preview','https:',false)).toEqual({kind:'admin',page:'roster-preview'});
    expect(readerRoute('/admin/assignments','https:',false)).toEqual({kind:'admin',page:'assignments'});
    expect(readerRoute('/admin/accounts','https:',false)).toEqual({kind:'admin',page:'accounts'});
    expect(readerRoute('/admin/nope', 'https:', false)).toEqual({kind:'not-found'});
    expect(readerRoute('/admin', 'file:', false)).toEqual({kind:'local'});
  });
  it('keeps the importer explicit and the offline/development workflows local', () => {
    expect(readerRoute('/import/', 'https:', false)).toEqual({kind:'local'});
    expect(readerRoute('/path/Staff Demo.html', 'file:', false)).toEqual({kind:'local'});
    expect(readerRoute('/', 'http:', true)).toEqual({kind:'local'});
  });
  it.each(['/unknown','/.env','/server/api.ts','/p/a/b','/p/%3Cscript%3E','/p/'+ 'a'.repeat(81)])('does not open an importer for unsupported path %s', path => {
    expect(readerRoute(path,'https:',false)).toEqual({kind:'not-found'});
  });
});
