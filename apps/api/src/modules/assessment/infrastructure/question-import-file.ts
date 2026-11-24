import {
  type CellCoverage,
  MANUAL_QUESTION_IMPORT_MAX_ROWS,
  OPTION_LETTERS,
  QUESTION_IMPORT_COLUMNS,
  QUESTION_IMPORT_DIFFICULTY_LABELS,
  QUESTION_IMPORT_HEADERS,
  QUESTION_IMPORT_TYPE_LABELS,
  type QuestionImportFileError,
  type QuestionImportFormat,
  RUBRIC_MAX_CRITERIA,
  RUBRIC_MAX_POINTS,
} from '@srm/shared';
import { type Cell, ValueType, type Workbook as ExcelWorkbook, Workbook } from 'exceljs';
import { fromBuffer } from 'file-type';
import { Readable } from 'node:stream';
import { inflateRawSync } from 'node:zlib';
import { hasImportContent, type ImportCell, type ImportRow } from '../domain/manual-questions.js';

// The import file of questions added by hand (US-4.13 AC-3, AC-4, CONTEXT D62), read and written
// with exceljs. Only text leaves this file: a formula is flagged, never computed, and a CSV is read
// with every value kept as the string it is.

/** Sheet the questions are read from; the first sheet when a file has none of this name. */
export const QUESTION_SHEET = 'Câu hỏi';

const GUIDE_SHEET = 'Hướng dẫn';

/** An `.xlsx` unpacking to more than this is refused before exceljs reads it (zip bomb). */
const MAX_UNPACKED_BYTES = 20 * 1024 * 1024;

/** Columns read from a sheet: the template has 31, room for a few extra. */
const MAX_COLUMNS = 64;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const IMPORT_CONTENT_TYPES: Readonly<Record<QuestionImportFormat, string>> = {
  xlsx: XLSX_MIME,
  csv: 'text/csv; charset=utf-8',
};

/** A file refused as a whole (AC-4): the service turns it into `400 QUESTION_IMPORT_FILE_INVALID`. */
export class ImportFileError extends Error {
  constructor(readonly reason: QuestionImportFileError) {
    super(`import file refused: ${reason}`);
  }
}

/**
 * The rows of the questions sheet that hold something, with their numbers. The type comes from the bytes, never the
 * name: an `.xlsx` workbook, or else UTF-8 text read as CSV (with or without BOM; `;` as the
 * separator when the header line has `;` and no `,`, as Excel writes CSV under a Vietnamese locale).
 */
export async function readQuestionFile(buffer: Buffer): Promise<ImportRow[]> {
  const detected = await fromBuffer(buffer);
  if (detected?.ext === 'xlsx') return readXlsx(buffer);
  if (detected !== undefined || !isUtf8Text(buffer)) throw new ImportFileError('UNSUPPORTED_TYPE');
  return readCsv(buffer);
}

async function readXlsx(buffer: Buffer): Promise<ImportRow[]> {
  if (!zipUnpacksWithin(buffer, MAX_UNPACKED_BYTES)) throw new ImportFileError('UNREADABLE');
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ImportFileError('UNREADABLE');
  }
  return rowsOf(workbook, (cell) => xlsxCell(cell));
}

async function readCsv(buffer: Buffer): Promise<ImportRow[]> {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const workbook = new Workbook();
  try {
    await workbook.csv.read(Readable.from(Buffer.from(text, 'utf8')), {
      // Every value as the string it is: no number or date guessed.
      map: (value: unknown) => value,
      parserOptions: { delimiter },
    });
  } catch {
    throw new ImportFileError('UNREADABLE');
  }
  // A CSV holds no formula, but a value starting with `=` becomes one when the file is opened in a
  // spreadsheet again: refused like a formula (AC-4).
  return rowsOf(workbook, (cell) => {
    const value = typeof cell.value === 'string' ? cell.value : '';
    return value.trimStart().startsWith('=') ? { text: '', formula: true } : { text: value, formula: false };
  });
}

/**
 * Every row of the sheet holding something, wherever it is: a question far below the others is
 * still read (AC-4, AC-5). Reading stops one question past the limit, which is enough for the
 * domain to refuse the file as TOO_MANY_ROWS.
 */
function rowsOf(workbook: ExcelWorkbook, read: (cell: Cell) => ImportCell): ImportRow[] {
  const sheet = workbook.getWorksheet(QUESTION_SHEET) ?? workbook.worksheets[0];
  if (!sheet) throw new ImportFileError('UNREADABLE');
  const lastColumn = Math.min(sheet.columnCount, MAX_COLUMNS);
  const rows: ImportRow[] = [];
  let questions = 0;
  sheet.eachRow((row, number) => {
    if (questions > MANUAL_QUESTION_IMPORT_MAX_ROWS) return;
    const cells = Array.from({ length: lastColumn }, (_, c) => read(row.getCell(c + 1)));
    if (!hasImportContent(cells)) return;
    rows.push({ row: number, cells });
    if (number > 1) questions += 1;
  });
  return rows;
}

function xlsxCell(cell: Cell): ImportCell {
  if (cell.type === ValueType.Formula || cell.type === ValueType.Error) return { text: '', formula: true };
  const value = cell.value;
  if (value === null || value === undefined) return { text: '', formula: false };
  if (value instanceof Date) return { text: value.toISOString(), formula: false };
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value || 'error' in value) return { text: '', formula: true };
    if ('richText' in value) return { text: textOf(value), formula: false };
    // A hyperlink: its text is a string or rich text.
    if ('text' in value) return { text: textOf(value.text), formula: false };
    return { text: '', formula: false };
  }
  return { text: String(value), formula: false };
}

