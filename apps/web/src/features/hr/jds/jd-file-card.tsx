import { fileId, type JobDescription } from '@srm/shared';
import { CircleAlert, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { useUploadJdFile } from '@/features/jds/api';
import { apiErrorMessage } from '@/shared/api/errors';
import { ViewFileButton } from '@/shared/files/view-file-button';
import { JdFilePicker } from './file-picker';

/** Upload or replace the original PDF/DOCX of a draft JD (US-1.5 AC-5, AC-10). */
export function JdFileCard({ jd }: { jd: JobDescription }) {
  const upload = useUploadJdFile();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Remounts the input after a successful upload so it shows no stale choice.
  const [inputKey, setInputKey] = useState(0);
  const pending = upload.isPending;

  async function send() {
    if (!file) return;
    setError(null);
    try {
      await upload.mutateAsync({ jdId: jd.id, file, rowVersion: jd.rowVersion });
      setFile(null);
      setInputKey((key) => key + 1);
      toast.success('Đã tải file JD lên');
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>File JD gốc</CardTitle>
        <CardDescription>Tải file mới sẽ thay file cũ. Hệ thống kiểm tra nội dung file, không chỉ đuôi file.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa tải được file</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {jd.file ? (
            <ViewFileButton fileId={fileId('jd', jd.id)} label={`Xem file gốc: ${jd.file.name}`} />
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có file gốc.</p>
          )}
          <JdFilePicker
            key={inputKey}
            id="jd-file-replace"
            label={jd.file ? 'Chọn file thay thế' : 'Chọn file JD'}
            onChange={setFile}
            disabled={pending}
          />
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => void send()} disabled={!file || pending} className="w-full sm:w-auto">
              {pending ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
              {pending ? 'Đang tải lên' : 'Tải file lên'}
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
