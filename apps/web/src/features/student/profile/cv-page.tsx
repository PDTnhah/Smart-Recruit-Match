import {
  type Campaign,
  CvAnalysisEventSchema,
  campaignIdsWithActiveCv,
  otherCampaignWithCv,
  pickProfileCampaign,
  SERVER_EVENTS,
  takesCvs,
} from '@srm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CircleAlert, FileText, Info } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaigns } from '@/features/center/campaigns/api';
import { CAMPAIGN_STATUS_BADGE, CAMPAIGN_STATUS_LABELS } from '@/features/center/campaigns/labels';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { useServerEvent } from '@/shared/notifications/server-events';
import { profileKeys, useConsents, useMyCvs } from './api';
import { CvAnalysisAlert } from './cv-analysis-alert';
import { CvHistory } from './cv-history';
import { CvUploadCard } from './cv-upload-card';
import { ProfileReview } from './profile-review';
import { hasCurrentConsent } from './intake';
import { TermsCard } from './terms-card';

/** Whether the student has a CV in a campaign, as the campaign picker shows it (US-1.8 AC-4). */
function cvStatusLabel(hasCv: boolean): string {
  return hasCv ? 'Đã có CV' : 'Chưa nộp CV';
}

function PageTitle() {
  return <h1 className="font-heading text-xl font-semibold md:text-2xl">Hồ sơ</h1>;
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-6 w-2/3 max-w-sm" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function CampaignSummary({ campaign }: { campaign: Campaign }) {
  const deadline = campaign.phaseDeadlines.intake_end;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 font-medium break-words">{campaign.name}</span>
        <Badge variant={CAMPAIGN_STATUS_BADGE[campaign.status]}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
      </div>
      {deadline && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
          Hạn nộp CV: {formatDateTime(deadline)}
        </p>
      )}
    </div>
  );
}

/**
 * Shown on a campaign without a CV of the student while another campaign holds one (US-1.8 AC-3):
 * a new campaign for the same cohort must not look like the CV got lost.
 */
