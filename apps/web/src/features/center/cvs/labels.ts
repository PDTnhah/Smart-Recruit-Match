// Why the analysis of a CV failed, in the center's words (DESIGN.md §9: no technical codes on
// screen). Codes come from the AI Service (US-2.4) and the job layer (US-2.1, US-2.2).

const ANALYSIS_ERROR_LABELS: Record<string, string> = {
  CV_NO_TEXT: 'CV không có chữ đọc được',
  CV_FILE_UNREADABLE: 'File hỏng hoặc không đọc được',
  CV_SCAN_WITH_HIDDEN_TEXT: 'Bản scan có chữ ẩn',
  FILE_MISSING: 'Không tìm thấy file CV',
  FILE_TOO_LARGE: 'File CV quá lớn',
  LLM_REFUSED: 'Dịch vụ AI từ chối phân tích',
  LLM_INVALID_OUTPUT: 'AI trả kết quả sai định dạng',
  LLM_BAD_REQUEST: 'Dịch vụ AI từ chối yêu cầu',
  LLM_FIXTURE_MISSING: 'Chưa bật dịch vụ AI',
  PII_MASK_FAILED: 'Không che được thông tin cá nhân',
  INVALID_RESULT: 'Kết quả phân tích không hợp lệ',
  RETRIES_EXHAUSTED: 'Lỗi tạm thời, đã thử lại 3 lần',
  DISPATCH_FAILED: 'Không gửi được yêu cầu phân tích',
};

export function analysisErrorLabel(code: string | null): string {
  return (code && ANALYSIS_ERROR_LABELS[code]) ?? 'Lỗi phân tích khác';
}
