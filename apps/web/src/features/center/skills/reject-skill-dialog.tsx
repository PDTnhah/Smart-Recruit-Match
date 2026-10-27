import type { AdminSkill } from '@srm/shared';
import { CircleAlert, CircleX } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRejectSkill } from './api';
import { skillReviewErrorMessage } from './labels';

/**
 * "Từ chối" a new skill (US-2.5 AC-7): it stays out of the catalogue, and the same name found
 * again does not come back for review (CONTEXT D39). Profiles keep it as a new skill.
 */
export function RejectSkillDialog({ skill }: { skill: AdminSkill }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const reject = useRejectSkill(skill.id);
  const pending = reject.isPending;

  async function confirm() {
    setError(null);
    try {
      await reject.mutateAsync(skill.rowVersion);
      setOpen(false);
      toast.success(`Đã từ chối kỹ năng “${skill.canonicalName}”`);
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) setError(null);
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CircleX data-icon="inline-start" />
          Từ chối
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Từ chối kỹ năng “{skill.canonicalName}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Tên này không được thêm vào danh mục và không hiện lại trong danh sách chờ duyệt. Hồ sơ đã có tên này vẫn giữ
            nguyên. Thao tác này không hoàn tác được.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error !== null && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Chưa từ chối được kỹ năng</AlertTitle>
            <AlertDescription>{skillReviewErrorMessage(error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel>
          <Button variant="destructive" onClick={() => void confirm()} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {pending ? 'Đang từ chối' : 'Từ chối kỹ năng'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
