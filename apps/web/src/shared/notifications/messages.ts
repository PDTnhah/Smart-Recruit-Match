import {
  CAMPAIGN_NOTICE_DEADLINE_NAMES,
  INTERVIEW_MODE_LABELS,
  type CampaignDeadlineKey,
  type CampaignNoticeAudience,
  type Notification,
} from '@srm/shared';
import { campaignPath } from '@/features/center/campaigns/paths';
import { examResultPath } from '@/features/exam/paths';
import { centerCvsPath } from '@/features/center/cvs/paths';
import { jdApprovalPath } from '@/features/center/jd-approval/paths';
import { allocationPath } from '@/features/center/allocation/paths';
import { HR_JDS_PATH, hrJdInterviewsPath, hrJdNominationsPath, hrJdPath } from '@/features/hr/jds/paths';
import { STUDENT_RESULTS_PATH } from '@/features/student/results/paths';
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

/** "Hồ sơ" of the campaign named: without `?campaign=` it opens the one holding the CV (US-1.8). */
const profileOf = (campaignId: number) => `${DEADLINES.intake_end.href}?campaign=${campaignId}`;

/** Home of each portal: a cancelled campaign has no page left to open (US-1.10 AC-8). */
const HOME_OF: Record<CampaignNoticeAudience, string> = { STUDENT: '/sv', HR: '/hr' };

