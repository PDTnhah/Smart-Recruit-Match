import { Spinner } from '@/components/ui/spinner';

/** Shown while the session is being restored (DESIGN.md §7, loading). */
export function FullPageSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