function CvElsewhereAlert({
  campaign,
  canUpload,
  onOpen,
}: {
  campaign: Campaign;
  canUpload: boolean;
  onOpen: () => void;
}) {
  return (
    <Alert>
      <Info />
      <AlertTitle>CV đã nộp ở đợt khác</AlertTitle>
      <AlertDescription>
        <p className="break-words">
          CV đang dùng nằm ở đợt “{campaign.name}”. Mỗi đợt nhận CV riêng nên đợt đang xem chưa có CV.
          {canUpload && ' Chỉ nộp CV ở đây nếu muốn tham gia cả đợt này.'}
        </p>
        <Button variant="outline" className="w-full sm:w-auto" onClick={onOpen}>
          Xem CV đã nộp
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * "Hồ sơ" of the student portal (US-1.6 AC-9): consent to the terms, then CV upload and the
 * version history, per campaign the student takes part in. Since US-2.4 it also shows where the
 * analysis of the CV that counts stands, refreshed over SSE; once analysed, the student reviews
 * and confirms the profile here (US-2.6). Without `?campaign=` it opens the campaign holding the
 * student's CV first (US-1.8). Mobile first (DESIGN.md §5).
 */
export function CvPage() {
  const campaigns = useCampaigns();
  const consents = useConsents();
  const cvs = useMyCvs();
  const queryClient = useQueryClient();
  // Refreshes the versions and, under the same key, the profile of the analysed CV (AC-10).
  useServerEvent(SERVER_EVENTS.CV_ANALYSIS, (data) => {
    if (CvAnalysisEventSchema.safeParse(data).success) void queryClient.invalidateQueries({ queryKey: profileKeys.cvs });
  });
  // `?campaign=<id>` from the portal home opens that campaign; the Select changes it.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = Number(searchParams.get('campaign')) || null;
  // Render-time "now" for the deadline check; the API decides at upload time anyway.
  const [now] = useState(() => Date.now());

  if (campaigns.isPending || consents.isPending || cvs.isPending) {
    return (
      <>
        <PageTitle />
        <ProfileSkeleton />
      </>
    );
  }

  const failed = [campaigns, consents, cvs].find((query) => query.isError);
  if (failed) {
    return (
      <>
        <PageTitle />
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được hồ sơ</AlertTitle>
          <AlertDescription>{apiErrorMessage(failed.error)}</AlertDescription>
          <AlertAction>
            <Button
              variant="outline"
              onClick={() => {
                for (const query of [campaigns, consents, cvs]) if (query.isError) void query.refetch();
              }}
            >
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      </>
    );
  }

  // The API returns only campaigns the student takes part in, never drafts (CONTEXT D27).
  const visible = campaigns.data ?? [];
  const cvList = cvs.data ?? [];
  const selected =
    visible.find((campaign) => campaign.id === selectedId) ?? pickProfileCampaign(visible, cvList, now);
  if (!selected) {
    return (
      <>
        <PageTitle />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>Chưa có đợt thực tập nào</EmptyTitle>
            <EmptyDescription>
              Khi Trung tâm mở đợt thực tập cho khóa và ngành của sinh viên, màn này sẽ cho nộp CV.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    );
  }

  const accepted = consents.data ? hasCurrentConsent(consents.data, selected.id) : false;
  const versions = cvList.filter((cv) => cv.campaignId === selected.id);
  const current = versions.find((cv) => cv.active);
  const open = takesCvs(selected, now);
  const analysed = current?.status === 'PENDING_CONFIRMATION' || current?.status === 'CONFIRMED';
  const withCv = campaignIdsWithActiveCv(cvList);
  const elsewhere = otherCampaignWithCv(visible, cvList, selected.id, now);
  // The Select swaps the view in place; the Alert's button is a way out, so Back returns from it.
  const showCampaign = (id: number, replace: boolean) => setSearchParams({ campaign: String(id) }, { replace });

  return (
    <>
      <PageTitle />
      {visible.length > 1 && (
        <Select value={String(selected.id)} onValueChange={(value) => showCampaign(Number(value), true)}>
          <SelectTrigger aria-label="Đợt thực tập" className="w-full sm:w-80">
            {/* The name gives way to the CV status when the trigger is too narrow. */}
            <SelectValue placeholder="Chọn đợt">
              <span className="truncate">{selected.name}</span>
              <span className="shrink-0 text-muted-foreground">· {cvStatusLabel(withCv.has(selected.id))}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {visible.map((campaign) => (
              <SelectItem key={campaign.id} value={String(campaign.id)} textValue={campaign.name}>
                <span className="flex min-w-0 flex-col">
                  <span className="break-words">{campaign.name}</span>
                  <span className="text-xs text-muted-foreground">{cvStatusLabel(withCv.has(campaign.id))}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <CampaignSummary campaign={selected} />
      {elsewhere && (
        <CvElsewhereAlert campaign={elsewhere} canUpload={open} onOpen={() => showCampaign(elsewhere.id, false)} />
      )}
      {current && <CvAnalysisAlert cv={current} canUpload={open && accepted} />}
      {analysed && <ProfileReview key={selected.id} campaignId={selected.id} />}
      {!open ? (
        <Alert>
          <CalendarClock />
          <AlertTitle>Đã hết hạn nộp CV</AlertTitle>
          <AlertDescription>
            Đợt này đã qua giai đoạn nhận CV nên không nộp hay cập nhật CV được nữa. Các phiên bản đã nộp vẫn xem
            được bên dưới.
          </AlertDescription>
        </Alert>
      ) : accepted ? (
        <CvUploadCard key={selected.id} campaign={selected} hasCv={versions.length > 0} />
      ) : (
        <TermsCard key={selected.id} campaign={selected} />
      )}
      {(accepted || versions.length > 0) && <CvHistory cvs={versions} />}
    </>
  );
}
