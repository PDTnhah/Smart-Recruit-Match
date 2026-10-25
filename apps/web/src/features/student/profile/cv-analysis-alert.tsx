import type { Cv } from '@srm/shared';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

/**
 * Where the analysis of the CV that counts stands (US-2.4 AC-1, AC-9, AC-11). The page refreshes
 * over SSE (`cv.analysis`), so "Đang phân tích" turns into the outcome without a reload.
 */
export function CvAnalysisAlert({ cv, canUpload }: { cv: Cv; canUpload: boolean }) {
  switch (cv.status) {
    case 'PENDING_ANALYSIS':
      return (
        <Alert aria-live="polite">
          <Spinner />
          <AlertTitle>Đang phân tích CV…</AlertTitle>
          <AlertDescription>
            Hệ thống đang trích hồ sơ năng lực từ CV phiên bản {cv.version}, thường mất dưới 30 giây. Trang tự cập
            nhật khi xong.
          </AlertDescription>
        </Alert>
      );
    case 'ANALYSIS_FAILED':
      return (
        <Alert variant="destructive" aria-live="polite">
          <CircleAlert />
          <AlertTitle>Không phân tích được CV này</AlertTitle>
          <AlertDescription>
            {canUpload
              ? 'Tải lên lại CV ở dưới, tốt nhất là file PDF xuất từ Word hoặc trình soạn CV (chọn được chữ trong file), hoặc file DOCX. Nếu vẫn không được, liên hệ Trung tâm quan hệ doanh nghiệp.'
              : 'Đã hết hạn nộp CV nên không tải lại được. Liên hệ Trung tâm quan hệ doanh nghiệp để được hỗ trợ.'}
          </AlertDescription>
        </Alert>
      );
    case 'PENDING_CONFIRMATION':
      return (
        <Alert aria-live="polite">
          <CircleCheck />
          <AlertTitle>Hồ sơ năng lực sẵn sàng để xác nhận</AlertTitle>
          <AlertDescription>
            Hệ thống đã trích hồ sơ năng lực từ CV phiên bản {cv.version}. Bước xem lại và xác nhận hồ sơ sẽ mở tại
            trang này.
          </AlertDescription>
        </Alert>
      );
    case 'CONFIRMED':
      return null;
  }
}
