import { CircleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { useIsMobile } from '@/hooks/use-mobile';

interface ConfirmActionDialogProps {
  open: boolean;
  /** Closing is ignored while the request runs, so its error can show inside. */
  onClose: () => void;
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void;
  pending: boolean;
  /** Why the action failed, shown in the dialog. */
  error: string | null;
  errorTitle: string;
}

/**
 * Confirms a step that is hard to undo (DESIGN.md §6 `alert-dialog`): a bottom sheet on phones
 * (§5 item 7), an alert dialog from `md` up. It stays open until the request is done.
 */
export function ConfirmActionDialog({
  open,
  onClose,
  title,
  description,
  actionLabel,
  onConfirm,
  pending,
  error,
  errorTitle,
}: ConfirmActionDialogProps) {
  const isMobile = useIsMobile();
  const onOpenChange = (next: boolean) => {
    if (!next && !pending) onClose();
  };
  const errorAlert = error && (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{errorTitle}</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
  const action = (
    <Button onClick={onConfirm} disabled={pending}>
      {pending && <Spinner data-icon="inline-start" />}
      {actionLabel}
    </Button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85svh]">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {errorAlert && <div className="px-4">{errorAlert}</div>}
          <SheetFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            {action}
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Hủy
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {errorAlert}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel>
          {action}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
