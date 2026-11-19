import { type JobDescription, QUESTION_BANK_JD_STATES } from '@srm/shared';
import { ArrowLeft, CircleAlert, Info } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCampaigns } from '@/features/center/campaigns/api';
import { useJd } from '@/features/jds/api';
import { JdDetails } from '@/features/jds/jd-details';
import { JdStatusBadge } from '@/features/jds/jd-status-badge';
import { ReviewSamplePanel } from '@/features/jds/question-review/review-sample-panel';
import { RequirementsPanel } from '@/features/jds/requirements/requirements-panel';
import { apiErrorMessage } from '@/shared/api/errors';
import { JdFileCard } from './jd-file-card';
import { JdForm } from './jd-form';
import { HR_JDS_PATH } from './paths';
import { SubmitJdDialog } from './submit-jd-dialog';

function PageHeader({ title, jd, actions }: { title: string; jd?: JobDescription; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link to={HR_JDS_PATH}>
          <ArrowLeft data-icon="inline-start" />
          JD của tôi
        </Link>
      </Button>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 font-heading text-xl font-semibold break-words md:text-2xl">{title}</h1>
        {jd && <JdStatusBadge jd={jd} />}
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * Whether the JD's campaign is no longer listed for HR. A JD is only made in a campaign HR could
 * see, and HR sees every campaign but drafts and cancelled ones, so it was cancelled (US-1.10 AC-7).
 */
function useCampaignCancelled(campaignId: number): boolean {
  const campaigns = useCampaigns();
  return campaigns.isSuccess && !campaigns.data.some((campaign) => campaign.id === campaignId);
}

function CampaignCancelledAlert() {
  return (
    <Alert>
      <Info />
      <AlertTitle>Đợt thực tập của JD đã bị hủy</AlertTitle>
      <AlertDescription>
        JD được giữ lại để tra cứu nhưng không sửa, nộp hay nhận sinh viên được nữa. Trung tâm đã gửi thông báo kèm lý
        do.
      </AlertDescription>
    </Alert>
  );
}

/** `/hr/job-descriptions/new` (US-1.5 AC-4, AC-5, AC-10). */
export function HrJdCreatePage() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Đăng JD" />
      <JdForm />
    </div>
  );
}

/** `?tab=review` opens "Duyệt đề mẫu", so a reload or a link keeps it. */
const TAB_PARAM = 'tab';
const REVIEW_TAB = 'review';
const DETAILS_TAB = 'details';

/**
 * `/hr/job-descriptions/:id`: edit and submit a draft (US-1.5 AC-6, AC-10); once submitted, the
 * JD next to its normalised requirements, which HR reviews and confirms (US-2.3 AC-7, AC-8). Once
 * approved, the "Duyệt đề mẫu" tab: a sample of the JD's question bank to review (US-4.9 AC-6).
 */
export function HrJdDetailPage() {
  const id = Number(useParams().id);
  if (!Number.isInteger(id) || id <= 0) return <Navigate to={HR_JDS_PATH} replace />;
  return <HrJdDetail id={id} />;
}

function HrJdDetail({ id }: { id: number }) {
  const jd = useJd(id);
  const [unsaved, setUnsaved] = useState(false);
  const cancelled = useCampaignCancelled(jd.data?.campaignId ?? 0);
  const [params, setParams] = useSearchParams();
  const tab = params.get(TAB_PARAM) === REVIEW_TAB ? REVIEW_TAB : DETAILS_TAB;
  // The sample loads once its tab is opened, then stays mounted.
  const [reviewOpened, setReviewOpened] = useState(tab === REVIEW_TAB);
  if (tab === REVIEW_TAB && !reviewOpened) setReviewOpened(true);

  function selectTab(next: string) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === REVIEW_TAB) updated.set(TAB_PARAM, next);
        else updated.delete(TAB_PARAM);
        return updated;
      },
      { replace: true },
    );
  }

  if (jd.isPending) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6" aria-busy="true">
        <Skeleton className="h-8 w-2/3 max-w-sm" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (jd.isError) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <PageHeader title="JD" />
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được JD</AlertTitle>
          <AlertDescription>{apiErrorMessage(jd.error)}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => void jd.refetch()}>
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      </div>
    );
  }

  const data = jd.data;
  // A draft of a cancelled campaign is read-only: the API refuses every edit (409).
  if (data.status === 'DRAFT' && !cancelled) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <PageHeader title={data.title} jd={data} actions={<SubmitJdDialog jd={data} unsavedChanges={unsaved} />} />
        {/* Keyed by id, not row_version: a file upload must not wipe unsaved input. */}
        <JdForm key={data.id} jd={data} onDirtyChange={setUnsaved} />
        <JdFileCard jd={data} />
      </div>
    );
  }

  // The original JD on the left, the requirements on the right (AC-7); stacked below lg.
  const details =
    data.status === 'DRAFT' ? (
      <JdDetails jd={data} />
    ) : (
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <JdDetails jd={data} />
        <RequirementsPanel jdId={data.id} />
      </div>
    );
  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title={data.title} jd={data} />
      {cancelled && <CampaignCancelledAlert />}
      {QUESTION_BANK_JD_STATES.includes(data.status) ? (
        <Tabs value={tab} onValueChange={selectTab} className="gap-6">
          <TabsList>
            <TabsTrigger value={DETAILS_TAB}>Thông tin JD</TabsTrigger>
            <TabsTrigger value={REVIEW_TAB}>Duyệt đề mẫu</TabsTrigger>
          </TabsList>
          {/* Both stay mounted, so switching tabs keeps a dialog's input (DESIGN.md §6 › tabs). */}
          <TabsContent value={DETAILS_TAB} forceMount className="data-[state=inactive]:hidden">
            {details}
          </TabsContent>
          <TabsContent value={REVIEW_TAB} forceMount className="data-[state=inactive]:hidden">
            {reviewOpened && <ReviewSamplePanel jdId={data.id} readOnly={cancelled} />}
          </TabsContent>
        </Tabs>
      ) : (
        details
      )}
    </div>
  );
}
