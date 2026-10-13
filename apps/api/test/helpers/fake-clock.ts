// A Clock the test controls (US-1.4 TASK-1.4.4). US-1.7, US-4.3 and later stories reuse this file;
// add methods here instead of creating a second fake.
//
//   const clock = new FakeClock('2001-01-01T00:00:00.000Z');
//   const t = await createAuthTestApp({ configure: (b) => b.overrideProvider(Clock).useValue(clock) });
//   clock.advance({ minutes: 45 });
//
// Integration test files share one database and run in parallel. Scheduler tests set the clock
// in 2001 and give their campaigns deadlines in 2001; every other test keeps deadlines near the
// real time (or none), so a scheduler run never moves another file's campaigns.
import { Clock } from '../../src/common/clock/index.js';

export interface Duration {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

const MS = { days: 86_400_000, hours: 3_600_000, minutes: 60_000, seconds: 1_000, milliseconds: 1 } as const;

export class FakeClock extends Clock {
  private current: number;

  constructor(start: Date | string = new Date()) {
    super();
    this.current = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(to: Date | string): void {
    this.current = new Date(to).getTime();
  }

  advance(by: Duration | number): void {
    this.current += typeof by === 'number' ? by : durationMs(by);
  }
}

function durationMs(duration: Duration): number {
  return (Object.keys(MS) as (keyof Duration)[]).reduce((sum, unit) => sum + (duration[unit] ?? 0) * MS[unit], 0);
}
