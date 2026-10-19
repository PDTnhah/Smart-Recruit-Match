import type { NotificationType } from '@srm/shared';

// Email templates in Vietnamese (Handlebars, ARCHITECTURE › Thư viện chính). Kept as TS strings
// rather than .hbs files: tsc does not copy .hbs into dist (CONTEXT D31, same reason as
// packages/shared/consent/terms-v1.ts). `{{ }}` escapes HTML, so names typed by users are safe.
// Context fields are built by EmailRenderer; every field below must exist (strict mode).

export interface EmailTemplate {
  subject: string;
  /** Body inside the layout; `text` is the plain-text alternative. */
  html: string;
  text: string;
}

/** Wraps every HTML body. Inline styles only: many mail clients drop <style>. */
export const HTML_LAYOUT = `<!doctype html>
<html lang="vi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{subject}}</title></head>
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;">
<tr><td style="padding:24px;font-size:15px;line-height:1.6;">
{{{body}}}
<p style="margin:24px 0 0;font-size:13px;color:#71717a;">Email này được gửi tự động từ hệ thống Smart Recruit Match của Trung tâm quan hệ doanh nghiệp. Vui lòng không trả lời email này.</p>
</td></tr>
</table>
</body>
</html>`;

const button = (label: string) =>
  `<p style="margin:24px 0;"><a href="{{link}}" style="display:inline-block;padding:10px 20px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;">${label}</a></p>
<p style="margin:0;font-size:13px;color:#71717a;">Nếu nút không mở được, sao chép đường dẫn sau vào trình duyệt: {{link}}</p>`;

const TEXT_FOOTER = `
--
Email này được gửi tự động từ hệ thống Smart Recruit Match. Vui lòng không trả lời email này.`;

export const EMAIL_TEMPLATES: Record<NotificationType, EmailTemplate> = {
  CAMPAIGN_OPENED: {
    subject: 'Đợt thực tập "{{campaignName}}" đã mở',
    html: `<p>Chào {{recipientName}},</p>
<p>Đợt thực tập <strong>{{campaignName}}</strong> đã mở. Bạn có thể nộp CV trên hệ thống đến <strong>{{intakeEnd}}</strong> (giờ Việt Nam).</p>
${button('Nộp CV')}`,
    text: `Chào {{recipientName}},

Đợt thực tập "{{campaignName}}" đã mở. Bạn có thể nộp CV trên hệ thống đến {{intakeEnd}} (giờ Việt Nam).

Nộp CV tại: {{link}}
${TEXT_FOOTER}`,
  },
  HR_INVITED: {
    subject: 'Lời mời tham gia Smart Recruit Match',
    html: `<p>Chào {{recipientName}},</p>
<p>Trung tâm quan hệ doanh nghiệp mời bạn dùng hệ thống Smart Recruit Match với vai trò HR của doanh nghiệp. Bấm nút dưới đây để đặt mật khẩu và kích hoạt tài khoản.</p>
${button('Kích hoạt tài khoản')}
<p>Đường dẫn dùng được một lần và hết hạn lúc <strong>{{expiresAt}}</strong> (giờ Việt Nam). Nếu nhận được nhiều email mời, chỉ đường dẫn trong email mới nhất còn dùng được.</p>`,
    text: `Chào {{recipientName}},

Trung tâm quan hệ doanh nghiệp mời bạn dùng hệ thống Smart Recruit Match với vai trò HR của doanh nghiệp. Mở đường dẫn dưới đây để đặt mật khẩu và kích hoạt tài khoản:

{{link}}

Đường dẫn dùng được một lần và hết hạn lúc {{expiresAt}} (giờ Việt Nam). Nếu nhận được nhiều email mời, chỉ đường dẫn trong email mới nhất còn dùng được.
${TEXT_FOOTER}`,
  },
  DEADLINE_REMINDER: {
    subject: 'Nhắc hạn: {{task}} cho đợt "{{campaignName}}"',
    html: `<p>Chào {{recipientName}},</p>
<p>Hạn {{task}} của đợt thực tập <strong>{{campaignName}}</strong> là <strong>{{deadline}}</strong> (giờ Việt Nam). Hệ thống chưa ghi nhận việc này của bạn.</p>
${button('Mở hệ thống')}`,
    text: `Chào {{recipientName}},

Hạn {{task}} của đợt thực tập "{{campaignName}}" là {{deadline}} (giờ Việt Nam). Hệ thống chưa ghi nhận việc này của bạn.

Mở hệ thống: {{link}}
${TEXT_FOOTER}`,
  },
};
