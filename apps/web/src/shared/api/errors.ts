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