export function describeNotification(notification: Notification): NotificationView {
  switch (notification.type) {
    case 'CAMPAIGN_OPENED': {
      const { campaignId, campaignName, intakeEnd } = notification.payload;
      return {
        title: 'Đợt thực tập đã mở',
        body: `Đợt "${campaignName}" nhận CV đến ${formatDateTime(intakeEnd)}.`,
        href: profileOf(campaignId),
      };
    }
    case 'DEADLINE_REMINDER': {
      const { campaignId, campaignName, deadlineKey, deadline } = notification.payload;
      const { title, task, href } = DEADLINES[deadlineKey];
      return {
        title,
        body: `Hạn ${task} của đợt "${campaignName}" là ${formatDateTime(deadline)}.`,
        href: deadlineKey === 'intake_end' ? profileOf(campaignId) : href,
      };
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
        href: profileOf(campaignId),
      };
    }
    case 'CV_ANALYSIS_FAILED': {
      const { campaignId, campaignName } = notification.payload;
      return {
        title: 'Chưa phân tích được CV',
        body: `Hệ thống không đọc được CV của đợt "${campaignName}". Tải lên lại CV trước hạn nộp.`,
        href: profileOf(campaignId),
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
    case 'CAMPAIGN_DEADLINES_CHANGED': {
      const { campaignId, campaignName, audience, deadlines, reason } = notification.payload;
      const moves = deadlines.map((move) => `${CAMPAIGN_NOTICE_DEADLINE_NAMES[audience][move.key]}: ${formatDateTime(move.after)}`);
      return {
        title: 'Đợt thực tập đổi mốc thời gian',
        body: `Đợt "${campaignName}": ${moves.join('; ')}. Lý do: ${reason}`,
        href: audience === 'STUDENT' ? profileOf(campaignId) : HR_JDS_PATH,
      };
    }
    case 'CAMPAIGN_CANCELLED': {
      const { campaignName, audience, reason } = notification.payload;
      return {
        title: 'Đợt thực tập đã bị hủy',
        body: `Đợt "${campaignName}" đã bị hủy và không còn hiện trên hệ thống. Lý do: ${reason}`,
        href: HOME_OF[audience],
      };
    }
    case 'NOMINATIONS_PUBLISHED': {
      const { payload } = notification;
      if (payload.audience === 'HR') {
        return {
          title: 'Có danh sách đề cử mới',
          body: `Vòng phân bổ ${payload.roundNo} của đợt "${payload.campaignName}" đã công bố ${payload.nominationCount} sinh viên được đề cử vào "${payload.jd.title}".`,
          href: hrJdNominationsPath(payload.jd.jdId),
        };
      }
      return payload.jd
        ? {
            title: 'Bạn được đề cử',
            body: `Vòng phân bổ ${payload.roundNo} của đợt "${payload.campaignName}": bạn được đề cử vào "${payload.jd.title}" của ${payload.jd.companyName}.`,
            href: STUDENT_RESULTS_PATH,
          }
        : {
            title: 'Kết quả phân bổ đã công bố',
            body: `Vòng phân bổ ${payload.roundNo} của đợt "${payload.campaignName}" chưa có đề cử cho bạn. Xem kết quả và lý do của từng nguyện vọng.`,
            href: STUDENT_RESULTS_PATH,
          };
    }
    case 'HR_REVIEW_DUE_SOON': {
      const { jd, dueAt, pendingCount } = notification.payload;
      return {
        title: 'Sắp hết hạn duyệt đề cử',
        body: `"${jd.title}" còn ${pendingCount} sinh viên được đề cử chưa có quyết định. Hạn phản hồi: ${formatDateTime(dueAt)}.`,
        href: hrJdNominationsPath(jd.jdId),
      };
    }
    case 'HR_REVIEW_OVERDUE': {
      const { audience, campaignId, jd, dueAt, pendingCount } = notification.payload;
      return audience === 'HR'
        ? {
            title: 'Quá hạn duyệt đề cử',
            body: `"${jd.title}" còn ${pendingCount} sinh viên được đề cử chưa có quyết định, đã quá hạn ${formatDateTime(dueAt)}. Trung tâm sẽ liên hệ hoặc gia hạn.`,
            href: hrJdNominationsPath(jd.jdId),
          }
        : {
            title: 'Doanh nghiệp quá hạn duyệt đề cử',
            body: `${jd.companyName} – "${jd.title}" còn ${pendingCount} đề cử chưa có quyết định (hạn ${formatDateTime(dueAt)}). Liên hệ doanh nghiệp hoặc gia hạn.`,
            href: allocationPath(campaignId),
          };
    }
    // GĐ9 (US-5.4, CONTEXT D66): in the app only.
    case 'INTERVIEW_SCHEDULED':
    case 'INTERVIEW_RESCHEDULED': {
      const { audience, jd, student, scheduledAt, mode, location } = notification.payload;
      const moved = notification.type === 'INTERVIEW_RESCHEDULED';
      const when = `${formatDateTime(scheduledAt)}, ${INTERVIEW_MODE_LABELS[mode].toLowerCase()} (${location})`;
      return audience === 'STUDENT'
        ? {
            title: moved ? 'Lịch phỏng vấn đã đổi' : 'Lịch phỏng vấn',
            body: `${jd.companyName} – "${jd.title}": ${when}. Xác nhận lịch trên trang Kết quả.`,
            href: STUDENT_RESULTS_PATH,
          }
        : {
            title: moved ? 'Đã đổi lịch phỏng vấn' : 'Đã tạo lịch phỏng vấn',
            body: `${student.fullName} (${student.studentCode}) – "${jd.title}": ${when}.`,
            href: hrJdInterviewsPath(jd.jdId),
          };
    }
    case 'INTERVIEW_RESCHEDULE_REQUESTED': {
      const { jd, student, scheduledAt, note } = notification.payload;
      return {
        title: 'Sinh viên xin đổi lịch phỏng vấn',
        body: `${student.fullName} (${student.studentCode}) – "${jd.title}", lịch ${formatDateTime(scheduledAt)}. Lý do: ${note}`,
        href: hrJdInterviewsPath(jd.jdId),
      };
    }
    case 'INTERVIEW_RESULT': {
      const { jd, status, promoted, offer } = notification.payload;
      const where = `"${jd.title}" của ${jd.companyName}`;
      if (status === 'PASSED') {
        return {
          title: promoted ? 'Bạn được lên Đạt từ danh sách dự bị' : 'Bạn đạt phỏng vấn',
          body: `${where}: bạn nhận lời mời thực tập${offer ? `, trả lời trước ${formatDateTime(offer.expiresAt)}` : ''}.`,
          href: STUDENT_RESULTS_PATH,
        };
      }
      return status === 'RESERVE'
        ? {
            title: 'Bạn vào danh sách dự bị',
            body: `${where}: bạn đạt yêu cầu và ở danh sách dự bị. Bạn được lên Đạt khi có suất trống.`,
            href: STUDENT_RESULTS_PATH,
          }
        : {
            title: 'Kết quả phỏng vấn',
            body: `${where}: bạn chưa đạt phỏng vấn. Các nguyện vọng còn lại được xét ở vòng bổ sung.`,
            href: STUDENT_RESULTS_PATH,
          };
    }
    case 'RESERVE_CLOSED': {
      const { jd, reason } = notification.payload;
      return {
        title: 'Hồ sơ dự bị đã đóng',
        body: `"${jd.title}" của ${jd.companyName}: ${reason === 'JD_FILLED' ? 'JD đã nhận đủ chỉ tiêu' : 'đã hết thời hạn dự bị'}. Các nguyện vọng còn lại của bạn được xét ở vòng bổ sung.`,
        href: STUDENT_RESULTS_PATH,
      };
    }
    case 'OFFER_ANSWERED': {
      const { audience, campaignId, jd, student, response, promoted, jdFilled } = notification.payload;
      const who = `${student.fullName} (${student.studentCode})`;
      const what =
        response === 'ACCEPTED' ? 'đã nhận lời mời' : response === 'DECLINED' ? 'đã từ chối lời mời' : 'không trả lời lời mời trước hạn';
      const after = jdFilled
        ? ' JD đã nhận đủ chỉ tiêu.'
        : promoted
          ? ` ${promoted.fullName} (${promoted.studentCode}) từ danh sách dự bị được lên Đạt.`
          : response === 'ACCEPTED'
            ? ''
            : ' Không còn ai trong danh sách dự bị: suất để trống cho vòng bổ sung.';
      return {
        title: response === 'ACCEPTED' ? 'Sinh viên nhận lời mời thực tập' : 'Lời mời thực tập không được nhận',
        body: `${audience === 'CENTER' ? `${jd.companyName} – ` : ''}"${jd.title}": ${who} ${what}.${after}`,
        href: audience === 'HR' ? hrJdInterviewsPath(jd.jdId) : allocationPath(campaignId),
      };
    }
    case 'SUPPLEMENT_REQUESTED': {
      const { campaignId, jd, invitedCount, quota, note } = notification.payload;
      return {
        title: 'Doanh nghiệp yêu cầu bổ sung hồ sơ',
        body: `${jd.companyName} – "${jd.title}" mới mời phỏng vấn ${invitedCount}/${quota} chỉ tiêu. Ghi chú: ${note}`,
        href: allocationPath(campaignId),
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
