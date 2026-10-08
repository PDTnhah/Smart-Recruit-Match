import type { Portal, Role } from '@srm/shared';
import {
  Bot,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarRange,
  ChartColumn,
  ClipboardCheck,
  Coins,
  FileText,
  House,
  LayoutDashboard,
  ListOrdered,
  type LucideIcon,
  Shuffle,
  Tags,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react';

// Menus of the three portals (DESIGN.md §12). A story that ships a screen adds its route in
// router.tsx; until then the item opens the "coming soon" page. `roles` hides items from roles
// that may not use them; the API still enforces access (CONTEXT D25).

export interface NavItem {
  /** Segment under the portal; '' is the portal home. */
  segment: string;
  title: string;
  icon: LucideIcon;
  roles: readonly Role[];
}

const STUDENT: readonly Role[] = ['STUDENT'];
const HR: readonly Role[] = ['HR'];
const CENTER: readonly Role[] = ['CENTER'];
const ADMIN: readonly Role[] = ['ADMIN'];
const CENTER_AND_ADMIN: readonly Role[] = ['CENTER', 'ADMIN'];

export const PORTAL_TITLES: Record<Portal, string> = {
  '/sv': 'Cổng sinh viên',
  '/hr': 'Cổng doanh nghiệp',
  '/admin': 'Cổng Trung tâm',
};

export const NAVIGATION: Record<Portal, readonly NavItem[]> = {
  // At most five items: they form the bottom bar on phones (DESIGN.md §5).
  '/sv': [
    { segment: '', title: 'Trang chủ', icon: House, roles: STUDENT },
    { segment: 'cv', title: 'Hồ sơ', icon: FileText, roles: STUDENT },
    { segment: 'preferences', title: 'Nguyện vọng', icon: ListOrdered, roles: STUDENT },
    { segment: 'exams', title: 'Bài test', icon: ClipboardCheck, roles: STUDENT },
    { segment: 'results', title: 'Kết quả', icon: Trophy, roles: STUDENT },
  ],
  '/hr': [
    { segment: '', title: 'Tổng quan', icon: LayoutDashboard, roles: HR },
    { segment: 'job-descriptions', title: 'Tin tuyển dụng', icon: Briefcase, roles: HR },
    { segment: 'nominations', title: 'Ứng viên được đề cử', icon: Users, roles: HR },
    { segment: 'interviews', title: 'Phỏng vấn', icon: CalendarClock, roles: HR },
  ],
  '/admin': [
    { segment: '', title: 'Tổng quan', icon: LayoutDashboard, roles: CENTER_AND_ADMIN },
    { segment: 'campaigns', title: 'Đợt thực tập', icon: CalendarRange, roles: CENTER },
    { segment: 'companies', title: 'Doanh nghiệp', icon: Building2, roles: CENTER },
    { segment: 'job-descriptions', title: 'Tin tuyển dụng', icon: Briefcase, roles: CENTER },
    { segment: 'allocation', title: 'Phân bổ', icon: Shuffle, roles: CENTER },
    { segment: 'reports', title: 'Báo cáo', icon: ChartColumn, roles: CENTER },
    { segment: 'users', title: 'Tài khoản', icon: UserCog, roles: ADMIN },
    { segment: 'skills', title: 'Danh mục kỹ năng', icon: Tags, roles: ADMIN },
    { segment: 'ai-config', title: 'Cấu hình AI', icon: Bot, roles: ADMIN },
    { segment: 'ai-costs', title: 'Chi phí AI', icon: Coins, roles: ADMIN },
  ],
};

export function navigationFor(portal: Portal, role: Role): NavItem[] {
  return NAVIGATION[portal].filter((item) => item.roles.includes(role));
}

export function navItemPath(portal: Portal, item: NavItem): string {
  return item.segment ? `${portal}/${item.segment}` : portal;
}
