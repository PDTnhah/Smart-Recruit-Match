import type {
  ExamPart,
  QuestionBankLockBlocker,
  QuestionDifficulty,
  QuestionGenerationRunStatus,
  QuestionRejectReason,
  QuestionType,
} from '@srm/shared';
import type { VariantProps } from 'class-variance-authority';
import type { badgeVariants } from '@/components/ui/badge';

// Vietnamese labels of the question bank screen (US-4.1 AC-11, US-4.2 AC-10, DESIGN.md §9).

export const DIFFICULTY_LABELS: Readonly<Record<QuestionDifficulty, string>> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
};

export const QUESTION_TYPE_LABELS: Readonly<Record<QuestionType, string>> = {
  MCQ: 'Trắc nghiệm',
  ESSAY: 'Tự luận',
};

export const EXAM_PART_TITLES: Readonly<Record<ExamPart, string>> = {
  A: 'Phần A – Trắc nghiệm 4 phương án',
  B: 'Phần B – Tự luận chấm theo rubric',
};

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export const RUN_STATUS_LABELS: Readonly<Record<QuestionGenerationRunStatus, string>> = {
  RUNNING: 'Đang sinh câu',
  SUCCEEDED: 'Đã sinh xong',
  PARTIAL: 'Sinh chưa đủ',
  FAILED: 'Sinh câu lỗi',
};

/** DESIGN.md §6 › badge, for a finished run; a running or failed one shows as an `Alert`. */
export const RUN_STATUS_BADGE: Readonly<Record<'SUCCEEDED' | 'PARTIAL', BadgeVariant>> = {
  SUCCEEDED: 'default',
  PARTIAL: 'secondary',
};

/** Why a run failed, by `errorCode`; any other code gets the generic sentence. */
const RUN_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  STALE: 'Không nhận được kết quả từ AI trong thời gian chờ.',
  QUESTION_BANK_NOT_FOUND: 'Ngân hàng đã khóa hoặc JD không còn ở trạng thái đã duyệt khi AI bắt đầu sinh câu.',
};

export function runErrorMessage(errorCode: string | null): string {
  return (errorCode !== null && RUN_ERROR_MESSAGES[errorCode]) || 'AI gặp lỗi khi sinh câu hỏi.';
}

export const cellLabel = (skill: string, difficulty: QuestionDifficulty) => `${skill} – ${DIFFICULTY_LABELS[difficulty]}`;

/** Why the Validator rejected a question (US-4.2 AC-3), in the order of QUESTION_REJECT_REASONS. */
export const REJECT_REASON_LABELS: Readonly<Record<QuestionRejectReason, string>> = {
  ANSWER_MISMATCH: 'Sai đáp án',
  MULTIPLE_CORRECT: 'Nhiều đáp án đúng',
  OFF_SKILL: 'Lệch kỹ năng',
  ANSWER_LEAKED: 'Lộ đáp án',
  WEAK_DISTRACTORS: 'Phương án nhiễu yếu',
  UNCLEAR: 'Đề chưa rõ',
  RUBRIC_MISMATCH: 'Rubric không chấm được',
  DIFFICULTY_MISMATCH: 'Lệch độ khó',
  DUPLICATE: 'Trùng ý câu khác',
  VALIDATOR_REFUSAL: 'AI từ chối kiểm',
};

/** Why "Khóa ngân hàng" is off (US-4.2 AC-6, AC-11), in the order the API checks them. */
export const LOCK_BLOCKER_MESSAGES: Readonly<Record<QuestionBankLockBlocker, string>> = {
  LOCKED: 'Ngân hàng đã khóa.',
  GENERATION_RUNNING: 'AI đang sinh và kiểm câu. Chờ lượt sinh xong.',
  JD_OUTDATED: 'Yêu cầu của JD đã có phiên bản mới. Lưu lại ma trận đề trước.',
  INCOMPLETE: 'Còn ô chưa đủ câu đạt kiểm định.',
};
