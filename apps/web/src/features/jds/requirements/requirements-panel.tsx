import { JdAnalysisEventSchema, type JdRequirementsView, SERVER_EVENTS } from '@srm/shared';
import { CircleAlert, ClipboardList, PencilLine, Sparkles, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/shared/api/errors';
import { useServerEvent } from '@/shared/notifications/server-events';
import { useJdRequirements, useRefreshJd } from './api';
import { RequirementsForm } from './requirements-form';
import { RequirementsSummary } from './requirements-summary';

function PanelCard({ view, action, children }: { view?: JdRequirementsView; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Yêu cầu chuẩn hóa</CardTitle>
        <CardDescription>
          {view ? `Phiên bản ${view.version}. ` : ''}Dùng để lọc điều kiện cứng, chấm độ phù hợp và dựng đề test.
        </CardDescription>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
    </Card>
  );
}

/** AC-12: the original file had hidden text, which the analysis left out. */
function HiddenTextAlert() {
  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>File JD có chữ ẩn</AlertTitle>
      <AlertDescription>
        Hệ thống đã bỏ các đoạn chữ ẩn (trùng màu nền, cỡ rất nhỏ hoặc nằm ngoài trang) trước khi phân tích. Mở file
        gốc để kiểm tra nếu cần.
      </AlertDescription>
    </Alert>
  );
}

/**
 * The requirements of a submitted JD, next to the JD itself (US-2.3 AC-6, AC-7, AC-11, AC-12):
 * - HR, awaiting confirmation: "Đang phân tích" until the result arrives over SSE (or "Nhập tay"),
 *   then the editable proposal, or an empty form when the analysis failed;
 * - an approved JD: read only, with "Sửa yêu cầu" creating a new version;
 * - otherwise read only (the center before approval, a JD awaiting approval).
 */
export function RequirementsPanel({ jdId }: { jdId: number }) {
  const requirements = useJdRequirements(jdId);
  const refresh = useRefreshJd();
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState(false);

  useServerEvent(SERVER_EVENTS.JD_ANALYSIS, (data) => {
    const event = JdAnalysisEventSchema.safeParse(data);
    if (event.success && event.data.jdId === jdId) refresh(jdId);
  });

  if (requirements.isPending) {
    return (
      <PanelCard>
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </PanelCard>
    );
  }

  if (requirements.isError) {
    return (
      <PanelCard>
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được yêu cầu chuẩn hóa</AlertTitle>
          <AlertDescription>{apiErrorMessage(requirements.error)}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => void requirements.refetch()}>
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      </PanelCard>
    );
  }

  const view = requirements.data;
  const reload = async () => (await requirements.refetch()).data;
  const analysing = view.analysisStatus === 'PENDING' && view.requirements === null;

  if (view.editMode === 'IN_PLACE') {
    if (analysing && !manual) {
      return (
        <PanelCard view={view}>
          <Alert>
            <Spinner />
            <AlertTitle>Đang phân tích JD</AlertTitle>
            <AlertDescription>
              Hệ thống đang trích yêu cầu chuẩn hóa từ JD, thường mất dưới một phút. Trang tự cập nhật khi xong; HR cũng
              nhận thông báo.
            </AlertDescription>
          </Alert>
          <Button variant="outline" className="self-start" onClick={() => setManual(true)}>
            <PencilLine data-icon="inline-start" />
            Nhập yêu cầu bằng tay
          </Button>
        </PanelCard>
      );
    }
    return (
      <PanelCard view={view}>
        {view.hiddenTextDetected && <HiddenTextAlert />}
        {view.requirements === null ? (
          <Alert>
            <PencilLine />
            <AlertTitle>{analysing ? 'Nhập yêu cầu bằng tay' : 'Chưa có đề xuất từ hệ thống'}</AlertTitle>
            <AlertDescription>
              {analysing
                ? 'Nếu kết quả phân tích đến sau khi lưu, yêu cầu HR nhập vẫn được giữ.'
                : 'Hệ thống không phân tích được JD này. Nhập các kỹ năng và điều kiện cứng rồi xác nhận.'}
            </AlertDescription>
          </Alert>
        ) : (
          view.analysisStatus === 'SUCCEEDED' && (
            <Alert>
              <Sparkles />
              <AlertTitle>Đề xuất của hệ thống</AlertTitle>
              <AlertDescription>
                Kiểm tra từng kỹ năng, mức độ và trọng số, sửa nếu chưa đúng. Yêu cầu chỉ được dùng sau khi HR xác nhận
                và Trung tâm duyệt.
              </AlertDescription>
            </Alert>
          )
        )}
        <RequirementsForm jdId={jdId} view={view} mode="IN_PLACE" onReload={reload} />
      </PanelCard>
    );
  }

  if (view.editMode === 'NEW_VERSION' && editing) {
    return (
      <PanelCard view={view}>
        <Alert>
          <TriangleAlert />
          <AlertTitle>Sửa yêu cầu của JD đã duyệt</AlertTitle>
          <AlertDescription>
            Lưu sẽ tạo phiên bản {view.version + 1}. Phiên bản đang dùng được giữ lại trong nhật ký để đối chiếu.
          </AlertDescription>
        </Alert>
        <RequirementsForm jdId={jdId} view={view} mode="NEW_VERSION" onReload={reload} onDone={() => setEditing(false)} />
      </PanelCard>
    );
  }

  const editAction =
    view.editMode === 'NEW_VERSION' ? (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        <PencilLine data-icon="inline-start" />
        Sửa yêu cầu
      </Button>
    ) : undefined;

  return (
    <PanelCard view={view} action={editAction}>
      {view.hiddenTextDetected && <HiddenTextAlert />}
      {view.requirements ? (
        <RequirementsSummary requirements={view.requirements} positionGroup={view.positionGroup} />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>{analysing ? 'Đang phân tích JD' : 'Chưa có yêu cầu chuẩn hóa'}</EmptyTitle>
            <EmptyDescription>HR của doanh nghiệp xác nhận yêu cầu trước khi Trung tâm duyệt JD.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </PanelCard>
  );
}
