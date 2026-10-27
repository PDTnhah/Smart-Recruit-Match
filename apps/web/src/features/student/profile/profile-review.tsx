import type { CvProfile, CvProfileView } from '@srm/shared';
import { CircleAlert, CircleCheck, PencilLine, ShieldCheck } from 'lucide-react';
import { lazy, Suspense, useId, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiErrorMessage } from '@/shared/api/errors';
import { useCvProfile, useReopenCvProfile } from './api';
import { ConfirmActionDialog } from './confirm-action-dialog';
import { CvStatusBadge } from './cv-status-badge';
import { ProfileForm } from './profile-form';
import { ProfileSummary } from './profile-summary';

type ViewWithProfile = CvProfileView & { profile: CvProfile };

// pdf.js is large: loaded with the review, not with the bundle every portal shares.
const CvViewer = lazy(() => import('./cv-viewer').then((module) => ({ default: module.CvViewer })));

/** "Sửa lại" (AC-12): a new version of the confirmed profile, to edit and confirm again. */
function ReopenButton({ view }: { view: ViewWithProfile }) {
  const reopen = useReopenCvProfile();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    try {
      const created = await reopen.mutateAsync({ cvId: view.cvId, rowVersion: view.rowVersion });
      setOpen(false);
      toast.success(`Đã tạo phiên bản ${created.version} để sửa hồ sơ`);
    } catch (failure) {
      setError(apiErrorMessage(failure));
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PencilLine data-icon="inline-start" />
        Sửa lại hồ sơ
      </Button>
      <ConfirmActionDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="Sửa lại hồ sơ năng lực?"
        description={`Hệ thống tạo phiên bản ${view.version + 1} từ CV và hồ sơ hiện tại để sửa. Hồ sơ chỉ được đánh giá lại sau khi xác nhận lần nữa, trước hạn nộp CV.`}
        actionLabel="Sửa lại hồ sơ"
        onConfirm={() => void run()}
        pending={reopen.isPending}
        error={error}
        errorTitle="Chưa sửa lại được hồ sơ"
      />
    </>
  );
}

/** Where a profile that cannot be edited now stands, and "Sửa lại" while it still can be. */
function ReadOnlyNotice({ view }: { view: ViewWithProfile }) {
  if (view.status === 'CONFIRMED') {
    return (
      <Alert>
        <CircleCheck />
        <AlertTitle>Đã xác nhận hồ sơ</AlertTitle>
        <AlertDescription>
          {view.canReopen
            ? 'Hồ sơ này đang được dùng để đánh giá độ phù hợp. Cần sửa thì bấm "Sửa lại hồ sơ" trước hạn nộp CV.'
            : 'Hồ sơ này đang được dùng để đánh giá độ phù hợp. Đợt đã qua hạn nộp CV nên không sửa được nữa.'}
        </AlertDescription>
        {view.canReopen && (
          <AlertAction>
            <ReopenButton view={view} />
          </AlertAction>
        )}
      </Alert>
    );
  }
  return (
    <Alert>
      <CircleAlert />
      <AlertTitle>Đã hết hạn nộp CV</AlertTitle>
      <AlertDescription>
        Đợt đã qua hạn nộp CV nên hồ sơ không sửa hay xác nhận được nữa. Liên hệ Trung tâm quan hệ doanh nghiệp nếu cần hỗ
        trợ.
      </AlertDescription>
    </Alert>
  );
}

/**
 * The student's review of the profile read from the CV that counts (US-2.6 AC-1, AC-11). From
 * `lg` the CV and the profile sit side by side, wider than the portal's column; below, they are
 * two tabs. One tree for both, with both panels kept mounted, so rotating a tablet or switching
 * tabs keeps unsaved edits and the loaded PDF.
 */
export function ProfileReview({ campaignId }: { campaignId: number }) {
  const query = useCvProfile(campaignId);
  const [tab, setTab] = useState('profile');
  const titleId = useId();

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được hồ sơ năng lực</AlertTitle>
        <AlertDescription>{apiErrorMessage(query.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  const { profile } = query.data;
  // Analysis not done yet: the page shows where it stands (AC-10).
  if (!profile) return null;
  const view: ViewWithProfile = { ...query.data, profile };

  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-4 lg:relative lg:left-1/2 lg:w-[min(80rem,calc(100vw_-_3rem))] lg:-translate-x-1/2"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={titleId} className="text-base font-medium">
            Hồ sơ năng lực
          </h2>
          <CvStatusBadge status={view.status} />
          <span className="text-sm text-muted-foreground">CV phiên bản {view.version}</span>
        </div>
        <p className="flex gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Thông tin cá nhân (họ tên, liên lạc, ảnh, ngày sinh, giới tính, quê quán, tôn giáo, tình trạng hôn nhân) đã
          được tách khỏi hồ sơ năng lực và không dùng để chấm điểm.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <TabsList className="w-full lg:hidden">
          <TabsTrigger value="cv">CV</TabsTrigger>
          <TabsTrigger value="profile">Hồ sơ năng lực</TabsTrigger>
        </TabsList>
        <TabsContent
          value="cv"
          forceMount
          className="min-w-0 data-[state=inactive]:hidden lg:sticky lg:top-20 lg:max-h-[calc(100svh_-_6rem)] lg:overflow-y-auto lg:data-[state=inactive]:block"
        >
          <Suspense fallback={<Skeleton className="aspect-[210/297] w-full" />}>
            <CvViewer key={view.cvId} cvId={view.cvId} fileName={view.fileName} />
          </Suspense>
        </TabsContent>
        <TabsContent value="profile" forceMount className="min-w-0 data-[state=inactive]:hidden lg:data-[state=inactive]:block">
          {view.editable ? (
            <ProfileForm key={view.cvId} view={view} onReload={async () => (await query.refetch()).data} />
          ) : (
            <div className="flex min-w-0 flex-col gap-6">
              <ReadOnlyNotice view={view} />
              <ProfileSummary profile={view.profile} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
