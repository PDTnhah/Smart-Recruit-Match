import {
  ALLOCATION_EXCLUSION_REASON_LABELS,
  ALLOCATION_OUTCOME_REASON_LABELS,
  HR_REJECT_REASON_LABELS,
  type HrRejectReason,
  type MyAllocationResult,
  NOMINATION_STATUS_LABELS,
  type NominationStatus,
} from '@srm/shared';
import { CircleAlert, Hourglass, Trophy } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, formatNumber } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { useMyAllocationResults, useMyNominationReviews } from './api';

function PageTitle() {
  return <h1 className="font-heading text-xl font-semibold md:text-2xl">Kết quả phân bổ</h1>;
}

/** The reason in the student's words; only their own score, never another student's (PRD › Personas). */
function Reasons({ result }: { result: MyAllocationResult }) {
  if (result.preferences.length === 0) return null;
  return (
    <section aria-label="Lý do theo nguyện vọng" className="flex flex-col gap-3">
      <h3 className="text-base font-medium">{result.nomination ? 'Vì sao không vào nguyện vọng cao hơn' : 'Lý do theo từng nguyện vọng'}</h3>
      <ol className="flex flex-col gap-3">
        {result.preferences.map((preference) => (
          <li key={preference.jdId} className="flex flex-col gap-1 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant={preference.preferenceRank === 1 ? 'default' : 'outline'}>NV{preference.preferenceRank}</Badge>
              <span className="min-w-0 font-medium break-words">{preference.title}</span>
            </span>
            <span className="text-muted-foreground break-words">{preference.companyName}</span>
            <span className="break-words">
              {ALLOCATION_OUTCOME_REASON_LABELS[preference.reason]}
              {preference.exclusionReasons.length > 0 &&
                `: ${preference.exclusionReasons.map((code) => ALLOCATION_EXCLUSION_REASON_LABELS[code].toLowerCase()).join(', ')}`}
              .
            </span>
            {preference.sFinal !== null && (
              <span className="text-muted-foreground tabular-nums">Điểm tổng hợp của bạn: {formatNumber(preference.sFinal, 2)}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What the nomination's state means for the student (GĐ8, US-5.3 AC-5, AC-6). */
function nominationNote(status: NominationStatus, rejectReason: HrRejectReason | null | undefined): string {
  switch (status) {
    case 'NOMINATED':
      return 'Doanh nghiệp sẽ xem hồ sơ và báo kết quả cho bạn qua hệ thống.';
    case 'INTERVIEW':
      return 'Doanh nghiệp mời bạn phỏng vấn. Lịch phỏng vấn sẽ được báo qua hệ thống.';
    case 'HR_REJECTED':
      // The catalogue label only; HR's note never reaches the student (GĐ8, BR-12).
      return `Doanh nghiệp không tiếp tục với hồ sơ này${rejectReason ? `. Lý do: ${HR_REJECT_REASON_LABELS[rejectReason].toLowerCase()}` : ''}. Các nguyện vọng còn lại của bạn được xét ở vòng bổ sung.`;
    default:
      return 'Theo dõi kết quả tiếp theo qua thông báo của hệ thống.';
  }
}

function ResultCard({ result, rejectReasons }: { result: MyAllocationResult; rejectReasons: ReadonlyMap<number, HrRejectReason | null> }) {
  const { nomination } = result;
  // Without a nomination every NV is listed; when BR-07 kept all of them out, none waits for a round.
  const noneEligible =
    !nomination && result.preferences.length > 0 && result.preferences.every((preference) => preference.reason === 'NOT_ELIGIBLE');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-words">{result.campaignName}</CardTitle>
        <CardDescription>
          Vòng {formatNumber(result.roundNo)} · công bố lúc {formatDateTime(result.publishedAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {nomination ? (
          <div className="flex flex-col gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <Trophy className="size-5 shrink-0" aria-hidden="true" />
              <span className="font-medium">Bạn được đề cử</span>
              <Badge>{NOMINATION_STATUS_LABELS[nomination.status]}</Badge>
            </span>
            <p className="text-sm break-words">
              <span className="font-medium">{nomination.title}</span> · {nomination.companyName}
            </p>
            <p className="text-sm text-muted-foreground">
              {nominationNote(nomination.status, rejectReasons.get(nomination.nominationId))}
            </p>
          </div>
        ) : noneEligible ? (
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
              <span className="font-medium">Không có nguyện vọng đủ điều kiện đề cử</span>
            </span>
            <p className="text-sm text-muted-foreground">
              Vòng này không có nguyện vọng nào của bạn đạt điều kiện để được đề cử. Lý do của từng nguyện vọng ở bên dưới.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2">
              <Hourglass className="size-5 shrink-0" aria-hidden="true" />
              <span className="font-medium">Đang chờ vòng sau</span>
            </span>
            <p className="text-sm text-muted-foreground">
              Vòng này chưa có đề cử cho bạn. Các nguyện vọng còn hợp lệ được xét tiếp ở vòng bổ sung.
            </p>
          </div>
        )}
        {result.preferences.length > 0 && <Separator />}
        <Reasons result={result} />
      </CardContent>
    </Card>
  );
}

/**
 * "Kết quả" of the student portal (US-5.2 AC-13, AC-15, NFR-13): where the student is nominated
 * after each published round, or that they wait, with the reason for each NV ranked above; what HR
 * decided, a rejection with its catalogue reason only (US-5.3 AC-6). Cards,
 * one column, for a 360 px phone (DESIGN.md §5).
 */
export function ResultsPage() {
  const results = useMyAllocationResults();
  // A failed read only leaves the reason out: the state itself comes with the results.
  const reviews = useMyNominationReviews();
  const rejectReasons = new Map((reviews.data ?? []).map((review) => [review.nominationId, review.reasonCode]));

  let content;
  if (results.isPending) {
    content = (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else if (results.isError) {
    content = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được kết quả phân bổ</AlertTitle>
        <AlertDescription>{apiErrorMessage(results.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void results.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (results.data.length === 0) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Trophy />
          </EmptyMedia>
          <EmptyTitle>Chưa có kết quả phân bổ</EmptyTitle>
          <EmptyDescription>Kết quả hiện ở đây khi Trung tâm công bố vòng phân bổ của đợt bạn tham gia.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <div className="flex flex-col gap-4">
        {results.data.map((result) => (
          <ResultCard key={`${result.campaignId}:${result.roundNo}`} result={result} rejectReasons={rejectReasons} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle />
      {content}
    </div>
  );
}
