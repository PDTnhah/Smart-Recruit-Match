import { type Campaign, CV_FILE_ACCEPT } from '@srm/shared';
import { CircleAlert, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { formatNumber } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { checkDocumentFile, MAX_UPLOAD_MB } from '@/shared/files/check-document';
import { useSubmitCv } from './api';

/** The CV-specific wording of a refusal; anything else uses the shared messages. */
function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.body?.code === 'CAMPAIGN_PHASE_MISMATCH') {
    return 'Đã hết hạn nộp CV của đợt này nên không tải thêm phiên bản mới được.';
  }
  return apiErrorMessage(error);
}

/**
 * Step 2 of "Hồ sơ" (US-1.6 AC-3, AC-5, AC-9): pick a PDF/DOCX (the phone's file picker works with
 * the plain input) and upload it with progress. Every upload is a new version.
 */
export function CvUploadCard({ campaign, hasCv }: { campaign: Campaign; hasCv: boolean }) {
  const submit = useSubmitCv();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  // Remounts the input after a successful upload so it shows no stale choice.
  const [inputKey, setInputKey] = useState(0);
  const pending = submit.isPending;
  const percent = Math.round(progress * 100);

  async function send() {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      await submit.mutateAsync({ campaignId: campaign.id, file, onProgress: setProgress });
      setFile(null);
      setInputKey((key) => key + 1);
      toast.success('Đã nộp CV. Đang phân tích CV…');
    } catch (caught) {
      setError(submitErrorMessage(caught));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{hasCv ? 'Cập nhật CV' : 'Nộp CV'}</h2>
        </CardTitle>
        <CardDescription>
          Mỗi lần tải lên tạo một phiên bản mới. Phiên bản mới nhất được dùng để ghép thực tập.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa nộp được CV</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={fileError !== null}>
            <FieldLabel htmlFor="cv-file">Chọn file CV</FieldLabel>
            <Input
              key={inputKey}
              id="cv-file"
              type="file"
              accept={CV_FILE_ACCEPT}
              disabled={pending}
              aria-invalid={fileError !== null}
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                const problem = chosen ? checkDocumentFile(chosen) : null;
                setFileError(problem);
                setFile(problem ? null : chosen);
                setError(null);
              }}
            />
            <FieldDescription>
              PDF hoặc DOCX, tối đa {formatNumber(MAX_UPLOAD_MB, 0)} MB. File được lưu mã hóa. Hệ thống kiểm tra nội
              dung file, không chỉ đuôi file.
            </FieldDescription>
            {fileError && <FieldError>{fileError}</FieldError>}
          </Field>
          {pending && (
            <div className="flex flex-col gap-2">
              <Progress value={percent} aria-label="Tiến độ tải CV" />
              <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
                {percent < 100 ? `Đang tải lên ${formatNumber(percent, 0)}%` : 'Đang lưu CV'}
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => void send()} disabled={!file || pending} className="w-full sm:w-auto">
              {pending ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
              {pending ? 'Đang tải lên' : 'Tải CV lên'}
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
