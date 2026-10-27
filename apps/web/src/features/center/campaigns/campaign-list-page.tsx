import { type Campaign, PHASE_END_DEADLINE } from '@srm/shared';
import { CalendarRange, CircleAlert, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime, formatRelative } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { useCampaigns } from './api';
import { CampaignStatusBadge } from './campaign-status-badge';
import { DEADLINE_LABELS } from './labels';
import { OpenCampaignDialog } from './open-campaign-dialog';
import { CAMPAIGNS_PATH, campaignPath } from './paths';

function NewCampaignButton() {
  return (
    <Button asChild>
      <Link to={`${CAMPAIGNS_PATH}/new`}>
        <Plus data-icon="inline-start" />
        Tạo đợt
      </Link>
    </Button>
  );
}

/** The deadline ending the current phase; drafts are not running yet. */
function NextDeadline({ campaign }: { campaign: Campaign }) {
  if (campaign.status === 'DRAFT') return <span className="text-muted-foreground">Chưa mở đợt</span>;
  const key = PHASE_END_DEADLINE[campaign.status];
  const at = key ? campaign.phaseDeadlines[key] : undefined;
  if (!key || !at) return <span className="text-muted-foreground">Không có</span>;
  return (
    <div className="flex flex-col">
      <span>{DEADLINE_LABELS[key].label}</span>
      <span className="text-muted-foreground">
        {formatDateTime(at)} · {formatRelative(at)}
      </span>
    </div>
  );
}

function CampaignTable({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tên đợt</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Mốc kế tiếp</TableHead>
          <TableHead>Đối tượng</TableHead>
          <TableHead>
            <span className="sr-only">Thao tác</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.map((campaign) => {
          const audience = `${campaign.target.cohorts.join(', ')} · ${campaign.target.majors.join(', ')}`;
          return (
            <TableRow key={campaign.id}>
              <TableCell className="font-medium">
                <Link to={campaignPath(campaign.id)} className="hover:underline">
                  {campaign.name}
                </Link>
              </TableCell>
              <TableCell>
                <CampaignStatusBadge status={campaign.status} />
              </TableCell>
              <TableCell>
                <NextDeadline campaign={campaign} />
              </TableCell>
              <TableCell className="max-w-64 truncate" title={audience}>
                {audience}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={campaignPath(campaign.id)}>
                      {campaign.status === 'DRAFT' ? 'Sửa' : 'Xem'}
                    </Link>
                  </Button>
                  {campaign.status === 'DRAFT' && <OpenCampaignDialog campaign={campaign} size="sm" />}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** "Đợt thực tập" of the center portal (US-1.4 AC-9), with the four states of DESIGN.md §7. */
export function CampaignListPage() {
  const campaigns = useCampaigns();

  let content;
  if (campaigns.isPending) {
    content = (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  } else if (campaigns.isError) {
    content = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được danh sách đợt</AlertTitle>
        <AlertDescription>{apiErrorMessage(campaigns.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void campaigns.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (campaigns.data.length === 0) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarRange />
          </EmptyMedia>
          <EmptyTitle>Chưa có đợt thực tập</EmptyTitle>
          <EmptyDescription>
            Tạo đợt đầu tiên với đối tượng, mốc thời gian và tham số. Đợt ở trạng thái nháp tới khi được mở.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <NewCampaignButton />
        </EmptyContent>
      </Empty>
    );
  } else {
    content = <CampaignTable campaigns={campaigns.data} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold md:text-2xl">Đợt thực tập</h1>
        {campaigns.isSuccess && campaigns.data.length > 0 && <NewCampaignButton />}
      </div>
      {content}
    </>
  );
}
