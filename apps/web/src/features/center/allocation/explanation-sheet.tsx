import { CircleAlert } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { useAllocationExplanation } from './api';
import { formatScore, outcomeText } from './labels';

/**
 * "Vì sao không vào được A?" for the center (NFR-4, US-5.2 AC-13, DESIGN.md §6 `sheet`): each NV
 * the student ranked above their result, the reason, and the figures behind it, including the
 * lowest score the JD kept. Students see the same reasons without other students' figures.
 */
export function ExplanationSheet({
  roundId,
  studentId,
  nominatedTitle,
  onClose,
}: {
  roundId: number;
  /** Null closes the sheet. */
  studentId: number | null;
  /** Title of the JD the student holds now, if any. */
  nominatedTitle: string | null;
  onClose: () => void;
}) {
  const explanation = useAllocationExplanation(roundId, studentId);
  const data = explanation.data;

  let body;
  if (explanation.isPending) {
    body = (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  } else if (explanation.isError) {
    body = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được giải thích</AlertTitle>
        <AlertDescription>{apiErrorMessage(explanation.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void explanation.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (data!.items.length === 0) {
    body = <p className="text-sm text-muted-foreground">Sinh viên được đề cử vào nguyện vọng 1: không có nguyện vọng nào xếp trên để giải thích.</p>;
  } else {
    body = (
      <ol className="flex flex-col gap-4">
        {data!.items.map((item) => (
          <li key={item.jdId} className="flex flex-col gap-1 text-sm">
            <span className="font-medium break-words">
              NV{item.preferenceRank} · {item.title}
              <span className="font-normal text-muted-foreground"> · {item.companyName}</span>
            </span>
            <span className="break-words">{outcomeText(item)}</span>
            <span className="text-muted-foreground tabular-nums">
              S_final của sinh viên: {item.sFinal === null ? 'chưa có' : formatScore(item.sFinal)} · JD giữ{' '}
              {formatNumber(item.held)}/{formatNumber(item.capacity)} đề cử
              {item.lowestHeld &&
                ` · thấp nhất được giữ: ${item.lowestHeld.studentCode} (${formatScore(item.lowestHeld.sFinal)})`}
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <Sheet open={studentId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="data-[side=right]:md:max-w-lg">
        {/* Room for the close button in the corner. */}
        <SheetHeader className="pr-12">
          <SheetTitle className="break-words">
            {data ? `${data.studentCode} · ${data.fullName}` : 'Giải thích kết quả phân bổ'}
          </SheetTitle>
          <SheetDescription className="break-words">
            {nominatedTitle ? `Đang được đề cử vào "${nominatedTitle}".` : 'Chưa có đề cử ở vòng này.'}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4">{body}</div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Đóng</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
