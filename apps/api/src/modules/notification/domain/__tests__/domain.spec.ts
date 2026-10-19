import { DEDUPE_KEYS } from '../dedupe-keys.js';
import { afterEmailFailure, EMAIL_MAX_ATTEMPTS } from '../email-retry.js';
import { inReminderWindow } from '../reminder-window.js';

const deadline = new Date('2026-11-02T10:00:00.000Z');
const at = (iso: string) => new Date(iso);

describe('GĐ2: reminder window before a deadline', () => {
  it('GĐ2: opens hoursBefore hours ahead and closes at the deadline', () => {
    expect(inReminderWindow(deadline, 24, at('2026-11-01T09:59:59.999Z'))).toBe(false);
    expect(inReminderWindow(deadline, 24, at('2026-11-01T10:00:00.000Z'))).toBe(true);
    expect(inReminderWindow(deadline, 24, at('2026-11-02T09:59:59.999Z'))).toBe(true);
    expect(inReminderWindow(deadline, 24, at('2026-11-02T10:00:00.000Z'))).toBe(false);
  });

  it('GĐ2: follows the campaign parameter', () => {
    expect(inReminderWindow(deadline, 1, at('2026-11-02T08:30:00.000Z'))).toBe(false);
    expect(inReminderWindow(deadline, 1, at('2026-11-02T09:30:00.000Z'))).toBe(true);
    expect(inReminderWindow(deadline, 168, at('2026-10-26T10:00:00.000Z'))).toBe(true);
  });
});

describe('FR-8: email retries', () => {
  const now = at('2026-10-19T00:00:00.000Z');

  it('FR-8: retries after 1 and then 5 minutes', () => {
    expect(afterEmailFailure(1, now)).toEqual({ status: 'PENDING', nextAttemptAt: at('2026-10-19T00:01:00.000Z') });
    expect(afterEmailFailure(2, now)).toEqual({ status: 'PENDING', nextAttemptAt: at('2026-10-19T00:05:00.000Z') });
  });

  it('FR-8: gives up after the maximum number of attempts', () => {
    expect(EMAIL_MAX_ATTEMPTS).toBe(3);
    expect(afterEmailFailure(3, now)).toEqual({ status: 'FAILED' });
    expect(afterEmailFailure(4, now)).toEqual({ status: 'FAILED' });
  });
});

describe('FR-8: dedupe keys', () => {
  it('FR-8: one key per campaign opening', () => {
    expect(DEDUPE_KEYS.campaignOpened(7)).toBe('campaign_opened:7');
  });

  it('GĐ2: an extended deadline gets a new key', () => {
    const first = DEDUPE_KEYS.deadline(7, 'intake_end', deadline);
    expect(first).toBe('deadline:7:intake_end:2026-11-02T10:00:00.000Z');
    expect(DEDUPE_KEYS.deadline(7, 'intake_end', at('2026-11-03T10:00:00.000Z'))).not.toBe(first);
    expect(DEDUPE_KEYS.deadline(7, 'intake_end', at('2026-11-02T17:00:00+07:00'))).toBe(first);
  });
});
