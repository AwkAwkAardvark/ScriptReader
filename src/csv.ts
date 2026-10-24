import Papa from 'papaparse';

export interface Diagnostic {
  recordNumber: number;
  field?: string;
  message: string;
  document?: 'script' | 'cast';
}

/** Keep logical record locations, including the header and quoted multiline cells. */
export function readCsv(text: string, headers: readonly string[], document: 'script' | 'cast') {
  const parsed = Papa.parse<string[]>(text, { delimiter: ',', skipEmptyLines: false });
  const rows = parsed.data;
  if (rows.length > 1 && rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === '') rows.pop();
  const errors: Diagnostic[] = parsed.errors.map(error => ({
    recordNumber: (error.row ?? 0) + 1, message: error.message, document,
  }));
  if (!rows[0] || rows[0].length !== headers.length || headers.some((header, i) => rows[0][i] !== header)) {
    return { rows: [], errors: [{ recordNumber: 1, message: `Expected headers in this order: ${headers.join(',')}.`, document }] };
  }
  return { rows, errors };
}

export const validTag = (tag: string) => Boolean(tag) && !/[\s,;\u0000-\u001f]/u.test(tag);
