import type { ExamGradingReason, GradingConfidence, GradingFlag, ManualGradePublication } from '@srm/shared';
import { formatNumber } from '@/lib/format';

// Vietnamese labels of "Chấm tay" (US-4.5, DESIGN.md §9).

/** Why the Grader handed an essay over (CONTEXT D53). */
export const GRADING_REASON_LABELS: Record<ExamGradingReason, string> = {
  RUNS_DIVERGE: 'Hai lượt AI lệch điểm',
  LOW_CONFIDENCE: 'AI không chắc chắn',
  FLAGGED: 'Có cờ cảnh báo',
  AI_FAILED: 'AI không chấm được',
  NEAR_THRESHOLD: 'Sát ngưỡng điểm test',
};

export const GRADING_REASON_DESCRIPTIONS: Record<ExamGradingReason, string> = {
  RUNS_DIVERGE: 'Hai lượt chấm của AI lệch nhau hơn 15% số điểm của câu.',
  LOW_CONFIDENCE: 'Một lượt chấm của AI tự đánh giá độ tin cậy thấp.',
  FLAGGED: 'AI đánh dấu bài làm, ví dụ bài làm chứa câu ra lệnh cho người chấm.',
  AI_FAILED: 'Một lượt chấm của AI không có kết quả.',
  NEAR_THRESHOLD: 'Điểm test tính theo điểm của AI cách ngưỡng θ_test không quá 5 điểm, nên mọi câu tự luận của bài được chấm lại.',
};

export const CONFIDENCE_LABELS: Record<GradingConfidence, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
};

export const FLAG_LABELS: Record<GradingFlag, string> = {
  INSTRUCTION_IN_ANSWER: 'Bài làm chứa câu ra lệnh cho người chấm',
};

/** What saving a grade did to the session's results (AC-5). */
export function publicationMessage(publication: ManualGradePublication, remainingAnswers: number): string {
  switch (publication) {
    case 'PUBLISHED':
      return 'Đã lưu điểm. Bài đã chấm xong và kết quả đã gửi cho sinh viên.';
    case 'AFTER_TESTING_END':
      return 'Đã lưu điểm. Bài đã chấm xong; kết quả được công bố sau khi hết pha làm test.';
    case 'WAITING_OTHER_ANSWERS':
      return `Đã lưu điểm. Bài còn ${formatNumber(remainingAnswers)} câu chờ chấm.`;
    case 'NEXT_SWEEP':
      return 'Đã lưu điểm. Chưa công bố được kết quả của bài; tác vụ chấm định kỳ sẽ thử công bố lại.';
  }
}
