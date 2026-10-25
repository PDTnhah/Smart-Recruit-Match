import { type CenterCv, fileId } from '@srm/shared';
import { CircleAlert, FileCheck } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCampaigns } from '@/features/center/campaigns/api';
import { CvStatusBadge } from '@/features/student/profile/cv-status-badge';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { ViewFileButton } from '@/shared/files/view-file-button';
import { useCenterCvs } from './api';
import { analysisErrorLabel } from './labels';

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

/** Why a CV is on the list; both reasons can apply. */
function Reasons({ cv }: { cv: CenterCv }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {cv.status === 'ANALYSIS_FAILED' && <span>{analysisErrorLabel(cv.analysisErrorCode)}</span>}
      {cv.hiddenTextDetected && <Badge variant="outline">Có chữ ẩn</Badge>}
    </div>
  );
}

function AttentionTable({ cvs }: { cvs: CenterCv[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mã SV</TableHead>
          <TableHead>Họ tên</TableHead>
          <TableHead className="text-right">Phiên bản</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Lý do</TableHead>
          <TableHead>Nộp lúc</TableHead>
          <TableHead>
            <span className="sr-only">Thao tác</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cvs.map((cv) => (
          <TableRow key={cv.id}>
            <TableCell className="font-medium tabular-nums">{cv.studentCode}</TableCell>
            <TableCell className="max-w-56 truncate" title={cv.studentName}>
              {cv.studentName}
            </TableCell>
            <TableCell className="text-right tabular-nums">{cv.version}</TableCell>
            <TableCell>
              <CvStatusBadge status={cv.status} />
            </TableCell>
            <TableCell>
              <Reasons cv={cv} />
            </TableCell>
            <TableCell>{formatDateTime(cv.createdAt)}</TableCell>
            <TableCell>
              <div className="flex max-w-48 justify-end">
                <ViewFileButton fileId={fileId('cv', cv.id)} label="Tải CV" />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * "CV cần xử lý" of the center portal (US-2.4 AC-11, CONTEXT D37): the CVs that count whose
 * analysis failed or whose file hid text, by campaign. Staff open the file and contact the
 * student; re-sending failed CVs is the `cv:redispatch` command, not a button.
 */
export function CvAttentionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const campaign = searchParams.get('campaign') ?? ALL_CAMPAIGNS;
  const cvs = useCenterCvs({
    attention: true,
    ...(campaign === ALL_CAMPAIGNS ? {} : { campaignId: Number(campaign) }),
  });

  let content;
  if (cvs.isPending) {
    content = (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  } else if (cvs.isError) {
    content = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được danh sách CV</AlertTitle>
        <AlertDescription>{apiErrorMessage(cvs.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void cvs.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (cvs.data.length === 0) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileCheck />
          </EmptyMedia>
          <EmptyTitle>Không có CV cần xử lý</EmptyTitle>
          <EmptyDescription>
            CV hiện ở đây khi hệ thống không phân tích được hoặc phát hiện chữ ẩn trong file. Chọn đợt khác để xem
            thêm.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = <AttentionTable cvs={cvs.data} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold md:text-2xl">CV cần xử lý</h1>
        <CampaignFilter
          value={campaign}
          onChange={(value) => setSearchParams(value === ALL_CAMPAIGNS ? {} : { campaign: value }, { replace: true })}
        />
      </div>
      {content}
    </>
  );
}
