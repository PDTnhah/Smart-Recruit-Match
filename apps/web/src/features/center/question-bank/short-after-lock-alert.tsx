import type { ExamBlueprintView } from '@srm/shared';
import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatNumber } from '@/lib/format';
import { cellLabel, QUESTION_TYPE_LABELS } from './labels';

/**
 * US-4.9 AC-4, US-4.11 AC-3: questions taken out after locking (a sample review, CENTER rejecting one, later
 * appeals) may leave a cell below its 3× floor, or below what one exam draws. No question is generated in their
 * place; CENTER is told here. A cell short of one exam's questions stops every exam not yet started (409
 * EXAM_BANK_INCOMPLETE). Nothing while the bank is open: "Sinh câu còn thiếu" fills the cell.
 */
export function ShortAfterLockAlert({ view }: { view: ExamBlueprintView }) {
  if (!view.locked) return null;
  const short = view.coverage.filter((cell) => cell.usable < cell.min);
  if (short.length === 0) return null;
  const undrawable = short.filter((cell) => cell.usable < cell.needed);
  return (
    <Alert variant={undrawable.length > 0 ? 'destructive' : 'default'}>
      <TriangleAlert />
      <AlertTitle>{undrawable.length > 0 ? 'Phòng thi không rút được đề' : 'Có ô thiếu câu sau khi loại câu'}</AlertTitle>
      <AlertDescription>
        <p>
          {undrawable.length > 0
            ? 'Có ô không còn đủ câu cho một đề, nên sinh viên chưa làm bài sẽ không bắt đầu được bài test.'
            : 'Câu bị loại sau khi khóa (Trung tâm loại câu, báo lỗi khi duyệt đề mẫu, phúc khảo) làm các ô dưới đây còn ít hơn 3 lần số câu của một đề. Sinh viên có thể nhận đề trùng nhau nhiều hơn.'}{' '}
          Ngân hàng đã khóa nên không sinh câu thay thế.
        </p>
        <ul className="flex flex-col gap-1">
          {short.map((cell) => (
            <li key={`${cell.part}-${cell.skill}-${cell.difficulty}`} className="break-words tabular-nums">
              {cellLabel(cell.skill, cell.difficulty)} ({QUESTION_TYPE_LABELS[cell.type].toLowerCase()}): còn{' '}
              {formatNumber(cell.usable)} câu, một đề rút {formatNumber(cell.needed)}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
