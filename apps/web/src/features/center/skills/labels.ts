import type { SkillGroup, SkillStatus } from '@srm/shared';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';

// Skill catalogue wording of the admin portal (US-2.5, DESIGN.md §9: no codes on screen).

export const SKILL_GROUP_LABELS: Record<SkillGroup, string> = {
  LANGUAGE: 'Ngôn ngữ lập trình',
  FRAMEWORK: 'Framework, thư viện',
  DATABASE: 'Cơ sở dữ liệu',
  CLOUD_DEVOPS: 'Cloud, DevOps',
  TOOL: 'Công cụ',
  TESTING: 'Kiểm thử',
  DATA_AI: 'Dữ liệu, AI',
  METHODOLOGY: 'Phương pháp, quy trình',
  SOFT_SKILL: 'Kỹ năng mềm',
  OTHER: 'Khác',
};

export const SKILL_STATUS_LABELS: Record<SkillStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  MERGED: 'Đã gộp',
  REJECTED: 'Đã từ chối',
};

/** The skill that already holds a name (409 SKILL_NAME_TAKEN, CONTEXT D39). */
export interface NameOwner {
  name: string;
  skillId: number;
  canonicalName: string;
  status: SkillStatus;
}

export function nameOwnerOf(error: unknown): NameOwner | null {
  if (!(error instanceof ApiRequestError) || error.body?.code !== 'SKILL_NAME_TAKEN') return null;
  const details = error.body.details ?? {};
  const { name, skillId, canonicalName, status } = details;
  if (typeof name !== 'string' || typeof skillId !== 'number' || typeof canonicalName !== 'string') return null;
  if (typeof status !== 'string' || !(status in SKILL_STATUS_LABELS)) return null;
  return { name, skillId, canonicalName, status: status as SkillStatus };
}

/** Why a review action failed, naming the skill that holds a taken name. */
export function skillReviewErrorMessage(error: unknown): string {
  const owner = nameOwnerOf(error);
  if (owner === null) {
    if (error instanceof ApiRequestError && error.body?.details?.reasonCode === 'MERGE_TARGET_NOT_APPROVED') {
      return 'Chỉ gộp được vào kỹ năng đã duyệt. Tải lại trang rồi chọn kỹ năng khác.';
    }
    return apiErrorMessage(error);
  }
  if (owner.status === 'APPROVED') {
    return `Tên “${owner.name}” trùng với kỹ năng “${owner.canonicalName}” đã có trong danh mục. Gộp vào kỹ năng đó thay vì duyệt mới.`;
  }
  if (owner.status === 'PENDING') {
    return `Tên “${owner.name}” trùng với kỹ năng “${owner.canonicalName}” cũng đang chờ duyệt. Duyệt kỹ năng đó trước rồi gộp kỹ năng này vào.`;
  }
  return `Tên “${owner.name}” trùng với kỹ năng “${owner.canonicalName}” đã bị từ chối hoặc đã gộp. Đặt tên khác.`;
}
