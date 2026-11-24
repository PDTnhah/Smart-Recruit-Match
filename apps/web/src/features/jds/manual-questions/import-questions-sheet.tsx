import {
  MANUAL_QUESTION_IMPORT_MAX_ROWS,
  type ManualQuestionInput,
  MAX_UPLOAD_BYTES,
  QUESTION_IMPORT_COLUMNS,
  type QuestionImportFormat,
  type QuestionImportPreview,
  type QuestionImportRow,
} from '@srm/shared';
import { CircleAlert, CircleCheck, Download, FileUp, Upload } from 'lucide-react';
import { type ChangeEvent, useId, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatNumber } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { downloadImportTemplate, importFileErrorMessage, manualQuestionIssues, usePreviewImport, useSaveManualQuestions } from './api';

/** The columns the preview table shows; an error of another column is listed in the "Lỗi" cell. */
const SHOWN = [
  { key: 'type', column: QUESTION_IMPORT_COLUMNS.type },
  { key: 'skill', column: QUESTION_IMPORT_COLUMNS.skill },
  { key: 'difficulty', column: QUESTION_IMPORT_COLUMNS.difficulty },
  { key: 'stem', column: QUESTION_IMPORT_COLUMNS.stem },
] as const;

/** Where the issues of a save failed on the server land: the n-th question sent is the n-th row without error. */
function withSaveIssues(preview: QuestionImportPreview, error: unknown): QuestionImportPreview {
  const issues = manualQuestionIssues(error);
  if (issues.length === 0) return preview;
  const sent = preview.rows.filter((row) => row.issues.length === 0);
  const extra = new Map<QuestionImportRow, QuestionImportRow['issues']>();
  for (const issue of issues) {
    const row = sent[issue.index];
    if (!row) continue;
    const column = issue.field === 'stem' ? QUESTION_IMPORT_COLUMNS.stem : issue.field === null ? null : QUESTION_IMPORT_COLUMNS.skill;
    extra.set(row, [...(extra.get(row) ?? []), { column, code: issue.code, message: issue.message }]);
  }
  return { ...preview, rows: preview.rows.map((row) => ({ ...row, issues: [...row.issues, ...(extra.get(row) ?? [])] })) };
}

