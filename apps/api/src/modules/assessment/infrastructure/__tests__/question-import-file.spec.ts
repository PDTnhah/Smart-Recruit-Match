import { QUESTION_IMPORT_COLUMNS, QUESTION_IMPORT_HEADERS } from '@srm/shared';
import { Workbook } from 'exceljs';
import { deflateRawSync } from 'node:zlib';
import { QUESTION_SHEET, readQuestionFile, zipUnpacksWithin } from '../question-import-file.js';

/** A zip of one deflated entry that declares `declared` bytes unpacked, whatever it really holds. */
function zipOf(content: Buffer, declared: number): Buffer {
  const name = Buffer.from('a.xml');
  const data = deflateRawSync(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(declared, 22);
  local.writeUInt16LE(name.length, 26);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt32LE(data.length, 20);
  entry.writeUInt32LE(declared, 24);
  entry.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(entry.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, entry, name, end]);
}

describe('FR-42 reading an import file', () => {
  it('FR-42 AC-4 a zip is measured by what it inflates to, not by the sizes it declares (zip bomb)', () => {
    const limit = 10_000;
    expect(zipUnpacksWithin(zipOf(Buffer.alloc(limit, ' '), limit), limit)).toBe(true);
    expect(zipUnpacksWithin(zipOf(Buffer.alloc(limit + 1, ' '), 1), limit)).toBe(false);
  });

  it('FR-42 AC-4 AC-5 every row holding something is read with its number, however far down', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(QUESTION_SHEET);
    sheet.addRow([...QUESTION_IMPORT_HEADERS]);
    const stem = QUESTION_IMPORT_HEADERS.indexOf(QUESTION_IMPORT_COLUMNS.stem) + 1;
    sheet.getCell(2, stem).value = 'Câu đầu';
    sheet.getCell(1500, stem).value = { text: 'Câu cuối', hyperlink: 'https://example.com' };
    const rows = await readQuestionFile(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(rows.map((row) => [row.row, row.cells[stem - 1]?.text])).toEqual([
      [1, QUESTION_IMPORT_COLUMNS.stem],
      [2, 'Câu đầu'],
      [1500, 'Câu cuối'],
    ]);
  });
});
