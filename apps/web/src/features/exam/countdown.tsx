import { Timer, TimerOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { formatCountdown, formatMinutes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCountdown } from './server-clock';

/** Minutes left at which the room says so once (a toast, read out by screen readers too). */
const WARN_AT_MINUTES = [5, 1];

const LOW_MS = WARN_AT_MINUTES[0]! * 60_000;

interface CountdownProps {
  deadlineAt: string;
  offsetMs: number;
  /** Called once the server's deadline is reached. */
  onExpire: () => void;
}

/** Time left by the server's clock (AC-13); "Hết giờ" at 0. */
export function Countdown({ deadlineAt, offsetMs, onExpire }: CountdownProps) {
  const remaining = useCountdown(deadlineAt, offsetMs);
  const expired = remaining === 0;
  const warned = useRef<Set<number> | null>(null);
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  });

  useEffect(() => {
    // Thresholds already behind when the room opens are not announced.
    if (warned.current === null) {
      warned.current = new Set(WARN_AT_MINUTES.filter((minutes) => remaining <= minutes * 60_000));
      return;
    }
    for (const minutes of WARN_AT_MINUTES) {
      if (remaining > 0 && remaining <= minutes * 60_000 && !warned.current.has(minutes)) {
        warned.current.add(minutes);
        toast.warning(`Còn ${formatMinutes(minutes)} để làm bài`);
      }
    }
  }, [remaining]);

  useEffect(() => {
    if (expired) expire.current();
  }, [expired]);

  const Icon = expired ? TimerOff : Timer;
  return (
    <p className={cn('flex items-center gap-2 font-semibold tabular-nums', remaining <= LOW_MS && 'text-destructive')}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="sr-only">Thời gian còn lại:</span>
      <span role="timer">{expired ? 'Hết giờ' : formatCountdown(remaining)}</span>
    </p>
  );
}
