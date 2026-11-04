import type { ShortlistCampaign, ShortlistJd, ShortlistResponse } from '@srm/shared';
import { CalendarClock, CircleAlert, FileText, Hourglass, Lock, SearchX } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CAMPAIGN_STATUS_BADGE, CAMPAIGN_STATUS_LABELS } from '@/features/center/campaigns/labels';
import { PROFILE_PATH } from '@/features/student/profile/intake';
import { formatDateTime } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { useReplacePreferences, useShortlist } from './api';
import { addToDraft, type Draft, draftOf, removeFromDraft, requestOf, sameDraft } from './draft';
import { IneligibleList } from './ineligible-list';
import { PreferenceList } from './preference-list';
import { ShortlistCard } from './shortlist-card';
import { UnsavedChangesGuard } from './unsaved-changes-guard';

type Tab = 'suggestions' | 'preferences';

function PageTitle() {
  return <h1 className="font-heading text-xl font-semibold md:text-2xl">Nguyện vọng</h1>;
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-6 w-2/3 max-w-sm" />
      <Skeleton className="h-11 w-full lg:hidden" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function StateEmpty({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

function CampaignSummary({ campaign }: { campaign: ShortlistCampaign }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 font-medium break-words">{campaign.name}</span>
        <Badge variant={CAMPAIGN_STATUS_BADGE[campaign.status]}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
      </div>
      {campaign.preferenceEnd && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
          Hạn chọn nguyện vọng: {formatDateTime(campaign.preferenceEnd)}
        </p>
      )}
    </div>
  );
}

/** Why the save failed; a deadline that passed meanwhile says so plainly (AC-9). */
function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.body?.code === 'CAMPAIGN_PHASE_MISMATCH') {
    return 'Đã hết hạn chọn nguyện vọng nên danh sách không lưu được nữa. Các nguyện vọng đã lưu trước đó vẫn được giữ.';
  }
  return apiErrorMessage(error);
}

