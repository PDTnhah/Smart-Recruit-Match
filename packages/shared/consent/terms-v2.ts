import type { ConsentTerms } from './terms.js';

/**
 * Terms v2 (US-2.4, CONTEXT D34, D37): the CV Parser sends CVs to Google's Gemini API (paid tier)
 * by default and to Anthropic's Claude API as the alternative, so both providers are named. The
 * Google facts follow the Gemini API Additional Terms (updated 2026-04-28) and the Gemini API
 * usage policies (updated 2026-06-09); the Anthropic facts are those of v1 (read 2026-10-14). The
 * sources are listed in story US-2.4 › Implementation notes. Do not edit this text: students accept
 * it by its SHA-256, and a test pins that hash.
 */
export const TERMS_V2: ConsentTerms = {
  version: 2,
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
        'Để trích xuất hồ sơ năng lực, hệ thống gửi nội dung CV tới một dịch vụ mô hình ngôn ngữ lớn: mặc định là Gemini API của Google LLC (Hoa Kỳ), dùng gói trả phí; khi cần thay thế là Claude API của Anthropic, PBC (Hoa Kỳ). Mỗi CV chỉ được gửi tới một trong hai nhà cung cấp. Đây là bước duy nhất gửi CV ra ngoài hệ thống. Dữ liệu được xử lý trên máy chủ của nhà cung cấp, có thể đặt ngoài Việt Nam.',
        'Với CV có lớp chữ (PDF thường, DOCX), email và số điện thoại được thay bằng ký hiệu trước khi gửi. Với CV là bản quét hoặc ảnh chụp, hệ thống gửi nguyên file nên không che trước được thông tin nào.',
        'Theo điều khoản hiện hành của Google cho gói trả phí, Google không dùng nội dung gửi tới và nội dung trả về để cải thiện sản phẩm. Google lưu các nội dung này trong 55 ngày để phát hiện hành vi lạm dụng; chỉ nhân viên được Google ủy quyền mới xem được, và dữ liệu này không dùng để huấn luyện mô hình ngoài các mô hình phục vụ thực thi chính sách. Dữ liệu có thể được lưu tạm tại bất kỳ quốc gia nào Google đặt cơ sở.',
        'Theo chính sách hiện hành của Anthropic, dữ liệu gửi qua Claude API được tự động xóa khỏi hệ thống của Anthropic trong vòng 30 ngày. Ngoại lệ: nội dung bị hệ thống an toàn của Anthropic đánh dấu là vi phạm chính sách sử dụng có thể được giữ tới 2 năm, và dữ liệu có thể được giữ lâu hơn khi pháp luật yêu cầu. Anthropic không dùng dữ liệu gửi qua Claude API để huấn luyện mô hình, trừ khi bên sử dụng dịch vụ cho phép rõ ràng. Hệ thống này không cho phép việc đó.',
        'Thông tin cá nhân trích từ CV (họ tên, liên hệ, ảnh, ngày sinh, giới tính, quê quán, tôn giáo, tình trạng hôn nhân) được tách riêng và lưu có mã hóa. Các bước chấm điểm sau đó chỉ dùng hồ sơ năng lực đã che các thông tin này; chúng không được dùng trong bất kỳ bước chấm nào.',
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
        'Hệ thống lưu nhật ký các lần gửi CV tới dịch vụ AI, gồm cả nội dung gửi đi, trong kho lưu trữ có mã hóa của hệ thống để kiểm tra lại kết quả.',
        'File CV gốc, nhật ký trên và thông tin cá nhân được lưu tối đa 12 tháng sau khi đợt thực tập đóng, sau đó bị xóa hoặc ẩn danh. Dữ liệu đã ẩn danh có thể được giữ lại để thống kê và đánh giá hệ thống.',
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
