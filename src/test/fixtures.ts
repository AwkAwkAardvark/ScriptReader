import Papa from 'papaparse';
import { HEADERS, parseScript, type SourceRecord } from '../script';

/** Entirely fictional rehearsal text, unrelated to the private musical. */
export const syntheticRecords: SourceRecord[] = [
  ['1', '1', '', 'The clockmaker’s garden', '', 'Title', '', '', ''],
  ['2', '1', 'Rowan', 'The gate is open. Shall we take a look?', '문이 열려 있어요.', 'Line', '', 'Ro', ''],
  ['3', '1', '', '(A paper bird drifts down beside the bench.)', '', 'StageDirection', '', '', ''],
  ['4', '1', 'Mira', 'Someone has left us a message.', '누군가 메시지를 남겼어요.', 'Line', '', 'Mi', ''],
  ['5', '1', '', 'A warm light falls across the garden path.', '', 'Lighting', '', 'Mi', ''],
  ['6', '1', 'Rowan', 'It says, "Follow the ticking."\nWhat could that mean?', '', 'Line', '', 'Ro', ''],
  ['7', '1', 'Mira', 'Let’s listen before we decide.', '', 'Line', '', 'Mi', 'Y'],
  ['8', '1', '', '(Rowan folds the note and puts it in a pocket.)', '', 'StageDirection', '', 'Ro', ''],
  ['9', '1', '', 'A little time to wonder', '', 'Song', '', '', ''],
  ['10', '1', 'Rowan', 'There. Behind the old fountain.', '', 'Line', '', 'Ro', ''],
  ['11', '1', 'Mira', 'Then that is where our story goes next.', '', 'Line', '', 'Mi', ''],
  ['12', '1', '', 'Three soft chimes.', '', 'SFX', '', '', ''],
  ['13', '1', '', '(Mira lifts the lantern.)', '', 'StageDirection', '', 'Mi', ''],
  ['14', '2', '', 'The workshop', '', 'Title', '', '', ''],
  ['15', '2', 'Rowan', 'Look at all these tiny clocks.', '', 'Line', '', 'Ro', ''],
  ['16', '2', '', '(Mira opens the workshop door.)', '', 'VFX; StageDirection', '', 'Mi', ''],
  ['17', '2', '', 'The gears turn', '', 'Song', '', '', ''],
  ['18', '3', '', 'The rooftop', '', 'Title', '', '', ''],
  ['19', '3', '', 'Under a paper moon', '', 'Song', '', '', ''],
  ['20', '3', 'Rowan', 'We made it before sunset.', '', 'Line', '', 'Ro', ''],
].map(cells => Object.fromEntries(HEADERS.map((key, index) => [key, cells[index]])) as SourceRecord);

export const csvFor = (records = syntheticRecords) => Papa.unparse({ fields: [...HEADERS], data: records.map(row => HEADERS.map(key => row[key])) });
export function scriptFor(records = syntheticRecords) {
  const result = parseScript(csvFor(records));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.script;
}