/** Counts of what the suggestions leave out (AC-2): scored below θ_cv, and never scored in detail. */
function leftOutText(view: ShortlistResponse): string | null {
  const parts = [
    view.belowThresholdCount > 0 && `${view.belowThresholdCount} JD chưa đạt ngưỡng điểm phù hợp của đợt`,
    view.notScoredCount > 0 && `${view.notScoredCount} JD chưa được chấm chi tiết`,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? `Không hiện: ${parts.join('; ')}.` : null;
}

/**
 * "Nguyện vọng" of the student portal (US-3.3, FR-15, FR-16, CONTEXT D47): the shortlist with
 * the explanation of every S_cv, and the list of up to N_NV preferences, sorted by drag or by
 * buttons and saved whole. Two tabs on phones, two columns from `lg` (DESIGN.md §6 `tabs`).
 */
export function PreferencesPage() {
  const query = useShortlist();
  const save = useReplacePreferences();
  // The draft exists only once the student changes something; until then the saved list shows.
  const [edited, setEdited] = useState<Draft | null>(null);
  const [tab, setTab] = useState<Tab>('suggestions');
  const [saveError, setSaveError] = useState<string | null>(null);

  const view = query.data;
  const campaign = view?.campaign ?? null;
  const editable = campaign?.editable ?? false;
  const saved = view ? draftOf(view.preferences) : [];
  const draft = editable ? (edited ?? saved) : saved;
  const dirty = editable && edited !== null && !sameDraft(edited, saved);

  function change(next: Draft) {
    setSaveError(null);
    setEdited(next);
  }

  async function onSave() {
    if (!campaign) return;
    setSaveError(null);
    try {
      await save.mutateAsync(requestOf(campaign.id, draft));
      setEdited(null);
      toast.success('Đã lưu nguyện vọng');
    } catch (failure) {
      setSaveError(saveErrorMessage(failure));
      // A deadline that passed or a phase that changed: read again, the screen turns read-only.
      if (failure instanceof ApiRequestError && failure.status === 409) void query.refetch();
    }
  }

  const guard = <UnsavedChangesGuard when={dirty} />;

  if (query.isPending) {
    return (
      <>
        <PageTitle />
        <PageSkeleton />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <PageTitle />
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được danh sách gợi ý</AlertTitle>
          <AlertDescription>{apiErrorMessage(query.error)}</AlertDescription>
          <AlertAction>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      </>
    );
  }

  const data = query.data;
  if (data.state === 'NO_CONFIRMED_CV' || !campaign) {
    return (
      <>
        <PageTitle />
        {campaign && <CampaignSummary campaign={campaign} />}
        <StateEmpty
          icon={<FileText />}
          title="Chưa có hồ sơ đã xác nhận"
          action={
            <Button asChild>
              <Link to={campaign ? `${PROFILE_PATH}?campaign=${campaign.id}` : PROFILE_PATH}>Mở hồ sơ</Link>
            </Button>
          }
        >
          Hệ thống chỉ gợi ý JD cho hồ sơ năng lực đã xác nhận trong đợt thực tập. Nộp CV và xác nhận hồ sơ ở màn Hồ
          sơ trong thời gian đợt nhận CV.
        </StateEmpty>
      </>
    );
  }
  if (campaign.status === 'INTAKE') {
    return (
      <>
        <PageTitle />
        <CampaignSummary campaign={campaign} />
        <StateEmpty icon={<CalendarClock />} title="Chưa đến giai đoạn chọn nguyện vọng">
          Đợt đang nhận JD và CV. Danh sách JD gợi ý và việc chọn nguyện vọng mở khi đợt chuyển sang giai đoạn chọn
          nguyện vọng.
        </StateEmpty>
      </>
    );
  }

  const scoring = data.state === 'SCORING';
  const scoringNotice = (
    <Alert>
      <Hourglass />
      <AlertTitle>Đang chấm độ phù hợp</AlertTitle>
      <AlertDescription>
        Hệ thống đang so hồ sơ với các JD của đợt; danh sách gợi ý có thể còn thay đổi. Màn này tự cập nhật khi có kết
        quả.
      </AlertDescription>
    </Alert>
  );
  const lockedNotice = !editable && (
    <Alert>
      <Lock />
      <AlertTitle>Đã hết hạn chọn nguyện vọng</AlertTitle>
      <AlertDescription>
        Danh sách nguyện vọng đã khóa, không thêm, bỏ hay đổi thứ tự được nữa. Các nguyện vọng đã lưu được dùng cho các
        bước tiếp theo của đợt.
      </AlertDescription>
    </Alert>
  );

  // Nothing to choose from or to show yet.
  if (data.items.length === 0 && data.preferences.length === 0) {
    return (
      <>
        <PageTitle />
        <CampaignSummary campaign={campaign} />
        {scoring ? (
          <StateEmpty icon={<Hourglass />} title="Đang chấm độ phù hợp">
            Hệ thống đang so hồ sơ với các JD của đợt. Danh sách gợi ý sẽ hiện ở đây khi xong; màn này tự cập nhật.
          </StateEmpty>
        ) : (
          <>
            {lockedNotice}
            <StateEmpty icon={<SearchX />} title="Chưa có JD nào đạt ngưỡng phù hợp">
              Chưa có JD nào trong đợt vừa đáp ứng điều kiện bắt buộc vừa đạt ngưỡng điểm phù hợp với hồ sơ, nên chưa có
              JD để chọn nguyện vọng. {leftOutText(data)}
            </StateEmpty>
          </>
        )}
        <IneligibleList jds={data.ineligible} />
      </>
    );
  }

  const jds = new Map<number, ShortlistJd>([
    ...data.ineligible.map(({ jd }) => [jd.id, jd] as const),
    ...data.items.map(({ jd }) => [jd.id, jd] as const),
  ]);
  const shortlistIds = new Set(data.items.map(({ jd }) => jd.id));
  const required = Math.min(campaign.nNv, data.items.length);
  const full = draft.length >= campaign.nNv;
  const leftOut = leftOutText(data);

  return (
    <>
      {guard}
      <PageTitle />
      <CampaignSummary campaign={campaign} />
      {scoring && scoringNotice}
      {lockedNotice}
      <div className="flex min-w-0 flex-col lg:relative lg:left-1/2 lg:w-[min(80rem,calc(100vw_-_3rem))] lg:-translate-x-1/2">
        <Tabs
          value={tab}
          onValueChange={(next) => setTab(next as Tab)}
          className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6"
        >
          <TabsList className="w-full lg:hidden">
            <TabsTrigger value="suggestions">Gợi ý ({data.items.length})</TabsTrigger>
            <TabsTrigger value="preferences">
              Nguyện vọng {draft.length}/{campaign.nNv}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="suggestions"
            forceMount
            className="flex min-w-0 flex-col gap-6 data-[state=inactive]:hidden lg:data-[state=inactive]:flex"
          >
            <section aria-labelledby="shortlist-title" className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 id="shortlist-title" className="text-base font-medium">
                  JD được gợi ý ({data.items.length})
                </h2>
                <p className="text-sm text-muted-foreground">
                  Xếp theo điểm phù hợp với hồ sơ, cao nhất trước. {leftOut}
                </p>
                {editable && full && (
                  <p className="text-sm text-muted-foreground">
                    Đã chọn đủ {campaign.nNv} nguyện vọng. Bỏ một nguyện vọng để chọn JD khác.
                  </p>
                )}
              </div>
              {data.items.length > 0 ? (
                data.items.map((item) => {
                  const position = draft.indexOf(item.jd.id);
                  return (
                    <ShortlistCard
                      key={item.jd.id}
                      item={item}
                      rank={position === -1 ? null : position + 1}
                      editable={editable}
                      full={full}
                      onAdd={() => change(addToDraft(draft, item.jd.id, campaign.nNv))}
                      onRemove={() => change(removeFromDraft(draft, item.jd.id))}
                    />
                  );
                })
              ) : (
                <StateEmpty icon={<SearchX />} title="Không còn JD nào trong danh sách gợi ý">
                  Các JD từng được gợi ý không còn đạt điều kiện của đợt.
                </StateEmpty>
              )}
            </section>
            <IneligibleList jds={data.ineligible} />
          </TabsContent>
          <TabsContent
            value="preferences"
            forceMount
            className="min-w-0 data-[state=inactive]:hidden lg:sticky lg:top-20 lg:max-h-[calc(100svh_-_6rem)] lg:overflow-y-auto lg:data-[state=inactive]:block"
          >
            <PreferenceList
              campaign={campaign}
              draft={draft}
              saved={data.preferences}
              jds={jds}
              shortlistIds={shortlistIds}
              required={required}
              dirty={dirty}
              saving={save.isPending}
              error={saveError}
              onChange={change}
              onSave={() => void onSave()}
              onDiscard={() => {
                setSaveError(null);
                setEdited(null);
              }}
              onBrowse={() => setTab('suggestions')}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
