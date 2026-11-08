import type { ExamPart, MyExamStatus } from '@srm/shared';
import type { VariantProps } from 'class-variance-authority';
import type { badgeVariants } from '@/components/ui/badge';
import { formatMinutes } from '@/lib/format';
import type { SaveStatus } from './use-exam-autosave';

// Wording of the exam screens (US-4.3, DESIGN.md §9): no code reaches the screen.

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export const PART_LABELS: Record<ExamPart, string> = {
  A: 'Phần A – Trắc nghiệm',
  B: 'Phần B – Tự luận',
};

/** Where the test of a preference stands (AC-14). */
export const MY_EXAM_STATUS_LABELS: Record<MyExamStatus, string> = {
  NOT_STARTED: 'Chưa làm',
  IN_PROGRESS: 'Đang làm',
  SUBMITTED: 'Đã nộp',
  EXPIRED: 'Hết giờ',
  CLOSED: 'Đã hủy',
};

/** Waiting `outline`, running `default`, over `secondary` (DESIGN.md §6 `badge`). */
export const MY_EXAM_STATUS_BADGE: Record<MyExamStatus, BadgeVariant> = {
  NOT_STARTED: 'outline',
  IN_PROGRESS: 'default',
  SUBMITTED: 'secondary',
  EXPIRED: 'secondary',
  CLOSED: 'secondary',
};

/** The save indicator of the room (AC-13). */
export const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  SAVED: 'Đã lưu',
  SAVING: 'Đang lưu…',
  OFFLINE: 'Mất kết nối – sẽ lưu lại',
  RETRYING: 'Chưa lưu được – sẽ thử lại',
  CLOSED: 'Bài đã đóng',
};

/** A, B, C… for the options in the order shown; the codes the server knows stay hidden. */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** "45 phút" or less: `secondsIfStartedNow` as the student reads it. */
export function minutesLeftText(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes < 1 ? 'dưới 1 phút' : formatMinutes(minutes);
}
