import type { AllocationJdView, AllocationRoundView, Campaign } from '@srm/shared';
import { ArrowRightLeft, CircleAlert, FileSearch, Play, RotateCcw, Send, Shuffle, TriangleAlert, UserMinus, UserPlus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCampaigns } from '@/features/center/campaigns/api';
import { CAMPAIGN_STATUS_LABELS } from '@/features/center/campaigns/labels';
import { isWorkCampaign } from '@/features/center/campaigns/running-campaign';
import { formatDateTime, formatNumber } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { IconBadge } from '@/shared/ui/icon-badge';
import { AdjustNominationDialog, type AdjustTarget } from './adjust-nomination-dialog';
import { useAllocationRound, useAllocationRounds, usePublishRound, useRunAllocation } from './api';
import { ExplanationSheet } from './explanation-sheet';
import {
  ADJUSTMENT_OP_LABELS,
  ALLOCATION_ROUND_STATUS_LABELS,
  formatScore,
  outcomeText,
  pendingSummary,
  ROUND_STATUS_BADGE,
} from './labels';

const positiveInt = (value: string | null): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/** The campaign shown when the URL names none: the one allocating, else the latest running. */
function defaultCampaignId(campaigns: readonly Campaign[]): number | null {
  return (campaigns.find((campaign) => campaign.status === 'ALLOCATION_REVIEW') ?? campaigns[0])?.id ?? null;
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function LoadError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
      <AlertAction>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Thử lại
        </Button>
      </AlertAction>
    </Alert>
  );
}

/**
 * A confirmation that stays open until the request is done (DESIGN.md §6 `alert-dialog`). A 409
 * (another staff member moved the draft on) closes it with a toast; other errors stay inside.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirm,
  pendingLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirm: string;
  pendingLabel: string;
  onConfirm: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change(next: boolean) {
    if (pending) return;
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function run() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 409 && caught.body?.code !== 'ALLOCATION_NOT_READY') {
        onOpenChange(false);
        toast.error(apiErrorMessage(caught));
      } else {
        setError(pendingSummary(caught) ?? apiErrorMessage(caught));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Chưa thực hiện được</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => change(false)}>
            Quay lại
          </Button>
          <Button type="button" disabled={pending} onClick={() => void run()}>
            {pending && <Spinner data-icon="inline-start" />}
            {pending ? pendingLabel : confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** No round yet: run round 1 once the campaign is in "Phân bổ & HR duyệt" (AC-1, AC-6). */
function NoRound({ campaign }: { campaign: Campaign }) {
  const run = useRunAllocation(campaign.id);
  const allowed = campaign.status === 'ALLOCATION_REVIEW';
  const notReady = pendingSummary(run.error);
  return (
    <div className="flex flex-col gap-4">
      {run.isError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Chưa chạy được phân bổ</AlertTitle>
          <AlertDescription>{notReady ?? apiErrorMessage(run.error)}</AlertDescription>
        </Alert>
      )}
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Shuffle />
          </EmptyMedia>
          <EmptyTitle>Chưa chạy phân bổ</EmptyTitle>
          <EmptyDescription>
            {allowed
              ? 'Hệ thống xếp sinh viên vào JD theo nguyện vọng và điểm tổng hợp. Kết quả là dự thảo: HR và sinh viên chỉ thấy sau khi công bố.'
              : `Đợt đang ở giai đoạn "${CAMPAIGN_STATUS_LABELS[campaign.status]}". Chỉ chạy được phân bổ khi đợt ở giai đoạn "Phân bổ & HR duyệt".`}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button disabled={!allowed || run.isPending} onClick={() => run.mutate(null)}>
            {run.isPending ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {run.isPending ? 'Đang chạy phân bổ' : 'Chạy phân bổ'}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{formatNumber(value)}</span>
    </div>
  );
}