function PreviewTable({ preview }: { preview: QuestionImportPreview }) {
  return (
    <Table>
      <TableCaption className="text-left">
        Ô có lỗi được đánh dấu bằng biểu tượng cảnh báo; lỗi của cột khác ghi ở cột "Lỗi". Sửa trong file rồi tải lên lại.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">Dòng</TableHead>
          {SHOWN.map(({ column }) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
          <TableHead>Lỗi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {preview.rows.map((row) => {
          const columns = new Set(row.issues.map((issue) => issue.column));
          return (
            <TableRow key={row.row}>
              <TableCell className="align-top tabular-nums">{row.row}</TableCell>
              {SHOWN.map(({ key, column }) => {
                const invalid = columns.has(column);
                return (
                  <TableCell
                    key={key}
                    className={key === 'stem' ? 'max-w-72 align-top whitespace-normal' : 'align-top whitespace-normal'}
                    aria-invalid={invalid || undefined}
                  >
                    <span className={invalid ? 'flex items-start gap-1 text-destructive' : 'flex items-start gap-1'}>
                      {invalid && <CircleAlert aria-label="Có lỗi" className="mt-0.5 size-4 shrink-0" />}
                      <span className={key === 'stem' ? 'line-clamp-3 break-words' : 'break-words'}>{row[key] || '–'}</span>
                    </span>
                  </TableCell>
                );
              })}
              <TableCell className="min-w-56 align-top whitespace-normal">
                {row.issues.length === 0 ? (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <CircleCheck aria-hidden="true" className="size-4" />
                    Hợp lệ
                  </span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {row.issues.map((issue, index) => (
                      <li key={index} className="break-words">
                        {issue.column && <span className="font-medium">{issue.column}: </span>}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * "Import file" (US-4.13 AC-3, AC-4, AC-5, AC-10) in three steps: download the template, pick a file, read the
 * preview the server checked row by row. "Lưu N câu" is on only while no row has an error; the server checks every
 * row again and saves them all or none, so a row that broke a rule since (a cell filled meanwhile) comes back to the
 * table with its error. A wide side sheet from `md`, a bottom sheet on phones (DESIGN.md §5 item 7).
 */
export function ImportQuestionsSheet({ jdId, disabled }: { jdId: number; disabled: boolean }) {
  const isMobile = useIsMobile();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<QuestionImportPreview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState<QuestionImportFormat | null>(null);
  const read = usePreviewImport(jdId);
  const save = useSaveManualQuestions(jdId);
  const busy = read.isPending || save.isPending;

  function reset() {
    setFile(null);
    setPreview(null);
    setError(null);
    setProgress(0);
  }

  async function download(format: QuestionImportFormat) {
    setDownloading(format);
    try {
      await downloadImportTemplate(jdId, format);
    } catch (caught) {
      toast.error(apiErrorMessage(caught));
    } finally {
      setDownloading(null);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!picked) return;
    setFile(picked);
    setPreview(null);
    setError(null);
    if (picked.size > MAX_UPLOAD_BYTES) {
      setError(new Error('too large'));
      return;
    }
    setProgress(0);
    try {
      setPreview(await read.mutateAsync({ file: picked, onProgress: setProgress }));
    } catch (caught) {
      setError(caught);
    }
  }

  const valid = preview?.rows.filter((row) => row.issues.length === 0) ?? [];
  const invalidCount = (preview?.rows.length ?? 0) - valid.length;

  async function saveAll() {
    if (!preview || invalidCount > 0) return;
    setError(null);
    try {
      const result = await save.mutateAsync({
        origin: 'IMPORT',
        fileName: preview.fileName,
        questions: valid.map((row) => row.question).filter((question): question is ManualQuestionInput => question !== null),
      });
      setOpen(false);
      toast.success(`Đã thêm ${formatNumber(result.questionIds.length)} câu vào ngân hàng`);
    } catch (caught) {
      setPreview(withSaveIssues(preview, caught));
      setError(caught);
    }
  }

  // What is wrong with the file itself; any other error (a locked bank, a run) is not the file's fault.
  const unreadable =
    error instanceof Error && error.message === 'too large'
      ? 'File lớn hơn 5 MB. Chia thành nhiều file rồi import lần lượt.'
      : importFileErrorMessage(error);
  const fileError =
    error === null ? null : (unreadable ?? (manualQuestionIssues(error).length > 0 ? null : apiErrorMessage(error)));
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) reset();
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <FileUp data-icon="inline-start" />
          Import file
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'max-h-[85svh]' : 'data-[side=right]:md:max-w-4xl'}
      >
        <SheetHeader className="pr-12">
          <SheetTitle>Import câu hỏi từ file</SheetTitle>
          <SheetDescription>
            Tối đa {MANUAL_QUESTION_IMPORT_MAX_ROWS} câu, 5 MB mỗi file. Câu chỉ được lưu khi mọi dòng hợp lệ.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
          <ol className="flex flex-col gap-6">
            <li className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">1. Tải file mẫu</h3>
              <p className="text-sm text-muted-foreground">
                Bản .xlsx có sheet "Hướng dẫn" liệt kê các ô của ma trận đề và số câu mỗi ô đang có.
              </p>
              <div className="flex flex-wrap gap-2">
                {(['xlsx', 'csv'] as const).map((format) => (
                  <Button
                    key={format}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={downloading !== null}
                    onClick={() => void download(format)}
                  >
                    {downloading === format ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
                    Mẫu .{format}
                  </Button>
                ))}
              </div>
            </li>
            <li>
              <Field>
                <FieldLabel htmlFor={`${id}-file`}>
                  <span className="font-medium">2. Chọn file đã điền</span>
                </FieldLabel>
                <Input
                  id={`${id}-file`}
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={(event) => void upload(event)}
                  disabled={busy}
                />
                <FieldDescription>File .xlsx, hoặc .csv mã UTF-8 phân cách bằng dấu phẩy.</FieldDescription>
              </Field>
              {read.isPending && (
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={Math.round(progress * 100)} aria-label="Tiến độ tải file" className="flex-1" />
                  <span className="text-sm text-muted-foreground tabular-nums">{Math.round(progress * 100)}%</span>
                </div>
              )}
            </li>
            <li className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">3. Xem trước</h3>
              {fileError && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>
                    {unreadable === null ? 'Chưa import được' : `Không đọc được ${file ? `"${file.name}"` : 'file'}`}
                  </AlertTitle>
                  <AlertDescription>{fileError}</AlertDescription>
                </Alert>
              )}
              {read.isPending && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> Đang đọc và kiểm từng dòng…
                </p>
              )}
              {!preview && !read.isPending && !fileError && (
                <p className="text-sm text-muted-foreground">Chọn file để xem từng dòng trước khi lưu.</p>
              )}
              {preview && (
                <>
                  <p className="text-sm tabular-nums" aria-live="polite">
                    {formatNumber(preview.rows.length)} dòng ·{' '}
                    {invalidCount === 0 ? 'không có lỗi' : `${formatNumber(invalidCount)} dòng có lỗi`}
                  </p>
                  {manualQuestionIssues(error).length > 0 && (
                    <Alert variant="destructive">
                      <CircleAlert />
                      <AlertTitle>Chưa lưu câu nào</AlertTitle>
                      <AlertDescription>
                        Ngân hàng vừa thay đổi nên có dòng không còn hợp lệ. Sửa các dòng có lỗi rồi tải file lên lại.
                      </AlertDescription>
                    </Alert>
                  )}
                  <PreviewTable preview={preview} />
                </>
              )}
            </li>
          </ol>
        </div>
        <SheetFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button type="button" disabled={!preview || invalidCount > 0 || valid.length === 0 || busy} onClick={() => void saveAll()}>
            {save.isPending ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
            Lưu {formatNumber(valid.length)} câu
          </Button>
          <SheetClose asChild>
            <Button type="button" variant="outline" disabled={busy}>
              Hủy
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
