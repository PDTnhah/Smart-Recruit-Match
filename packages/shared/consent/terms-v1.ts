import type { ConsentTerms } from './terms.js';

/**
 * Terms v1 (US-1.6, CONTEXT D30). The LLM provider facts follow Anthropic's commercial data
 * retention and training policies as read on 2026-10-14; the sources are listed in the story's
 * Implementation notes. Do not edit this text: students accepted it by its SHA-256, and a test pins
 * that hash. A change of provider, retention or wording is a new version that students accept again.
 */
export const TERMS_V1: ConsentTerms = {
  version: 1,
  title: 'Điều khoản xử lý dữ liệu cá nhân khi nộp CV',
  sections: [
    {
      heading: 'Dữ liệu được xử lý',
      paragraphs: [
        'Khi nộp CV cho một đợt thực tập, hệ thống lưu file CV (PDF hoặc DOCX) và các thông tin trong CV: học vấn, kỹ năng, kinh nghiệm, dự án, chứng chỉ, thông tin liên hệ và các thông tin cá nhân khác có trong CV.',
        'Hệ thống dùng thêm mã sinh viên, ngành, khóa và GPA do Trường cung cấp.',
      ],
    },
    {
      heading: 'CV được AI phân tích',
      paragraphs: [
        'Để trích xuất hồ sơ năng lực, hệ thống gửi nội dung CV tới dịch vụ Claude API của Anthropic, PBC (Hoa Kỳ), nhà cung cấp mô hình ngôn ngữ lớn. Đây là bước duy nhất gửi CV đầy đủ ra ngoài hệ thống. Dữ liệu được xử lý trên máy chủ của Anthropic đặt ngoài Việt Nam.',
        'Theo chính sách hiện hành của Anthropic, dữ liệu gửi qua Claude API được tự động xóa khỏi hệ thống của Anthropic trong vòng 30 ngày. Ngoại lệ: nội dung bị hệ thống an toàn của Anthropic đánh dấu là vi phạm chính sách sử dụng có thể được giữ tới 2 năm, và dữ liệu có thể được giữ lâu hơn khi pháp luật yêu cầu.',
        'Anthropic không dùng dữ liệu gửi qua Claude API để huấn luyện mô hình, trừ khi bên sử dụng dịch vụ cho phép rõ ràng. Hệ thống này không cho phép việc đó.',
        'Các bước chấm điểm sau đó chỉ dùng hồ sơ năng lực đã che thông tin cá nhân. Ảnh, giới tính, ngày sinh, quê quán, tôn giáo và tình trạng hôn nhân không được dùng trong bất kỳ bước chấm nào.',
        'AI không ra quyết định. Điểm phù hợp do hệ thống tính theo công thức từ đánh giá từng tiêu chí. Việc phân bổ do Trung tâm quan hệ doanh nghiệp thực hiện, việc tuyển chọn do doanh nghiệp quyết định.',
      ],
    },
    {
      heading: 'CV được chia sẻ cho doanh nghiệp',
      paragraphs: [
        'Khi sinh viên được đề cử vào một JD, CV và hồ sơ năng lực được chia sẻ cho cán bộ HR của doanh nghiệp đăng JD đó. Doanh nghiệp khác không xem được CV.',
        'Cán bộ Trung tâm quan hệ doanh nghiệp xem được CV để quản lý đợt thực tập.',
      ],
    },
    {
      heading: 'Lưu trữ và thời hạn lưu',
      paragraphs: [
        'File CV được lưu có mã hóa. Đường dẫn tải file chỉ có hiệu lực trong 5 phút.',
        'File CV gốc và thông tin cá nhân được lưu tối đa 12 tháng sau khi đợt thực tập đóng, sau đó bị xóa hoặc ẩn danh. Dữ liệu đã ẩn danh có thể được giữ lại để thống kê và đánh giá hệ thống.',
      ],
    },
    {
      heading: 'Quyền của sinh viên',
      paragraphs: [
        'Sinh viên được cập nhật CV trước hạn nộp và xem lại các phiên bản CV đã nộp.',
        'Để hỏi về việc xử lý dữ liệu, yêu cầu sửa hoặc xóa dữ liệu, hay rút lại sự đồng ý, liên hệ Trung tâm quan hệ doanh nghiệp.',
        'Không đồng ý điều khoản thì không nộp được CV và không tham gia ghép thực tập trong đợt này.',
      ],
    },
  ],
};