function RoundSummary({ round, campaign }: { round: AllocationRoundView; campaign: Campaign }) {
  const run = useRunAllocation(campaign.id);
  const publish = usePublishRound(campaign.id, round.id);
  const [dialog, setDialog] = useState<'rerun' | 'publish' | null>(null);
  const draft = round.status === 'DRAFT';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Vòng {formatNumber(round.roundNo)}
          <IconBadge style={ROUND_STATUS_BADGE[round.status]}>{ALLOCATION_ROUND_STATUS_LABELS[round.status]}</IconBadge>
        </CardTitle>
        <CardDescription>
          Chạy lúc {formatDateTime(round.ranAt)}
          {round.publishedAt && ` · công bố lúc ${formatDateTime(round.publishedAt)}`}
          {draft && ' · HR và sinh viên chưa thấy dự thảo này'}
        </CardDescription>
        {draft && (
          <CardAction className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialog('rerun')}>
              <RotateCcw data-icon="inline-start" />
              Chạy lại
            </Button>
            <Button onClick={() => setDialog('publish')}>
              <Send data-icon="inline-start" />
              Công bố
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Count label="Sinh viên được xét" value={round.counts.students} />
        <Count label="Đề cử" value={round.counts.nominated} />
        <Count label="Chưa có đề cử" value={round.counts.unassigned} />
        <Count label="Nguyện vọng không đủ điều kiện" value={round.counts.excludedPairs} />
      </CardContent>
      <ConfirmDialog
        open={dialog === 'rerun'}
        onOpenChange={(open) => setDialog(open ? 'rerun' : null)}
        title="Chạy lại phân bổ?"
        description="Dự thảo hiện tại và mọi điều chỉnh tay sẽ được thay bằng kết quả mới tính từ dữ liệu hiện tại của đợt. Lần chạy lại được ghi nhật ký."
        confirm="Chạy lại"
        pendingLabel="Đang chạy"
        onConfirm={async () => {
          await run.mutateAsync(round.rowVersion);
          toast.success('Đã chạy lại phân bổ');
        }}
      />
      <ConfirmDialog
        open={dialog === 'publish'}
        onOpenChange={(open) => setDialog(open ? 'publish' : null)}
        title="Công bố vòng phân bổ?"
        description={`HR từng JD nhận danh sách đề cử và ${formatNumber(round.counts.students)} sinh viên nhận thông báo kết quả. Sau khi công bố không chạy lại hay điều chỉnh được nữa.`}
        confirm="Công bố"
        pendingLabel="Đang công bố"
        onConfirm={async () => {
          await publish.mutateAsync(round.rowVersion);
          toast.success('Đã công bố vòng phân bổ', { description: 'HR và sinh viên đã nhận thông báo trong ứng dụng.' });
        }}
      />
    </Card>
  );
}

