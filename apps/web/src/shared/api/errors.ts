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
    if (error.status >= 500) return 'Hệ thống đang gặp sự cố. Thử lại sau ít phút.';
    return 'Yêu cầu không thực hiện được. Thử lại sau.';
  }
  if (error instanceof TypeError) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  return 'Đã có lỗi xảy ra. Thử lại sau.';
}
