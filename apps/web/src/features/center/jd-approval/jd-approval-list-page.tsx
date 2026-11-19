import { type JobDescription, QUESTION_BANK_JD_STATES } from '@srm/shared';
import { CircleAlert, ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCampaigns, useCancelledCampaignIds } from '@/features/center/campaigns/api';
import { isWorkCampaign } from '@/features/center/campaigns/running-campaign';
import { useJds } from '@/features/jds/api';
import { JdStatusBadge } from '@/features/jds/jd-status-badge';
import { WORK_MODE_LABELS } from '@/features/jds/labels';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { jdApprovalPath } from './paths';

const ALL_CAMPAIGNS = 'all';

/**
 * Which JDs the list shows: those HR submitted, waiting for approval or approved (and every state after),
 * so an approved JD stays reachable with its question bank. Drafts and JDs HR is still confirming are HR's.
 */
const STATUS_FILTERS = {
  all: { label: 'Tất cả', matches: (jd: JobDescription) => isPending(jd) || isApproved(jd) },
  pending: { label: 'Chờ duyệt', matches: (jd: JobDescription) => isPending(jd) },
  approved: { label: 'Đã duyệt', matches: (jd: JobDescription) => isApproved(jd) },
} as const;

type StatusFilterKey = keyof typeof STATUS_FILTERS;

const STATUS_FILTER_KEYS = Object.keys(STATUS_FILTERS) as StatusFilterKey[];

function isPending(jd: JobDescription): boolean {
  return jd.status === 'PENDING_APPROVAL';
}

function isApproved(jd: JobDescription): boolean {
  return QUESTION_BANK_JD_STATES.includes(jd.status);
}

const EMPTY_TEXT: Readonly<Record<StatusFilterKey, { title: string; description: string }>> = {
  all: {
    title: 'Chưa có JD nào được nộp',
    description: 'JD xuất hiện ở đây sau khi HR nộp và xác nhận yêu cầu chuẩn hóa. Chọn đợt khác để xem thêm.',
  },
  pending: {
    title: 'Không có JD chờ duyệt',
    description: 'JD xuất hiện ở đây sau khi HR nộp và xác nhận yêu cầu chuẩn hóa. Chọn "Tất cả" để xem cả JD đã duyệt.',
  },
  approved: {
    title: 'Chưa có JD đã duyệt',
    description: 'JD đã duyệt ở lại danh sách này, kèm ngân hàng câu hỏi và đề mẫu của nó.',
  },
};

function StatusFilter({ value, onChange }: { value: StatusFilterKey; onChange: (value: StatusFilterKey) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as StatusFilterKey)}>
      <SelectTrigger aria-label="Trạng thái JD" className="w-full sm:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_FILTER_KEYS.map((key) => (
          <SelectItem key={key} value={key}>
            {STATUS_FILTERS[key].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CampaignFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const campaigns = useCampaigns();
  const running = (campaigns.data ?? []).filter((campaign) => isWorkCampaign(campaign.status));
  return (
    <Select value={value} onValueChange={onChange} disabled={campaigns.isPending}>
      <SelectTrigger aria-label="Đợt thực tập" className="w-full sm:w-72">
        <SelectValue placeholder="Chọn đợt" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_CAMPAIGNS}>Tất cả đợt</SelectItem>
        {running.map((campaign) => (
          <SelectItem key={campaign.id} value={String(campaign.id)}>
            {campaign.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function JdTable({ jds }: { jds: JobDescription[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vị trí</TableHead>
          <TableHead>Doanh nghiệp</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead className="text-right">Chỉ tiêu</TableHead>
          <TableHead>Hình thức</TableHead>
          <TableHead>Cập nhật</TableHead>
          <TableHead>
            <span className="sr-only">Thao tác</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jds.map((jd) => (
          <TableRow key={jd.id}>
            <TableCell className="max-w-64 truncate font-medium" title={jd.title}>
              <Link to={jdApprovalPath(jd.id)} className="hover:underline">
                {jd.title}
              </Link>
            </TableCell>
            <TableCell className="max-w-56 truncate" title={jd.companyName}>
              {jd.companyName}
            </TableCell>
            <TableCell>
              <JdStatusBadge jd={jd} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{jd.quota}</TableCell>
            <TableCell>{jd.workMode ? WORK_MODE_LABELS[jd.workMode] : '—'}</TableCell>
            <TableCell>{formatDateTime(jd.updatedAt)}</TableCell>
            <TableCell>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link to={jdApprovalPath(jd.id)}>{isPending(jd) ? 'Xem và duyệt' : 'Xem'}</Link>
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * "Duyệt JD" of the center portal (US-1.5 AC-10): the JDs HR submitted, by campaign and status. Approved JDs
 * stay listed (US-4.9), since their detail page holds the question bank and the sample review; those waiting for
 * approval come first.
 */
export function JdApprovalListPage() {
  const [campaign, setCampaign] = useState(ALL_CAMPAIGNS);
  const [status, setStatus] = useState<StatusFilterKey>('all');
  const jds = useJds(campaign === ALL_CAMPAIGNS ? {} : { campaignId: Number(campaign) });
  // A JD of a cancelled campaign can no longer be approved (409), nor its bank changed, so it is not listed.
  const cancelled = useCancelledCampaignIds();
  const { matches } = STATUS_FILTERS[status];
  const shown = jds.data?.filter((jd) => !cancelled.has(jd.campaignId) && matches(jd)) ?? [];
  // Newest first from the API; the ones waiting for approval before the rest.
  const listed = [...shown.filter(isPending), ...shown.filter((jd) => !isPending(jd))];

  let content;
  if (jds.isPending) {
    content = (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  } else if (jds.isError) {
    content = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được danh sách JD</AlertTitle>
        <AlertDescription>{apiErrorMessage(jds.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void jds.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (listed.length === 0) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardCheck />
          </EmptyMedia>
          <EmptyTitle>{EMPTY_TEXT[status].title}</EmptyTitle>
          <EmptyDescription>{EMPTY_TEXT[status].description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = <JdTable jds={listed} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold md:text-2xl">Duyệt JD</h1>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <StatusFilter value={status} onChange={setStatus} />
          <CampaignFilter value={campaign} onChange={setCampaign} />
        </div>
      </div>
      {content}
    </>
  );
}
