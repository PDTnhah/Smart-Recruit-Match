import type { CampaignDeadlineKey, Notification } from '@srm/shared';
import { formatDateTime } from '@/lib/format';

// What each notification type says in the bell (DESIGN.md §9, §10). A type added in
// packages/shared/schemas/notification.ts gets its wording here; TypeScript flags a missing case.

export interface NotificationView {
  title: string;
  body: string;
  /** Page the notification leads to, or null when there is nothing to open. */
  href: string | null;
}

const DEADLINES: Record<CampaignDeadlineKey, { title: string; task: string; href: string }> = {
  intake_end: { title: 'Sắp hết hạn nộp CV', task: 'nộp CV', href: '/sv/cv' },
  preference_end: { title: 'Sắp hết hạn chọn nguyện vọng', task: 'chọn nguyện vọng', href: '/sv/preferences' },
  testing_end: { title: 'Sắp hết hạn làm bài test', task: 'làm bài test', href: '/sv/exams' },
};

export function describeNotification(notification: Notification): NotificationView {
  switch (notification.type) {
    case 'CAMPAIGN_OPENED': {
      const { campaignName, intakeEnd } = notification.payload;
      return {
        title: 'Đợt thực tập đã mở',
        body: `Đợt "${campaignName}" nhận CV đến ${formatDateTime(intakeEnd)}.`,
        href: DEADLINES.intake_end.href,
      };
    }
    case 'DEADLINE_REMINDER': {
      const { campaignName, deadlineKey, deadline } = notification.payload;
      const { title, task, href } = DEADLINES[deadlineKey];
      return { title, body: `Hạn ${task} của đợt "${campaignName}" là ${formatDateTime(deadline)}.`, href };
    }
    case 'HR_INVITED':
      // Email only; listed never, typed for completeness.
      return { title: 'Lời mời tham gia hệ thống', body: 'Kiểm tra email để kích hoạt tài khoản.', href: null };
  }
}
