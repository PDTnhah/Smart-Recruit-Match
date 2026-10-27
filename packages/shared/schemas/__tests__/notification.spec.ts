import { CampaignConfigSchema } from '../campaign.js';
import { NotificationListQuerySchema, NotificationSchema, NotifyInputSchema } from '../notification.js';

const opened = {
  type: 'CAMPAIGN_OPENED',
  payload: { campaignId: 1, campaignName: 'Đợt HK1', intakeEnd: '2026-11-01T10:00:00.000Z' },
  userIds: [3, 4],
  channels: ['IN_APP', 'EMAIL'],
} as const;

describe('FR-8: notify input schema', () => {
  it('FR-8: accepts each type with its own payload', () => {
    expect(NotifyInputSchema.parse(opened)).toEqual(opened);
    expect(
      NotifyInputSchema.safeParse({ type: 'HR_INVITED', payload: { companyId: 2 }, userIds: [9], channels: ['EMAIL'] })
        .success,
    ).toBe(true);
    expect(
      NotifyInputSchema.safeParse({
        type: 'DEADLINE_REMINDER',
        payload: { campaignId: 1, campaignName: 'Đợt', deadlineKey: 'intake_end', deadline: '2026-11-01T10:00:00Z' },
        userIds: [9],
        channels: ['IN_APP'],
        dedupeKey: 'deadline:1:intake_end:2026-11-01T10:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('FR-8: rejects an unknown type', () => {
    expect(NotifyInputSchema.safeParse({ ...opened, type: 'SOMETHING_ELSE' }).success).toBe(false);
  });

  it('FR-8: rejects a payload that belongs to another type', () => {
    expect(NotifyInputSchema.safeParse({ ...opened, payload: { companyId: 2 } }).success).toBe(false);
  });

  it('FR-8: rejects a payload with a missing or malformed field', () => {
    const withoutDeadline = { campaignId: opened.payload.campaignId, campaignName: opened.payload.campaignName };
    expect(NotifyInputSchema.safeParse({ ...opened, payload: withoutDeadline }).success).toBe(false);
    expect(NotifyInputSchema.safeParse({ ...opened, payload: { ...opened.payload, intakeEnd: 'mai' } }).success).toBe(
      false,
    );
  });

  it('FR-8: needs at least one distinct recipient and one distinct channel', () => {
    expect(NotifyInputSchema.safeParse({ ...opened, userIds: [] }).success).toBe(false);
    expect(NotifyInputSchema.safeParse({ ...opened, userIds: [3, 3] }).success).toBe(false);
    expect(NotifyInputSchema.safeParse({ ...opened, channels: [] }).success).toBe(false);
    expect(NotifyInputSchema.safeParse({ ...opened, channels: ['EMAIL', 'EMAIL'] }).success).toBe(false);
    expect(NotifyInputSchema.safeParse({ ...opened, channels: ['SMS'] }).success).toBe(false);
  });

  it('FR-3: an invitation notification stores no link or token', () => {
    const parsed = NotifyInputSchema.parse({
      type: 'HR_INVITED',
      payload: { companyId: 2, invitationPath: '/accept-invitation#token' },
      userIds: [9],
      channels: ['EMAIL'],
    });
    expect(parsed.payload).toEqual({ companyId: 2 });
  });
});

describe('FR-8: notification list', () => {
  it('FR-8: a list entry carries its type, payload and read state', () => {
    const entry = { id: 7, type: opened.type, payload: opened.payload, readAt: null, createdAt: '2026-10-19T01:00:00Z' };
    expect(NotificationSchema.parse(entry)).toEqual(entry);
  });

  it('FR-8: the query pages by id with a bounded limit', () => {
    expect(NotificationListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(NotificationListQuerySchema.parse({ before: '15', limit: '5' })).toEqual({ before: 15, limit: 5 });
    expect(NotificationListQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
    expect(NotificationListQuerySchema.safeParse({ before: '0' }).success).toBe(false);
  });
});

describe('GĐ2: reminder parameter of a campaign', () => {
  it('GĐ2: defaults to 24 hours and accepts 1 to 168', () => {
    expect(CampaignConfigSchema.parse({}).reminder_hours_before).toBe(24);
    expect(CampaignConfigSchema.safeParse({ reminder_hours_before: 1 }).success).toBe(true);
    expect(CampaignConfigSchema.safeParse({ reminder_hours_before: 168 }).success).toBe(true);
    expect(CampaignConfigSchema.safeParse({ reminder_hours_before: 0 }).success).toBe(false);
    expect(CampaignConfigSchema.safeParse({ reminder_hours_before: 169 }).success).toBe(false);
    expect(CampaignConfigSchema.safeParse({ reminder_hours_before: 1.5 }).success).toBe(false);
  });
});
