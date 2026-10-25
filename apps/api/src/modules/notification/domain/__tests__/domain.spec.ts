import { DEDUPE_KEYS } from '../dedupe-keys.js';
import { emailStillRelevant } from '../email-relevance.js';
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

describe('FR-8: emails that are out of date are not sent', () => {
  const reminder = {
    type: 'DEADLINE_REMINDER',
    payload: { campaignId: 1, campaignName: 'Đợt', deadlineKey: 'intake_end', deadline: '2026-11-02T10:00:00.000Z' },
  } as const;
  const opened = {
    type: 'CAMPAIGN_OPENED',
    payload: { campaignId: 1, campaignName: 'Đợt', intakeEnd: '2026-11-02T10:00:00.000Z' },
  } as const;

  it('GĐ2: a reminder only before its deadline, an opening only before intake closes', () => {
    expect(emailStillRelevant(reminder, at('2026-11-02T09:59:59.999Z'))).toBe(true);
    expect(emailStillRelevant(reminder, at('2026-11-02T10:00:00.000Z'))).toBe(false);
    expect(emailStillRelevant(opened, at('2026-11-02T09:59:59.999Z'))).toBe(true);
    expect(emailStillRelevant(opened, at('2026-11-03T00:00:00.000Z'))).toBe(false);
  });

  it('FR-3: an invitation is checked against iam instead', () => {
    expect(emailStillRelevant({ type: 'HR_INVITED', payload: { companyId: 1 } }, at('2030-01-01T00:00:00.000Z'))).toBe(
      true,
    );
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

describe('GĐ2: CV analysis notices (US-2.4, CONTEXT D37)', () => {
  const payload = { cvId: 5, campaignId: 1, campaignName: 'Đợt' };

  it('GĐ2: a failed analysis is still worth an email; the other CV notices are never emailed', () => {
    const later = at('2030-01-01T00:00:00.000Z');
    expect(emailStillRelevant({ type: 'CV_ANALYSIS_FAILED', payload }, later)).toBe(true);
    expect(emailStillRelevant({ type: 'CV_PROFILE_READY', payload }, later)).toBe(false);
    expect(emailStillRelevant({ type: 'CV_NEEDS_ATTENTION', payload: { ...payload, reason: 'HIDDEN_TEXT' } }, later)).toBe(
      false,
    );
  });

  it('GĐ2: one key per CV, outcome and job; a job never sent has a key too', () => {
    expect(DEDUPE_KEYS.cvAnalysis('ready', 5, 'job-1')).toBe('cv_analysis_ready:5:job-1');
    expect(DEDUPE_KEYS.cvAnalysis('failed', 5, null)).toBe('cv_analysis_failed:5:not-dispatched');
    expect(DEDUPE_KEYS.cvAnalysis('failed', 5, 'job-2')).not.toBe(DEDUPE_KEYS.cvAnalysis('failed', 5, 'job-1'));
  });
});
