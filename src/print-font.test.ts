import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
describe('bundled print font', () => {
  it('waits for the actual face and font set, shares concurrent loads', async () => {
    let finish!: () => void;
    const load = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const constructor = vi.fn(function () { return { load }; });
    vi.stubGlobal('FontFace', constructor);
    const { preparePrintFont } = await import('./print-font');
    const first = preparePrintFont();
    expect(preparePrintFont()).toBe(first);
    expect(constructor).toHaveBeenCalledWith('ScriptReaderPrint', expect.stringContaining('noto-sans-kr-variable.ttf'), { weight: '100 900', style: 'normal' });
    finish();
    await first;
    expect(document.fonts.add).toHaveBeenCalled();
    expect(document.fonts.load).toHaveBeenCalledWith('400 11pt ScriptReaderPrint', 'Rehearsal 대본');
  });
  it('allows a failed font load to be retried', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(undefined);
    vi.stubGlobal('FontFace', class { load = load; });
    const { preparePrintFont } = await import('./print-font');
    await expect(preparePrintFont()).rejects.toThrow('unavailable');
    await expect(preparePrintFont()).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
