import type { JobDescription } from '@srm/shared';
import { Briefcase, CircleAlert, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCampaigns } from '@/features/center/campaigns/api';
import { useJds } from '@/features/jds/api';
import { JdStatusBadge } from '@/features/jds/jd-status-badge';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { HR_JDS_PATH, hrJdPath } from './paths';

function NewJdButton() {
  return (
    <Button asChild>
      <Link to={`${HR_JDS_PATH}/new`}>
        <Plus data-icon="inline-start" />
        Đăng JD
      </Link>
    </Button>
  );
}

function JdTable({ jds }: { jds: JobDescription[] }) {
  const campaigns = useCampaigns();
  const campaignName = (id: number) => campaigns.data?.find((campaign) => campaign.id === id)?.name ?? '—';
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vị trí</TableHead>
          <TableHead>Đợt thực tập</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead className="text-right">Chỉ tiêu</TableHead>
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
              <Link to={hrJdPath(jd.id)} className="hover:underline">
                {jd.title}
              </Link>
            </TableCell>
            <TableCell className="max-w-56 truncate">{campaignName(jd.campaignId)}</TableCell>
            <TableCell>
              <JdStatusBadge jd={jd} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{jd.quota}</TableCell>
            <TableCell>{formatDateTime(jd.updatedAt)}</TableCell>
            <TableCell>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link to={hrJdPath(jd.id)}>{jd.status === 'DRAFT' ? 'Sửa' : 'Xem'}</Link>
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** "JD của tôi" of the HR portal (US-1.5 AC-10): only the company's JDs, with the four states. */
export function HrJdListPage() {
  const jds = useJds();

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
            <Briefcase />
          </EmptyMedia>
          <EmptyTitle>Chưa có JD</EmptyTitle>
          <EmptyDescription>
            Đăng JD bằng form hoặc tải file PDF/DOCX trong lúc đợt thực tập đang nhận JD.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <NewJdButton />
        </EmptyContent>
      </Empty>
    );
  } else {
    content = <JdTable jds={jds.data} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold md:text-2xl">JD của tôi</h1>
        {jds.isSuccess && jds.data.length > 0 && <NewJdButton />}
      </div>
      {content}
    </>
  );
}
