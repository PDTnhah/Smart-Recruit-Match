import type { EvidenceSection, IneligibleReason, MajorMatch, MatchKind, MatchVerdict } from '@srm/shared';
import { formatNumber } from '@/lib/format';

// Wording of the "Nguyện vọng" screen (US-3.3, DESIGN.md §9): no code reaches the screen. Skill
// levels, zones, position groups and work modes reuse the labels of the JD and catalogue screens.

/** PRD › S_cv: the three verdicts as the student reads them (AC-14). */
export const VERDICT_LABELS: Record<MatchVerdict, string> = {
  MET: 'Đáp ứng',
  PARTIAL: 'Một phần',
  NOT_MET: 'Không có bằng chứng',
};

/** How a JD skill was found in the CV (AC-16, PRD › Luật khớp kỹ năng); null when it was not. */
export function matchKindLabel(kind: MatchKind, via: string | null): string | null {
  switch (kind) {
    case 'EXACT':
      return 'Đúng kỹ năng';
    case 'IMPLIED':
      return `Kéo theo từ ${via ?? 'kỹ năng khác'}`;
    case 'FAMILY':
      return `Cùng họ với ${via ?? 'kỹ năng khác'}`;
    case 'NONE':
      return null;
  }
}

/** PRD › Khung quy đổi mức bằng chứng, T0–T4 by index. */
export const EVIDENCE_TIER_LABELS: readonly string[] = ['Không có', 'Đã nêu', 'Đã dùng', 'Dùng nhiều', 'Thành thạo'];

/** The CV list a piece of evidence comes from. */
export const EVIDENCE_SECTION_LABELS: Record<EvidenceSection, string> = {
  SKILLS_LIST: 'Danh sách kỹ năng',
  PROJECT: 'Dự án',
  EXPERIENCE: 'Kinh nghiệm',
  CERTIFICATE: 'Chứng chỉ',
};

/** PRD › S_cv › Học vấn: đúng / gần / khác ngành. */
export const MAJOR_MATCH_LABELS: Record<MajorMatch, string> = {
  EXACT: 'Đúng ngành JD yêu cầu',
  RELATED: 'Ngành gần với ngành JD yêu cầu',
  OTHER: 'Ngành khác với ngành JD yêu cầu',
};

const gpa = (value: number) => formatNumber(value, 2);
const list = (values: readonly string[]) => values.join(', ');

/** One failed hard condition, with what the JD asks and what the student has (AC-2, AC-16). */
export function ineligibleReasonText(reason: IneligibleReason): string {
  switch (reason.code) {
    case 'MAJOR_NOT_ALLOWED':
      return `JD chỉ nhận các ngành ${list(reason.required)}; ngành trong hồ sơ là ${reason.actual}.`;
    case 'MAJOR_MISSING':
      return `JD chỉ nhận các ngành ${list(reason.required)}; hồ sơ chưa có ngành học.`;
    case 'YEAR_BELOW_MIN':
      return `JD nhận sinh viên từ năm ${reason.required}; hồ sơ ghi năm ${reason.actual}.`;
    case 'YEAR_MISSING':
      return `JD nhận sinh viên từ năm ${reason.required}; hồ sơ chưa cho biết năm học.`;
    case 'GPA_BELOW_MIN':
      return `JD yêu cầu GPA từ ${gpa(reason.required)}/4; GPA hiện tại là ${gpa(reason.actual)}/4.`;
    case 'GPA_MISSING':
      return `JD yêu cầu GPA từ ${gpa(reason.required)}/4; trường chưa có GPA của sinh viên.`;
    case 'LANGUAGE_NOT_MET':
      return reason.actual.length > 0
        ? `JD yêu cầu ${reason.required}; hồ sơ có ${reason.actual.join('; ')}.`
        : `JD yêu cầu ${reason.required}; hồ sơ chưa có ngoại ngữ hay chứng chỉ nào.`;
  }
}

/**
 * A value stored × 100 (S_cv, a criterion score, a contribution), with only the decimals it has:
 * 72, 72,5 or 72,35.
 */
export function formatX100(valueX100: number): string {
  const rounded = Math.round(valueX100);
  const digits = rounded % 100 === 0 ? 0 : rounded % 10 === 0 ? 1 : 2;
  return formatNumber(rounded / 100, digits);
}

/** A weight in basis points as a percentage: 4 000 → 40 %, 1 765 → 17,65 %. */
export function formatBasisPoints(bp: number): string {
  return `${formatX100(bp)} %`;
}
