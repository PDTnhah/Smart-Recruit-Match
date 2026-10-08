import type { Role } from '@srm/shared';

/** How roles read in the UI (DESIGN.md §9); code names never appear on screen. */
export const ROLE_LABELS: Record<Role, string> = {
  CENTER: 'Cán bộ Trung tâm',
  STUDENT: 'Sinh viên',
  HR: 'Doanh nghiệp (HR)',
  ADMIN: 'Quản trị',
};
