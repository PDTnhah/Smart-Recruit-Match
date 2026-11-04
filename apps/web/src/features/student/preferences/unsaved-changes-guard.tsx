import { useCallback } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router';
import { ConfirmActionDialog } from '@/features/student/profile/confirm-action-dialog';

/**
 * Warns before unsaved preferences are lost (US-3.3 AC-14): leaving for another screen of the
 * portal asks first; closing or reloading the tab gets the browser's own prompt.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname,
  );
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (when) event.preventDefault();
      },
      [when],
    ),
  );

  return (
    <ConfirmActionDialog
      open={blocker.state === 'blocked'}
      onClose={() => blocker.reset?.()}
      title="Rời trang khi chưa lưu nguyện vọng?"
      description='Thứ tự nguyện vọng vừa sửa chưa được lưu và sẽ mất. Bấm "Hủy" rồi "Lưu nguyện vọng" để giữ lại.'
      actionLabel="Rời trang"
      onConfirm={() => blocker.proceed?.()}
      pending={false}
      error={null}
      errorTitle=""
    />
  );
}