/** The text of a string or of rich text (`{ richText: [{ text }] }`); empty for anything else. */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'richText' in value && Array.isArray(value.richText)) {
    return (value.richText as unknown[])
      .map((run) => (typeof run === 'object' && run !== null && 'text' in run ? textOf(run.text) : ''))
      .join('');
  }
  return '';
}

/** UTF-8 that decodes and holds no NUL: what a CSV is. */
function isUtf8Text(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a zip's entries unpack to at most `limit` bytes, counted by inflating each one up to
 * what is left of the limit: the sizes a zip declares cannot be trusted, and exceljs inflates an
 * entry whole before it compares them. False when the zip cannot be read, uses zip64 (a workbook
 * of a few hundred questions never needs it), a method other than stored and deflate, or points
 * several entries at the same bytes.
 */
export function zipUnpacksWithin(buffer: Buffer, limit: number): boolean {
  const END = 0x06054b50;
  const ENTRY = 0x02014b50;
  const LOCAL = 0x04034b50;
  const lowest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let at = buffer.length - 22; at >= lowest; at -= 1) {
    if (buffer.readUInt32LE(at) !== END) continue;
    const entries = buffer.readUInt16LE(at + 10);
    let offset = buffer.readUInt32LE(at + 16);
    if (entries === 0xffff || offset === 0xffffffff) return false;
    let packed = 0;
    let unpacked = 0;
    for (let n = 0; n < entries; n += 1) {
      if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== ENTRY) return false;
      const method = buffer.readUInt16LE(offset + 10);
      const size = buffer.readUInt32LE(offset + 20);
      const local = buffer.readUInt32LE(offset + 42);
      if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== LOCAL) return false;
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      // Entries sharing their bytes would be inflated again and again.
      packed += size;
      if (start + size > buffer.length || packed > buffer.length) return false;
      if (method === 0) unpacked += size;
      else if (method === 8) {
        try {
          const data = buffer.subarray(start, start + size);
          unpacked += inflateRawSync(data, { maxOutputLength: limit - unpacked + 1 }).length;
        } catch {
          // A broken stream, or more than what is left of the limit (ERR_BUFFER_TOO_LARGE).
          return false;
        }
      } else return false;
      if (unpacked > limit) return false;
      offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    }
    return true;
  }
  return false;
}

/** AC-3: the template of a JD's bank, with the blueprint cells on the guide sheet of the `.xlsx`. */
export async function buildImportTemplate(format: QuestionImportFormat, cells: readonly CellCoverage[]): Promise<Buffer> {
  if (format === 'csv') {
    // UTF-8 with BOM, so a spreadsheet opens the Vietnamese headers right; commas between them.
    return Buffer.from(`\uFEFF${QUESTION_IMPORT_HEADERS.join(',')}\r\n`, 'utf8');
  }
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(QUESTION_SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = QUESTION_IMPORT_HEADERS.map((header) => ({ header, width: columnWidth(header) }));
  sheet.getRow(1).font = { bold: true };
  const lists: [string, readonly string[]][] = [
    [QUESTION_IMPORT_COLUMNS.type, Object.values(QUESTION_IMPORT_TYPE_LABELS)],
    [QUESTION_IMPORT_COLUMNS.difficulty, Object.values(QUESTION_IMPORT_DIFFICULTY_LABELS)],
    [QUESTION_IMPORT_COLUMNS.correctOption, OPTION_LETTERS],
  ];
  for (const [header, values] of lists) {
    const column = QUESTION_IMPORT_HEADERS.indexOf(header) + 1;
    for (let r = 2; r <= MANUAL_QUESTION_IMPORT_MAX_ROWS + 1; r += 1) {
      sheet.getCell(r, column).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${values.join(',')}"`],
      };
    }
  }

  const guide = workbook.addWorksheet(GUIDE_SHEET);
  guide.columns = [{ width: 16 }, { width: 28 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 12 }];
  const lines = [
    'Mỗi dòng của sheet "Câu hỏi" là một câu. Không đổi tên cột; để trống các cột không dùng.',
    'Trắc nghiệm: Đề, Phương án A–D, Đáp án đúng (A, B, C hoặc D), Giải thích.',
    `Tự luận: Đề, Đáp án mẫu, Giải thích, từ 1 đến ${RUBRIC_MAX_CRITERIA} cặp Tiêu chí/Điểm (điểm nguyên 1–${RUBRIC_MAX_POINTS}).`,
    'Loại, Kỹ năng và Độ khó phải là một ô của ma trận đề dưới đây (phần A trắc nghiệm, phần B tự luận).',
    `Tối đa ${MANUAL_QUESTION_IMPORT_MAX_ROWS} câu một file, 5 MB. Không dùng công thức. CSV: UTF-8, phân cách bằng dấu phẩy.`,
  ];
  for (const line of lines) guide.addRow([line]);
  guide.addRow([]);
  const head = guide.addRow(['Loại', 'Kỹ năng', 'Độ khó', 'Đang có (dùng được)', 'Cần tối thiểu', 'Tối đa']);
  head.font = { bold: true };
  for (const cell of cells) {
    guide.addRow([
      QUESTION_IMPORT_TYPE_LABELS[cell.type],
      cell.skill,
      QUESTION_IMPORT_DIFFICULTY_LABELS[cell.difficulty],
      cell.usable,
      cell.min,
      cell.max,
    ]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function columnWidth(header: string): number {
  if (header === QUESTION_IMPORT_COLUMNS.stem || header === QUESTION_IMPORT_COLUMNS.explanation) return 48;
  if (header === QUESTION_IMPORT_COLUMNS.sampleAnswer || header.startsWith('Tiêu chí') || header.startsWith('Phương án')) {
    return 28;
  }
  return 14;
}
