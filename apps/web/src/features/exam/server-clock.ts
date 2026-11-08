import { useEffect, useState } from 'react';

// The exam clock counts from the server's time, never the device's (AGENTS › Invariant 8, US-4.3
// AC-13): every exam response carries `serverNow`, and the room keeps how far the device's clock is
// from it.

/**
 * How many ms the server's clock is ahead of the browser's, from a response to a request sent at
 * `sentAt` and received at `receivedAt` (browser ms). The server is taken to have read its clock
 * halfway between the two.
 */
export function clockOffsetOf(serverNow: string, sentAt: number, receivedAt: number): number {
  return Date.parse(serverNow) - (sentAt + receivedAt) / 2;
}

/**
 * The browser's time, read again every `intervalMs` and whenever the tab becomes visible again
 * (browsers slow down timers of hidden tabs).
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
  return now;
}

/** Ms left until `deadlineAt` by the server's clock, never below 0; updated four times a second. */
export function useCountdown(deadlineAt: string, offsetMs: number): number {
  const now = useNow(250);
  return Math.max(0, Date.parse(deadlineAt) - (now + offsetMs));
}
