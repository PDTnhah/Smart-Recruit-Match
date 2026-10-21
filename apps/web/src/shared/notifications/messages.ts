import type { CampaignDeadlineKey, Notification } from '@srm/shared';
import { jdApprovalPath } from '@/features/center/jd-approval/paths';
import { hrJdPath } from '@/features/hr/jds/paths';
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
    case 'JD_REQUIREMENTS_READY': {
      const { jdId, jdTitle } = notification.payload;
      return {
        title: 'Yêu cầu chuẩn hóa JD sẵn sàng để xác nhận',
        body: `Hệ thống đã đề xuất yêu cầu cho JD "${jdTitle}". Kiểm tra, sửa nếu cần rồi xác nhận.`,
        href: hrJdPath(jdId),
      };
    }
    case 'JD_ANALYSIS_FAILED': {
      const { jdId, jdTitle } = notification.payload;
      return {
        title: 'Chưa phân tích được JD',
        body: `Hệ thống không trích được yêu cầu của JD "${jdTitle}". Nhập yêu cầu bằng tay rồi xác nhận.`,
        href: hrJdPath(jdId),
      };
    }
    case 'JD_REQUIREMENTS_VERSIONED': {
      const { jdId, jdTitle, companyName, version } = notification.payload;
      return {
        title: 'Yêu cầu JD có phiên bản mới',
        body: `JD "${jdTitle}" của ${companyName} vừa chuyển sang phiên bản yêu cầu ${version}.`,
        href: jdApprovalPath(jdId),
      };
    }
  }
}
