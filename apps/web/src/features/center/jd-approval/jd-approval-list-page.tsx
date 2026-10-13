import type { JobDescription } from '@srm/shared';
import { CircleAlert, ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCampaigns } from '@/features/center/campaigns/api';
import { useJds } from '@/features/jds/api';
import { WORK_MODE_LABELS } from '@/features/jds/labels';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { jdApprovalPath } from './paths';

const ALL_CAMPAIGNS = 'all';

function CampaignFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const campaigns = useCampaigns();
  const running = (campaigns.data ?? []).filter((campaign) => campaign.status !== 'DRAFT');
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

function PendingTable({ jds }: { jds: JobDescription[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vị trí</TableHead>
          <TableHead>Doanh nghiệp</TableHead>
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
            <TableCell className="text-right tabular-nums">{jd.quota}</TableCell>
            <TableCell>{jd.workMode ? WORK_MODE_LABELS[jd.workMode] : '—'}</TableCell>
            <TableCell>{formatDateTime(jd.updatedAt)}</TableCell>
            <TableCell>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link to={jdApprovalPath(jd.id)}>Xem và duyệt</Link>
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** "Duyệt JD" of the center portal (US-1.5 AC-10): JDs waiting for approval, by campaign. */
export function JdApprovalListPage() {
  const [campaign, setCampaign] = useState(ALL_CAMPAIGNS);
  const jds = useJds({
    status: 'PENDING_APPROVAL',
    ...(campaign === ALL_CAMPAIGNS ? {} : { campaignId: Number(campaign) }),
  });

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
  } else if (jds.data.length === 0) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardCheck />
          </EmptyMedia>
          <EmptyTitle>Không có JD chờ duyệt</EmptyTitle>
          <EmptyDescription>
            JD xuất hiện ở đây sau khi HR nộp và xác nhận yêu cầu chuẩn hóa. Chọn đợt khác để xem thêm.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = <PendingTable jds={jds.data} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold md:text-2xl">Duyệt JD</h1>
        <CampaignFilter value={campaign} onChange={setCampaign} />
      </div>
      {content}
    </>
  );
}
