import { fileId, type JobDescription } from '@srm/shared';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { ViewFileButton } from '@/shared/files/view-file-button';
import { WORK_MODE_LABELS } from './labels';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

const missing = <span className="text-muted-foreground">Chưa nhập</span>;

/** Read-only view of a JD's FR-4 fields, description and original file. */
export function JdDetails({ jd, showCompany = false }: { jd: JobDescription; showCompany?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Thông tin vị trí</CardTitle>
          <CardDescription>Cập nhật lần cuối {formatDateTime(jd.updatedAt)}.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3">
            {showCompany && <Row label="Doanh nghiệp">{jd.companyName}</Row>}
            <Row label="Vị trí">{jd.title}</Row>
            <Row label="Chỉ tiêu">
              <span className="tabular-nums">{jd.quota}</span>
            </Row>
            <Row label="Địa điểm">{jd.location ?? missing}</Row>
            <Row label="Hình thức">{jd.workMode ? WORK_MODE_LABELS[jd.workMode] : missing}</Row>
            <Row label="Thời gian thực tập">{jd.internshipPeriod ?? missing}</Row>
            <Row label="Phụ cấp">{jd.allowance ?? <span className="text-muted-foreground">Không có</span>}</Row>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Nội dung JD</CardTitle>
          <CardDescription>Mô tả nhập tay và file gốc PDF/DOCX nếu có.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {jd.description ? (
            <p className="text-sm break-words whitespace-pre-line">{jd.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Không có mô tả nhập tay.</p>
          )}
          {jd.file ? (
            <ViewFileButton fileId={fileId('jd', jd.id)} label={`Xem file gốc: ${jd.file.name}`} />
          ) : (
            <p className="text-sm text-muted-foreground">Không có file gốc.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
