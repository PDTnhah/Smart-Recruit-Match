import { type Cv, fileId } from '@srm/shared';
import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { formatDateTime } from '@/lib/format';
import { ViewFileButton } from '@/shared/files/view-file-button';
import { CvStatusBadge } from './cv-status-badge';

/** The student's CV versions in one campaign, newest first (US-1.6 AC-5, AC-8, AC-9). */
export function CvHistory({ cvs }: { cvs: Cv[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Các phiên bản đã nộp</h2>
        </CardTitle>
        <CardDescription>File của mọi phiên bản được giữ lại. Chỉ phiên bản đang dùng được chấm.</CardDescription>
      </CardHeader>
      <CardContent>
        {cvs.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>Chưa nộp CV</EmptyTitle>
              <EmptyDescription>CV nộp cho đợt này sẽ hiện ở đây cùng các phiên bản trước.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-4">
            {cvs.map((cv, index) => (
              <li key={cv.id} className="flex min-w-0 flex-col gap-4">
                {index > 0 && <Separator />}
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">Phiên bản {cv.version}</span>
                    <CvStatusBadge status={cv.status} />
                    {cv.active && <Badge variant="outline">Đang dùng</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">Nộp lúc {formatDateTime(cv.createdAt)}</p>
                  <div className="min-w-0">
                    <ViewFileButton fileId={fileId('cv', cv.id)} label={`Xem file: ${cv.fileName}`} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
