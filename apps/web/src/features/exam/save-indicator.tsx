import { CloudAlert, CloudCheck, CloudOff, CloudUpload, Lock, type LucideIcon } from 'lucide-react';
import { SAVE_STATUS_LABELS } from './labels';
import type { SaveStatus } from './use-exam-autosave';

const ICONS: Record<SaveStatus, LucideIcon> = {
  SAVED: CloudCheck,
  SAVING: CloudUpload,
  OFFLINE: CloudOff,
  RETRYING: CloudAlert,
  CLOSED: Lock,
};

/** Read out only when saving fails or stops; "Đang lưu / Đã lưu" would speak at every change. */
const ANNOUNCED: ReadonlySet<SaveStatus> = new Set(['OFFLINE', 'RETRYING', 'CLOSED']);

/** "Đã lưu / Đang lưu / Mất kết nối – sẽ lưu lại" (AC-13), with an icon so color is not the only cue. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const Icon = ICONS[status];
  return (
    <>
      <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{SAVE_STATUS_LABELS[status]}</span>
      </p>
      <span role="status" className="sr-only">
        {ANNOUNCED.has(status) ? SAVE_STATUS_LABELS[status] : ''}
      </span>
    </>
  );
}
