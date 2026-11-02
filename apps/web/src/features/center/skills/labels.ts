import type { SkillFamily, SkillGroup, SkillStatus, SkillZone } from '@srm/shared';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';

// Skill catalogue wording of the admin portal (US-2.5, US-2.7, DESIGN.md §9: no codes on screen).

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

/** Fields of work (FR-39, CONTEXT D43). */
export const SKILL_ZONE_LABELS: Record<SkillZone, string> = {
  FOUNDATION: 'Nền tảng',
  BACKEND: 'Backend',
  FRONTEND: 'Frontend',
  MOBILE: 'Di động',
  DATABASE: 'Cơ sở dữ liệu',
  DATA_AI: 'Dữ liệu, AI',
  DEVOPS_CLOUD: 'DevOps, Cloud',
  TESTING_QA: 'Kiểm thử, QA',
  BUSINESS_ANALYSIS: 'Phân tích nghiệp vụ',
  PROCESS: 'Quy trình, quản lý dự án',
  SECURITY_NETWORK: 'Bảo mật, mạng',
  EMBEDDED_IOT: 'Nhúng, IoT',
  GAME_DEV: 'Phát triển game',
  BLOCKCHAIN: 'Blockchain',
  SOFT_SKILL: 'Kỹ năng mềm',
};

/**
 * Families of skills that stand in for each other; the soft-skill ones are the standard
 * competencies of PRD › Kỹ năng mềm. Examples only where the name alone is unclear.
 */
export const SKILL_FAMILY_LABELS: Record<SkillFamily, string> = {
  SYSTEMS_LANGUAGE: 'Ngôn ngữ hệ thống (C, C++, Rust)',
  MANAGED_LANGUAGE: 'Ngôn ngữ ứng dụng (Java, C#, Go…)',
  SCRIPTING_LANGUAGE: 'Ngôn ngữ kịch bản (Python, PHP, Ruby)',
  SOFTWARE_DESIGN: 'Thiết kế phần mềm',
  ALGORITHMS: 'Cấu trúc dữ liệu, giải thuật',
  VERSION_CONTROL: 'Quản lý mã nguồn',
  IDE: 'Môi trường lập trình (IDE)',
  FOREIGN_LANGUAGE: 'Ngoại ngữ',
  BACKEND_FRAMEWORK: 'Framework backend',
  ORM: 'ORM',
  WEB_API: 'Web API',
  MESSAGE_BROKER: 'Message broker',
  SOFTWARE_ARCHITECTURE: 'Kiến trúc phần mềm',
  JVM_BUILD_TOOL: 'Công cụ build JVM',
  JS_TS: 'JavaScript, TypeScript',
  WEB_MARKUP_STYLING: 'HTML, CSS',
  SPA_FRAMEWORK: 'Framework SPA',
  META_FRAMEWORK: 'Meta-framework (Next.js, Nuxt.js)',
  DOM_LIBRARY: 'Thư viện DOM',
  STATE_MANAGEMENT: 'Quản lý state',
  FRONTEND_BUILD: 'Công cụ build frontend',
  UI_DESIGN: 'Thiết kế giao diện',
  NATIVE_MOBILE_PLATFORM: 'Nền tảng di động',
  NATIVE_UI_TOOLKIT: 'Bộ giao diện native',
  MOBILE_LANGUAGE: 'Ngôn ngữ di động',
  CROSS_PLATFORM_MOBILE: 'Di động đa nền tảng',
  SQL: 'SQL',
  RELATIONAL_DB: 'CSDL quan hệ',
  NOSQL_DB: 'CSDL NoSQL',
  AI_FIELD: 'Lĩnh vực AI',
  ML_FRAMEWORK: 'Framework học máy',
  PYTHON_DATA_TOOL: 'Thư viện dữ liệu Python',
  DATA_ANALYTICS: 'Phân tích dữ liệu',
  NUMERIC_LANGUAGE: 'Ngôn ngữ tính toán (R, MATLAB)',
  BI_TOOL: 'Công cụ BI',
  DATA_ENGINEERING: 'Kỹ thuật dữ liệu',
  BIG_DATA: 'Dữ liệu lớn',
  CONTAINERIZATION: 'Container',
  CLOUD_PROVIDER: 'Nhà cung cấp cloud',
  CI_CD: 'CI/CD',
  IAC: 'Hạ tầng dạng mã (IaC)',
  LINUX_SHELL: 'Linux, shell',
  WEB_SERVER: 'Web server',
  MONITORING: 'Giám sát hệ thống',
  MANUAL_QA: 'Kiểm thử thủ công',
  TEST_AUTOMATION: 'Kiểm thử tự động',
  UNIT_TESTING: 'Kiểm thử đơn vị',
  API_TESTING: 'Kiểm thử API',
  PERFORMANCE_TESTING: 'Kiểm thử hiệu năng',
  REQUIREMENTS: 'Phân tích yêu cầu',
  MODELING_NOTATION: 'Ký pháp mô hình hóa (UML, BPMN)',
  SOFTWARE_PROCESS: 'Quy trình phát triển',
  PROJECT_TOOL: 'Công cụ quản lý dự án',
  NETWORKING: 'Mạng máy tính',
  INFORMATION_SECURITY: 'An toàn thông tin',
  EMBEDDED_SYSTEMS: 'Hệ thống nhúng, IoT',
  GAME_ENGINE: 'Game engine',
  BLOCKCHAIN_PLATFORM: 'Nền tảng blockchain',
  COMMUNICATION: 'Giao tiếp',
  TEAMWORK: 'Làm việc nhóm',
  LEADERSHIP: 'Lãnh đạo',
  PROBLEM_SOLVING: 'Giải quyết vấn đề',
  PRESENTATION: 'Thuyết trình',
  CRITICAL_THINKING: 'Tư duy phản biện',
  SELF_LEARNING: 'Tự học',
  TIME_MANAGEMENT: 'Quản lý thời gian',
  PROACTIVENESS: 'Chủ động',
  RESPONSIBILITY: 'Trách nhiệm',
  ADAPTABILITY: 'Thích nghi',
  ATTENTION_TO_DETAIL: 'Cẩn thận',
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

/** The skill names of the cycle a 422 SKILL_IMPLICATION_CYCLE found, from a skill back to it. */
function cycleOf(error: unknown): string[] | null {
  if (!(error instanceof ApiRequestError) || error.body?.code !== 'SKILL_IMPLICATION_CYCLE') return null;
  const path = error.body.details?.path;
  if (!Array.isArray(path)) return null;
  const names = path.map((step) => (step as { canonicalName?: unknown }).canonicalName);
  return names.every((name) => typeof name === 'string') ? names : null;
}

/** Why a review action failed, naming the skill that holds a taken name or the cycle closed. */
export function skillReviewErrorMessage(error: unknown): string {
  const cycle = cycleOf(error);
  if (cycle !== null) {
    return `Quan hệ kéo theo tạo thành vòng lặp: ${cycle.join(' ⇒ ')}. Bỏ một kỹ năng trong vòng lặp rồi lưu lại.`;
  }
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
