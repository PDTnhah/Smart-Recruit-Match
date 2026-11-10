import { type ApiError, type ApiErrorCode, ApiErrorSchema } from '@srm/shared';

/** A non-2xx API response. `body` is the parsed ApiError when the server sent one. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiError | undefined;

  // No parameter properties: erasableSyntaxOnly (tsconfig.app.json).
  constructor(status: number, body: ApiError | undefined) {
    super(body?.message ?? `HTTP ${status}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
  }

  static from(status: number, body: unknown): ApiRequestError {
    return new ApiRequestError(status, ApiErrorSchema.safeParse(body).data);
  }
}

// One message per API error code (DESIGN.md §7, §9). Typed against the shared list, so a new code
// fails typecheck until it has a message here.
const MESSAGES: Record<ApiErrorCode, string> = {
  INVALID_TRANSITION: 'Không thể chuyển sang trạng thái này.',
  TRANSITION_CONDITION_FAILED: 'Chưa đủ điều kiện để thực hiện thao tác này.',
  ROW_VERSION_CONFLICT: 'Dữ liệu vừa được người khác cập nhật. Tải lại trang rồi thử lại.',
  ENTITY_NOT_FOUND: 'Không tìm thấy dữ liệu, hoặc tài khoản không có quyền xem.',
  UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng. Kiểm tra lại rồi thử lần nữa.',
  FORBIDDEN: 'Tài khoản không có quyền thực hiện thao tác này.',
  VALIDATION_FAILED: 'Dữ liệu chưa hợp lệ. Kiểm tra các ô được đánh dấu.',
  EMAIL_TAKEN: 'Email này đã có tài khoản.',
  STUDENT_CODE_TAKEN: 'Mã sinh viên này đã tồn tại.',
  ROLE_NOT_ALLOWED: 'Không thể tạo tài khoản với vai trò này.',
  CAMPAIGN_CONFIG_LOCKED: 'Đợt đã mở nên không sửa được mục này. Chỉ được lùi các mốc chưa tới.',
  CAMPAIGN_PHASE_MISMATCH: 'Thao tác này không làm được ở giai đoạn hiện tại của đợt.',
  INVITATION_INVALID: 'Liên kết mời không hợp lệ, đã hết hạn hoặc đã được dùng. Liên hệ Trung tâm để nhận liên kết mới.',
  JD_NOT_EDITABLE: 'JD đã được nộp nên không sửa được nữa.',
  FILE_TOO_LARGE: 'File lớn hơn 5 MB. Chọn file nhỏ hơn rồi tải lại.',
  UNSUPPORTED_FILE_TYPE: 'Chỉ nhận file PDF hoặc DOCX. Nội dung file này không phải PDF hay DOCX.',
  CONSENT_REQUIRED: 'Cần đồng ý điều khoản xử lý dữ liệu của đợt này trước khi nộp CV.',
  TERMS_OUTDATED: 'Điều khoản vừa được cập nhật. Tải lại trang, đọc bản mới rồi đồng ý lại.',
  CV_SUBMISSION_CONFLICT: 'Một CV khác vừa được nộp cùng lúc. Tải lại trang để xem phiên bản mới nhất.',
  JD_REQUIREMENTS_NOT_EDITABLE: 'Yêu cầu chuẩn hóa của JD này hiện không sửa được.',
  SKILL_NAME_TAKEN: 'Tên này trùng với một kỹ năng đã có trong danh mục. Hãy gộp vào kỹ năng đó.',
  SKILL_IMPLICATION_CYCLE: 'Quan hệ kéo theo này tạo thành vòng lặp. Bỏ kỹ năng gây vòng lặp rồi lưu lại.',
  SKILL_NOT_APPROVED: 'Kỹ năng này hoặc kỹ năng được kéo theo chưa được duyệt. Tải lại trang rồi chọn lại.',
  CV_PROFILE_NOT_EDITABLE: 'Hồ sơ của phiên bản CV này hiện không sửa được. Tải lại trang để xem phiên bản mới nhất.',
  MATCHING_RUN_IN_PROGRESS: 'Đợt này đang có một lượt chấm phù hợp chưa xong. Chờ lượt đó xong rồi chạy lại.',
  MATCHING_RUN_TOO_LARGE:
    'Lượt chấm này có quá nhiều cặp CV – JD cần AI chấm. Giảm "Số JD AI chấm cho mỗi CV (M)" trong cấu hình đợt rồi chạy lại.',
  AI_UNAVAILABLE: 'Chưa gửi được việc cho dịch vụ AI. Thử lại sau ít phút.',
  PREFERENCES_TOO_MANY: 'Số nguyện vọng vượt quá mức đợt này cho phép. Bỏ bớt nguyện vọng rồi lưu lại.',
  PREFERENCE_NOT_IN_SHORTLIST: 'Có JD không còn trong danh sách gợi ý. Tải lại trang rồi chọn lại.',
  PREFERENCE_DUPLICATE_JD: 'Mỗi JD chỉ chọn được một lần.',
  PREFERENCE_RANK_NOT_CONTIGUOUS: 'Thứ tự nguyện vọng phải liên tục từ NV1. Tải lại trang rồi sắp lại.',
  PREFERENCES_INCOMPLETE: 'Đợt này yêu cầu chọn đủ số nguyện vọng. Chọn thêm rồi lưu lại.',
  JD_NOT_APPROVED: 'JD này chưa được duyệt nên chưa có ngân hàng câu hỏi.',
  QUESTION_BANK_LOCKED: 'Ngân hàng câu hỏi đã khóa nên không sửa được ma trận đề hay sinh thêm câu.',
  QUESTION_GENERATION_RUNNING: 'AI đang sinh câu hỏi cho JD này. Chờ lượt sinh xong rồi sửa ma trận đề.',
  QUESTION_BANK_JD_OUTDATED: 'Yêu cầu của JD đã có phiên bản mới. Lưu lại ma trận đề theo yêu cầu mới trước khi sinh câu hay khóa ngân hàng.',
  QUESTION_BANK_INCOMPLETE: 'Còn ô của ma trận đề chưa đủ câu đạt kiểm định nên chưa khóa được ngân hàng.',
  BANK_NOT_LOCKED: 'Bài test của JD này chưa sẵn sàng. Thử lại sau, hoặc liên hệ Trung tâm.',
  EXAM_ALREADY_TAKEN: 'Bạn đã làm bài test này. Mỗi bài chỉ làm một lần.',
  EXAM_CLOSED: 'Bài test đã đóng nên không lưu thêm được câu trả lời.',
  EXAM_ANSWER_INVALID: 'Có câu trả lời không hợp lệ. Tải lại trang rồi chọn lại.',
  EXAM_BANK_INCOMPLETE: 'Ngân hàng câu hỏi của JD này đang thiếu câu nên chưa rút đề được. Liên hệ Trung tâm.',
  PREFERENCE_NOT_PENDING_TEST: 'Nguyện vọng này không còn chờ làm bài test.',
  EXAM_NOT_CLOSED: 'Bài test chưa nộp nên chưa có kết quả.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Chờ một lát rồi thử lại.',
  INTERNAL_ERROR: 'Hệ thống đang gặp sự cố. Thử lại sau ít phút.',
};

function isApiErrorCode(code: string): code is ApiErrorCode {
  return Object.hasOwn(MESSAGES, code);
}

/** A Vietnamese sentence for any error thrown by an API call; never the server's English text. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const code = error.body?.code;
    if (code && isApiErrorCode(code)) return MESSAGES[code];
    // nginx refuses bodies over 6 MB before the API sees them, with an HTML 413 page.
    if (error.status === 413) return MESSAGES.FILE_TOO_LARGE;
    if (error.status >= 500) return 'Hệ thống đang gặp sự cố. Thử lại sau ít phút.';
    return 'Yêu cầu không thực hiện được. Thử lại sau.';
  }
  if (error instanceof TypeError) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  return 'Đã có lỗi xảy ra. Thử lại sau.';
}
