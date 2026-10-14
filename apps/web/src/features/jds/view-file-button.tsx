import { FileText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/shared/api/errors';
import { fetchJdFileUrl } from './api';

/**
 * "Xem file gốc" (US-1.5 AC-9, AC-10): asks for a 5-minute presigned URL when clicked, then opens
 * it in a new tab. The tab is opened first, inside the click, so pop-up blockers allow it.
 */
export function ViewFileButton({ jdId, fileName }: { jdId: number; fileName: string }) {
  const [pending, setPending] = useState(false);

  async function open() {
    const tab = window.open('', '_blank');
    setPending(true);
    try {
      const url = await fetchJdFileUrl(jdId);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (error) {
      tab?.close();
      toast.error(`Không mở được file: ${apiErrorMessage(error)}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" onClick={() => void open()} disabled={pending} className="max-w-full min-w-0">
      {pending ? <Spinner data-icon="inline-start" /> : <FileText data-icon="inline-start" />}
      <span className="truncate">Xem file gốc: {fileName}</span>
    </Button>
  );
}