function Warnings({ round }: { round: AllocationRoundView }) {
  if (round.warnings.length === 0) return null;
  const titleOf = new Map(round.jds.map((jd) => [jd.jdId, jd.title]));
  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>Điều chỉnh tay làm {formatNumber(round.warnings.length)} cặp không còn ổn định</AlertTitle>
      <AlertDescription>
        <p>Chỉ là cảnh báo: dự thảo vẫn công bố được.</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {round.warnings.slice(0, 10).map((warning) => (
            <li key={`${warning.studentId}:${warning.jdId}`} className="break-words">
              {warning.studentCode} muốn vào "{titleOf.get(warning.jdId) ?? `JD #${warning.jdId}`}" và{' '}
              {warning.outranksStudentCode ? `xếp trên ${warning.outranksStudentCode} đang được giữ ở đó` : 'JD này còn suất'}.
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function JdHeader({ jd }: { jd: AllocationJdView }) {
  return (
    <TableRow>
      <TableHead colSpan={6} scope="rowgroup" className="h-auto py-2 whitespace-normal">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="break-words">{jd.title}</span>
          <span className="font-normal text-muted-foreground break-words">{jd.companyName}</span>
          <span className="font-normal text-muted-foreground tabular-nums">
            · Chỉ tiêu {formatNumber(jd.quota)} · Sức chứa {formatNumber(jd.capacity)} · {formatNumber(jd.nominated)}/
            {formatNumber(jd.capacity)} đề cử{jd.fillPercent !== null && ` (${formatNumber(jd.fillPercent)}%)`}
          </span>
          {jd.short && <Badge variant="outline">Thiếu hồ sơ</Badge>}
        </span>
      </TableHead>
    </TableRow>
  );
}

/** AC-7: by JD, quota, C_j, nominations and fill rate; one row per nominated student. */
function NominationTable({
  round,
  onAdjust,
  onExplain,
}: {
  round: AllocationRoundView;
  onAdjust: (target: AdjustTarget) => void;
  onExplain: (studentId: number) => void;
}) {
  const draft = round.status === 'DRAFT';
  return (
    <section aria-labelledby="allocation-jds" className="flex flex-col gap-2">
      <h2 id="allocation-jds" className="text-base font-medium">
        Đề cử theo JD
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">Hạng</TableHead>
            <TableHead>Sinh viên</TableHead>
            <TableHead>NV</TableHead>
            <TableHead className="text-right">S_final</TableHead>
            <TableHead>Ghi chú</TableHead>
            <TableHead>
              <span className="sr-only">Thao tác</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        {round.jds.map((jd) => (
          <TableBody key={jd.jdId}>
            <JdHeader jd={jd} />
            {jd.nominations.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Chưa có đề cử.
                </TableCell>
              </TableRow>
            )}
            {jd.nominations.map((nomination) => {
              const label = `${nomination.studentCode} · ${nomination.fullName}`;
              return (
                <TableRow key={nomination.id}>
                  <TableCell className="text-right tabular-nums">{formatNumber(nomination.rank)}</TableCell>
                  <TableCell className="max-w-64">
                    <span className="flex flex-col">
                      <span className="tabular-nums">{nomination.studentCode}</span>
                      <span className="truncate text-muted-foreground" title={nomination.fullName}>
                        {nomination.fullName}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={nomination.preferenceRank === 1 ? 'default' : 'outline'}>NV{nomination.preferenceRank}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatScore(nomination.sFinal)}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    {nomination.overrideReason && (
                      <span className="flex flex-col gap-1">
                        <Badge variant="outline">Điều chỉnh tay</Badge>
                        <span className="text-muted-foreground break-words">{nomination.overrideReason}</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" aria-label={`Giải thích kết quả của ${label}`} onClick={() => onExplain(nomination.studentId)}>
                        <FileSearch />
                      </Button>
                      {draft && (
                        <>
                          <Button
                            variant="outline"
                            aria-label={`Chuyển ${label} sang JD khác`}
                            onClick={() =>
                              onAdjust({ op: 'move', nominationId: nomination.id, studentLabel: label, jdId: jd.jdId, jdTitle: jd.title })
                            }
                          >
                            <ArrowRightLeft data-icon="inline-start" />
                            Chuyển
                          </Button>
                          <Button
                            variant="outline"
                            aria-label={`Bỏ đề cử ${label}`}
                            onClick={() =>
                              onAdjust({ op: 'remove', nominationId: nomination.id, studentLabel: label, jdId: jd.jdId, jdTitle: jd.title })
                            }
                          >
                            <UserMinus data-icon="inline-start" />
                            Bỏ
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        ))}
      </Table>
    </section>
  );
}

/** AC-7, AC-13: students with an eligible NV and no nomination, with the reason for each NV. */
function UnassignedTable({
  round,
  onAdjust,
  onExplain,
}: {
  round: AllocationRoundView;
  onAdjust: (target: AdjustTarget) => void;
  onExplain: (studentId: number) => void;
}) {
  return (
    <section aria-labelledby="allocation-unassigned" className="flex flex-col gap-2">
      <h2 id="allocation-unassigned" className="text-base font-medium">
        Sinh viên chưa có đề cử ({formatNumber(round.unassigned.length)})
      </h2>
      {round.unassigned.length === 0 ? (
        <p className="text-sm text-muted-foreground">Mọi sinh viên có nguyện vọng hợp lệ đều đã có đề cử.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sinh viên</TableHead>
              <TableHead>Lý do theo nguyện vọng</TableHead>
              <TableHead>
                <span className="sr-only">Thao tác</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {round.unassigned.map((student) => {
              const label = `${student.studentCode} · ${student.fullName}`;
              return (
                <TableRow key={student.studentId}>
                  <TableCell className="max-w-64 align-top">
                    <span className="flex flex-col">
                      <span className="tabular-nums">{student.studentCode}</span>
                      <span className="truncate text-muted-foreground" title={student.fullName}>
                        {student.fullName}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <ul className="flex flex-col gap-1">
                      {student.preferences.map((preference) => (
                        <li key={preference.jdId} className="break-words">
                          <span className="font-medium">
                            NV{preference.preferenceRank} · {preference.title}:
                          </span>{' '}
                          {outcomeText(preference)}
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" aria-label={`Giải thích kết quả của ${label}`} onClick={() => onExplain(student.studentId)}>
                        <FileSearch />
                      </Button>
                      {round.status === 'DRAFT' && (
                        <Button variant="outline" onClick={() => onAdjust({ op: 'add', studentId: student.studentId, studentLabel: label })}>
                          <UserPlus data-icon="inline-start" />
                          Thêm đề cử
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/** BR-10: every manual change of the draft, oldest first. */
function AdjustmentLog({ round }: { round: AllocationRoundView }) {
  if (round.adjustments.length === 0) return null;
  const titleOf = new Map(round.jds.map((jd) => [jd.jdId, jd.title]));
  const jd = (id: number | null) => (id === null ? '—' : (titleOf.get(id) ?? `JD #${id}`));
  return (
    <section aria-labelledby="allocation-adjustments" className="flex flex-col gap-2">
      <h2 id="allocation-adjustments" className="text-base font-medium">
        Điều chỉnh đã làm
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lúc</TableHead>
            <TableHead>Thao tác</TableHead>
            <TableHead>Sinh viên</TableHead>
            <TableHead>Từ → đến</TableHead>
            <TableHead>Lý do</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {round.adjustments.map((adjustment, index) => (
            <TableRow key={index}>
              <TableCell className="tabular-nums">{formatDateTime(adjustment.at)}</TableCell>
              <TableCell>{ADJUSTMENT_OP_LABELS[adjustment.op]}</TableCell>
              <TableCell className="tabular-nums">{adjustment.studentCode}</TableCell>
              <TableCell className="max-w-64 whitespace-normal break-words">
                {jd(adjustment.fromJdId)} → {jd(adjustment.toJdId)}
              </TableCell>
              <TableCell className="max-w-80 whitespace-normal break-words">{adjustment.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function RoundPanel({ roundId, campaign }: { roundId: number; campaign: Campaign }) {
  const round = useAllocationRound(roundId);
  const [adjusting, setAdjusting] = useState<{ key: number; target: AdjustTarget } | null>(null);
  const [explaining, setExplaining] = useState<number | null>(null);

  if (round.isPending) return <PageSkeleton />;
  if (round.isError) return <LoadError title="Không tải được vòng phân bổ" error={round.error} onRetry={() => void round.refetch()} />;
  const view = round.data;
  const nominatedTitle =
    explaining === null
      ? null
      : (view.jds.find((jd) => jd.nominations.some((nomination) => nomination.studentId === explaining))?.title ?? null);
  const adjust = (target: AdjustTarget) => setAdjusting({ key: Date.now(), target });

  return (
    <div className="flex flex-col gap-6">
      <RoundSummary round={view} campaign={campaign} />
      <Warnings round={view} />
      <NominationTable round={view} onAdjust={adjust} onExplain={setExplaining} />
      <UnassignedTable round={view} onAdjust={adjust} onExplain={setExplaining} />
      <AdjustmentLog round={view} />
      {adjusting && (
        <AdjustNominationDialog
          key={adjusting.key}
          campaignId={campaign.id}
          roundId={view.id}
          rowVersion={view.rowVersion}
          jds={view.jds}
          target={adjusting.target}
          onClose={() => setAdjusting(null)}
        />
      )}
      <ExplanationSheet roundId={view.id} studentId={explaining} nominatedTitle={nominatedTitle} onClose={() => setExplaining(null)} />
    </div>
  );
}

/**
 * "Phân bổ" of the center portal (GĐ7, FR-26, FR-27, US-5.2 AC-15): run round 1, read the draft by
 * JD and the students without a nomination, adjust it with a reason, publish. The campaign is in
 * the URL (`?campaign=`).
 */
export function AllocationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const campaigns = useCampaigns();
  const running = (campaigns.data ?? []).filter((campaign) => isWorkCampaign(campaign.status));
  const campaignId = positiveInt(searchParams.get('campaign')) ?? defaultCampaignId(running);
  const campaign = running.find((item) => item.id === campaignId) ?? null;
  const rounds = useAllocationRounds(campaign?.id ?? null);
  const roundId = rounds.data?.[0]?.id ?? null;

  let content;
  if (campaigns.isPending || (campaign !== null && rounds.isPending)) {
    content = <PageSkeleton />;
  } else if (campaigns.isError) {
    content = <LoadError title="Không tải được danh sách đợt" error={campaigns.error} onRetry={() => void campaigns.refetch()} />;
  } else if (campaign === null) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Shuffle />
          </EmptyMedia>
          <EmptyTitle>Chưa có đợt nào đang chạy</EmptyTitle>
          <EmptyDescription>Vòng phân bổ chạy được khi một đợt thực tập sang giai đoạn "Phân bổ & HR duyệt".</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else if (rounds.isError) {
    content = <LoadError title="Không tải được vòng phân bổ" error={rounds.error} onRetry={() => void rounds.refetch()} />;
  } else if (roundId === null) {
    content = <NoRound campaign={campaign} />;
  } else {
    content = <RoundPanel key={roundId} roundId={roundId} campaign={campaign} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold md:text-2xl">Phân bổ</h1>
        {running.length > 0 && (
          <Select
            value={campaign ? String(campaign.id) : undefined}
            onValueChange={(value) => setSearchParams({ campaign: value }, { replace: true })}
          >
            <SelectTrigger className="w-full sm:w-72" aria-label="Đợt thực tập">
              <SelectValue placeholder="Chọn đợt" />
            </SelectTrigger>
            <SelectContent>
              {running.map((item) => (
                <SelectItem key={item.id} value={String(item.id)} textValue={item.name}>
                  <span className="flex flex-col">
                    <span className="break-words">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{CAMPAIGN_STATUS_LABELS[item.status]}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {content}
    </div>
  );
}
