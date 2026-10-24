import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { csvFor, scriptFor, syntheticRecords } from './test/fixtures';
import { filterScript } from './script';

async function openScript(text = csvFor()) {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('Script file'), new File([text], 'garden-rehearsal.csv', { type: 'text/csv' }));
  await waitFor(() => expect(screen.getByLabelText('Character')).toBeEnabled());
  return user;
}

async function openCast(text = 'Tag,Name\nRo,Rowan Reed\nMi,Mira Moss') {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('Cast file'), new File([text], 'characters.csv', { type: 'text/csv' }));
  await waitFor(() => expect(document.querySelector('.reader')).toHaveAttribute('aria-busy', 'false'));
  return user;
}

describe('student reader workflow', () => {
  it('starts empty with approved defaults and a working Open Script button', async () => {
    render(<App />);
    expect(screen.getByText('Open a script')).toBeInTheDocument();
    expect(screen.getByLabelText('Character')).toBeDisabled();
    expect(screen.getByRole('radio', { name: '±3' })).toBeChecked();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Include actions & cues' })).not.toBeChecked();
    const click = vi.spyOn(screen.getByLabelText('Script file'), 'click');
    await userEvent.click(screen.getByRole('button', { name: 'Open Script' }));
    expect(click).toHaveBeenCalled();
  });
  it('opens a file, requires a character, and updates the reader with symmetric context', async () => {
    render(<App />);
    const user = await openScript();
    expect(screen.getByText('Select a character')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    expect(screen.getByRole('heading', { name: 'Mira' })).toBeInTheDocument();
    expect(screen.getByText('3 lines · 1 scene')).toBeInTheDocument();
    const passage = screen.getByRole('region', { name: 'Rehearsal passage' });
    expect(passage).toHaveTextContent('Let’s listen before we decide.');
    expect(passage).toHaveTextContent('A little time to wonder');
    expect(passage).toHaveTextContent('Then that is where our story goes next.');
    expect(screen.queryByText(/WINDOW \d/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Other' }));
    fireEvent.change(screen.getByLabelText('Before'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('After'), { target: { value: '0' } });
    expect(screen.getAllByRole('region', { name: 'Rehearsal passage' })).toHaveLength(4);
    expect(screen.getByText('Someone has left us a message.')).toBeInTheDocument();
    expect(screen.queryByText('(A paper bird drifts down beside the bench.)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Include actions & cues' }));
    expect(screen.getByText('(Mira opens the workshop door.)')).toBeInTheDocument();
    expect(screen.getByText('The gears turn')).toBeInTheDocument();
  });
  it('switches characters without reopening the file or changing context settings', async () => {
    render(<App />);
    const user = await openScript();
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    expect(screen.getByRole('heading', { name: 'Mira' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Character'), 'Ro');
    expect(screen.getByRole('heading', { name: 'Rowan' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '±3' })).toBeChecked();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(document.querySelector('.script-entry.highlighted .entry-name')).toHaveTextContent('Rowan');
    expect(screen.getByText('We made it before sunset.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    expect(screen.queryByText('We made it before sunset.')).not.toBeInTheDocument();
  });
  it('applies presets to both sides and reveals focused independent fields for Other', async () => {
    render(<App />);
    const user = await openScript();
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    await user.click(screen.getByRole('radio', { name: '±1' }));
    expect(screen.getByRole('radio', { name: '±1' })).toBeChecked();
    expect(screen.getByText('(A paper bird drifts down beside the bench.)')).toBeInTheDocument();
    expect(screen.getByText('A warm light falls across the garden path.')).toBeInTheDocument();
    expect(screen.queryByText('(Mira lifts the lantern.)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '±5' }));
    expect(screen.getByText('(Mira lifts the lantern.)')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Other' }));
    expect(screen.getByLabelText('Before')).toHaveFocus();
    expect(screen.getByLabelText('Before')).toHaveValue(5);
    expect(screen.getByLabelText('After')).toHaveValue(5);
    expect(screen.getByLabelText('Before')).toHaveAttribute('min', '0');
    expect(screen.getByLabelText('Before')).toHaveAttribute('max', '10');
    fireEvent.change(screen.getByLabelText('Before'), { target: { value: '10' } });
    expect(screen.getByLabelText('Before')).toHaveAttribute('aria-invalid', 'false');
    await user.click(screen.getByRole('radio', { name: '±3' }));
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '±3' })).toBeChecked();
  });
  it.each(['-1', '11', '1.5', ''].flatMap(value => ['Before', 'After'].map(side => [side, value])))('rejects %s context %s and retains the last valid selection', async (side, value) => {
    render(<App />);
    const user = await openScript();
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    await user.click(screen.getByRole('radio', { name: 'Other' }));
    fireEvent.change(screen.getByLabelText(side), { target: { value: '0' } });
    const ids = () => Array.from(document.querySelectorAll('[data-record]')).map(node => node.getAttribute('data-record'));
    const previous = ids();
    fireEvent.change(screen.getByLabelText(side), { target: { value } });
    expect(screen.getByLabelText(side)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a whole number from 0–10.')).toBeInTheDocument();
    expect(ids()).toEqual(previous);
    fireEvent.change(screen.getByLabelText(side), { target: { value: '10' } });
    expect(screen.getByLabelText(side)).toHaveAttribute('aria-invalid', 'false');
    expect(ids().length).toBeGreaterThan(previous.length);
  });
  it('renders markup as text and preserves multiline text', async () => {
    render(<App />);
    const text = '<img src=x onerror=alert(1)>\nKeep this text.';
    const user = await openScript(csvFor(syntheticRecords.map((record, i) => i === 3 ? { ...record, English: text } : record)));
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === text)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
  it('supports three before and one after while presets restore symmetric context', async () => {
    render(<App />);
    const user = await openScript();
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    await user.click(screen.getByRole('radio', { name: 'Other' }));
    fireEvent.change(screen.getByLabelText('Before'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('After'), { target: { value: '1' } });
    const actual = Array.from(document.querySelectorAll('[data-record]')).map(node => Number(node.getAttribute('data-record')));
    const expected = filterScript(scriptFor().records, { character: 'Mi', before: 3, after: 1, includeNonDialogue: false });
    expect(actual).toEqual(expected.items.filter(item => !item.record.types.includes('Title')).map(item => item.record.no));
    await user.click(screen.getByRole('radio', { name: '±5' }));
    await user.click(screen.getByRole('radio', { name: 'Other' }));
    expect(screen.getByLabelText('Before')).toHaveValue(5);
    expect(screen.getByLabelText('After')).toHaveValue(5);
  });
  it('switches interface language independently of Korean translations without altering filtering', async () => {
    render(<App />);
    const user = await openScript();
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    const ids = () => Array.from(document.querySelectorAll('[data-record]')).map(node => node.getAttribute('data-record'));
    const original = ids();
    expect(screen.getByRole('button', { name: 'ENG', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Display Korean lines' })).not.toBeChecked();
    expect(screen.queryByText('누군가 메시지를 남겼어요.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Display Korean lines' }));
    expect(screen.getByText('누군가 메시지를 남겼어요.')).toHaveAttribute('lang', 'ko');
    expect(screen.getByText('Someone has left us a message.')).toHaveAttribute('lang', 'en');
    expect(document.querySelector('.script-entry.direction .translation')).toBeNull();
    await user.click(screen.getByRole('button', { name: '한국어' }));
    expect(document.documentElement).toHaveAttribute('lang', 'ko');
    expect(screen.getByRole('button', { name: '대본 열기' })).toBeInTheDocument();
    expect(screen.getByLabelText('배역')).toHaveValue('Mi');
    expect(screen.getByText('대사 3개 · 장면 1개')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '±3' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '한국어 표기' })).toBeChecked();
    expect(ids()).toEqual(original);
    await user.click(screen.getByRole('checkbox', { name: '한국어 표기' }));
    expect(screen.queryByText('누군가 메시지를 남겼어요.')).not.toBeInTheDocument();
    expect(screen.getByText('Someone has left us a message.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ENG' }));
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(screen.getByLabelText('Character')).toHaveValue('Mi');
  });
  it('localizes context validation and file diagnostics when the interface is Korean', async () => {
    render(<App />);
    const user = await openScript();
    await user.click(screen.getByRole('button', { name: '한국어' }));
    await user.click(screen.getByRole('radio', { name: '직접 입력' }));
    fireEvent.change(screen.getByLabelText('앞'), { target: { value: '-1' } });
    expect(screen.getByText('0–10 사이의 정수를 입력하세요.')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('대본 파일'), new File(['wrong,headers'], 'bad.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CSV 파일을 확인하세요');
    expect(screen.getByRole('alert')).toHaveTextContent('다음 순서의 헤더가 필요합니다');
    expect(screen.getByRole('alert')).toHaveTextContent('CSV 1번째 레코드');
  });
  it('escapes Korean text and supports translated scene headings and songs', async () => {
    render(<App />);
    const koreanMarkup = '<img src=x onerror=alert(1)> 한국어';
    const records = syntheticRecords.map((record, index) => ({ ...record,
      Korean: index === 0 ? '시계공의 정원' : index === 8 ? '작은 시간' : index === 3 ? koreanMarkup : record.Korean,
    }));
    const user = await openScript(csvFor(records));
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    await user.click(screen.getByRole('checkbox', { name: 'Display Korean lines' }));
    expect(screen.getByText('시계공의 정원')).toHaveClass('translation');
    expect(screen.getByText('작은 시간')).toHaveClass('translation');
    expect(screen.getByText(koreanMarkup)).toHaveClass('translation');
    expect(document.querySelector('img')).toBeNull();
  });
  it('reports validation errors and clears the previous script when a replacement is invalid', async () => {
    render(<App />);
    const user = await openScript();
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    await user.upload(screen.getByLabelText('Script file'), new File(['wrong,headers\n1,2'], 'bad.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CSV record 1');
    expect(screen.getByLabelText('Character')).toBeDisabled();
    expect(screen.queryByText('Someone has left us a message.')).not.toBeInTheDocument();
  });
  it('supports drag and drop', async () => {
    render(<App />);
    const drop = screen.getByText('or drop CSV').closest('.file-drop')!;
    fireEvent.drop(drop, { dataTransfer: { files: [new File([csvFor()], 'dropped.csv')] } });
    await waitFor(() => expect(screen.getByLabelText('Character')).toBeEnabled());
    expect(screen.getByText('dropped.csv')).toBeInTheDocument();
  });
});

describe('script and cast import', () => {
  it('loads the cast before the script and uses explicit names in the dropdown and individual attributions', async () => {
    render(<App />);
    await openCast();
    expect(screen.getByLabelText('Character')).toBeDisabled();
    const user = await openScript();
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    expect(screen.getByRole('heading', { name: 'Mira Moss' })).toBeInTheDocument();
    expect(document.querySelector('.script-entry.highlighted .entry-name')).toHaveTextContent('Mira Moss');
    expect(screen.queryByText('Mira', { exact: true })).not.toBeInTheDocument();
  });
  it('can add or remove a cast after opening a legacy script without changing its text or context', async () => {
    render(<App />);
    const user = await openScript();
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    await user.click(screen.getByRole('radio', { name: 'Other' }));
    fireEvent.change(screen.getByLabelText('After'), { target: { value: '1' } });
    await openCast();
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    expect(screen.getByRole('heading', { name: 'Mira Moss' })).toBeInTheDocument();
    expect(screen.getByLabelText('After')).toHaveValue(1);
    expect(screen.getByText('Someone has left us a message.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove cast' }));
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    expect(screen.getByRole('heading', { name: 'Mira' })).toBeInTheDocument();
    expect(screen.queryByText('characters.csv')).not.toBeInTheDocument();
  });
  it('supports action-only and unused characters with an explicit cast', async () => {
    render(<App />);
    await openCast('Tag,Name\nRo,Rowan\nMi,Mira\nSp,Silent Sprite\nUn,Unused');
    const records = syntheticRecords.map((row, index) => index === 2 ? { ...row, Tag: 'Sp' } : row);
    const user = await openScript(csvFor(records));
    await user.selectOptions(screen.getByLabelText('Character'), 'Sp');
    expect(screen.getByText('No matches.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Include actions & cues' }));
    expect(screen.getByText('(A paper bird drifts down beside the bench.)')).toBeInTheDocument();
    expect(document.querySelector('.script-entry.highlighted .entry-name')).toHaveTextContent('Silent Sprite');
    await user.selectOptions(screen.getByLabelText('Character'), 'Un');
    expect(screen.getByText('No matches.')).toBeInTheDocument();
  });
  it('blocks invalid cast data with file-specific diagnostics instead of falling back silently', async () => {
    render(<App />);
    const user = await openScript();
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    await openCast('Tag,Name\nMi,Mira\nMi,Another name');
    expect(screen.getByRole('alert')).toHaveTextContent('Cast file · CSV record 3 · Tag');
    expect(screen.getByRole('alert')).toHaveTextContent('Duplicate cast tag.');
    expect(screen.getByLabelText('Character')).toBeDisabled();
    expect(screen.queryByText('Someone has left us a message.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove cast' }));
    expect(screen.getByLabelText('Character')).toBeEnabled();
  });
  it('rejects a mismatched cast at script record locations and recovers when the right cast is selected', async () => {
    render(<App />);
    await openScript();
    await openCast('Tag,Name\nOther,Somebody');
    expect(screen.getByRole('alert')).toHaveTextContent('Script file · CSV record 3 · Tag');
    expect(screen.getByRole('alert')).toHaveTextContent('Character token Ro is missing from the cast roster.');
    await openCast();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Character')).toBeEnabled();
  });
  it('disambiguates equal roster names by tag and renders roster names as plain text', async () => {
    render(<App />);
    await openCast('Tag,Name\nRo,Keeper\nMi,Keeper');
    const user = await openScript();
    expect(screen.getByRole('option', { name: 'Keeper (Ro)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Keeper (Mi)' })).toBeInTheDocument();
    await openCast('Tag,Name\nRo,Rowan\nMi,<img src=x onerror=alert(1)>');
    await user.selectOptions(screen.getByLabelText('Character'), 'Mi');
    expect(document.querySelector('.script-entry.highlighted .entry-name')).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img')).toBeNull();
  });
  it('localizes cast import controls and diagnostics', async () => {
    render(<App />);
    await openScript();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '한국어' }));
    expect(screen.getByRole('button', { name: '배역 목록 열기' })).toBeInTheDocument();
    await user.upload(screen.getByLabelText('배역 목록 파일'), new File(['Tag,Name\nMi,'], 'bad-cast.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('배역 목록 파일');
    expect(screen.getByRole('alert')).toHaveTextContent('배역 이름이 필요합니다.');
  });
  it('supports cast drag/drop and rejects multiple files for one control', async () => {
    render(<App />);
    await openScript();
    const drop = screen.getByRole('button', { name: 'Open Cast' }).closest('.file-drop')!;
    fireEvent.drop(drop, { dataTransfer: { files: [new File(['Tag,Name\nRo,Rowan Reed\nMi,Mira Moss'], 'cast.csv')] } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Mira Moss' })).toBeInTheDocument());
    fireEvent.drop(drop, { dataTransfer: { files: [new File(['x'], 'a.csv'), new File(['y'], 'b.csv')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Cast file');
    expect(screen.getByRole('alert')).toHaveTextContent('one CSV file per control');
  });
  it('ignores late cast reads after replacement or removal while independent script reads can finish', async () => {
    class DeferredReader {
      result = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsText() { readers.push(this); }
    }
    const readers: DeferredReader[] = [];
    vi.stubGlobal('FileReader', DeferredReader);
    try {
      render(<App />);
      const choose = (label: string, filename: string) => fireEvent.change(screen.getByLabelText(label), { target: { files: [new File([''], filename)] } });
      const finish = async (index: number, text: string) => act(async () => { readers[index].result = text; readers[index].onload?.(); });
      choose('Script file', 'script.csv');
      choose('Cast file', 'old.csv');
      choose('Cast file', 'new.csv');
      await finish(2, 'Tag,Name\nRo,Latest Rowan\nMi,Latest Mira');
      await finish(0, csvFor());
      await finish(1, 'Tag,Name\nRo,Old Rowan\nMi,Old Mira');
      expect(screen.getByRole('option', { name: 'Latest Mira' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Old Mira' })).not.toBeInTheDocument();
      choose('Cast file', 'pending.csv');
      await userEvent.click(screen.getByRole('button', { name: 'Remove cast' }));
      await finish(3, 'Tag,Name\nRo,Removed Rowan\nMi,Removed Mira');
      expect(screen.getByRole('option', { name: 'Mira' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Removed Mira' })).not.toBeInTheDocument();
    } finally { vi.unstubAllGlobals(); }
  });
});
