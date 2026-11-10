import type { CampaignDeadlineKey, Notification } from '@srm/shared';
import { campaignPath } from '@/features/center/campaigns/paths';
import { examResultPath } from '@/features/exam/paths';
import { centerCvsPath } from '@/features/center/cvs/paths';
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
    case 'CV_PROFILE_READY': {
      const { campaignId, campaignName } = notification.payload;
      return {
        title: 'Hồ sơ năng lực sẵn sàng để xác nhận',
        body: `Hệ thống đã trích hồ sơ năng lực từ CV của đợt "${campaignName}".`,
        href: `${DEADLINES.intake_end.href}?campaign=${campaignId}`,
      };
    }
    case 'CV_ANALYSIS_FAILED': {
      const { campaignId, campaignName } = notification.payload;
      return {
        title: 'Chưa phân tích được CV',
        body: `Hệ thống không đọc được CV của đợt "${campaignName}". Tải lên lại CV trước hạn nộp.`,
        href: `${DEADLINES.intake_end.href}?campaign=${campaignId}`,
      };
    }
    case 'CV_NEEDS_ATTENTION': {
      const { campaignId, campaignName, reason } = notification.payload;
      return {
        title: reason === 'HIDDEN_TEXT' ? 'CV có chữ ẩn' : 'Có CV không phân tích được',
        body:
          reason === 'HIDDEN_TEXT'
            ? `Một CV của đợt "${campaignName}" có chữ ẩn; phần chữ ẩn đã bị loại trước khi phân tích.`
            : `Một CV của đợt "${campaignName}" không phân tích được. Sinh viên đã được báo tải lại.`,
        href: centerCvsPath(campaignId),
      };
    }
    case 'PREFERENCES_AUTO_ASSIGNED': {
      const { campaignName, count } = notification.payload;
      return {
        title: 'Hệ thống đã chọn nguyện vọng cho bạn',
        body: `Bạn chưa chọn nguyện vọng của đợt "${campaignName}" trước hạn, nên hệ thống đã chọn ${count} JD phù hợp nhất trong danh sách gợi ý.`,
        href: DEADLINES.preference_end.href,
      };
    }
    case 'EXAM_NOT_TAKEN': {
      const { campaignName, rank, jdTitle } = notification.payload;
      return {
        title: `Nguyện vọng ${rank} đã bị hủy`,
        body: `Bạn chưa làm bài test cho "${jdTitle}" trước hạn của đợt "${campaignName}", nên nguyện vọng này không được xét phân bổ.`,
        href: DEADLINES.testing_end.href,
      };
    }
    case 'EXAM_RESULT_PUBLISHED': {
      const { rank, jdTitle, sessionId } = notification.payload;
      return {
        title: `Đã có kết quả test nguyện vọng ${rank}`,
        body: `Bài test cho "${jdTitle}" đã được chấm. Xem điểm và nhận xét từng câu tự luận.`,
        href: examResultPath(sessionId),
      };
    }
    case 'JD_LOW_PREFERENCES': {
      const { campaignId, campaignName, jds } = notification.payload;
      return {
        title: 'Có JD ít nguyện vọng hơn chỉ tiêu',
        body: `Đợt "${campaignName}" có ${jds.length} JD có số nguyện vọng ít hơn chỉ tiêu. Xem email để có danh sách và liên hệ doanh nghiệp.`,
        href: campaignPath(campaignId),
      };
    }
  }
}
