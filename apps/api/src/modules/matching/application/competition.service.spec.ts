import { type CompetitionUpdatedEvent, DEFAULT_CAMPAIGN_CONFIG, SERVER_EVENTS } from '@srm/shared';
import type { Clock } from '../../../common/clock/index.js';
import type { Database } from '../../../db/types.js';
import type { CampaignService, CampaignSettings } from '../../campaign/index.js';
import type { JdService } from '../../company/index.js';
import type { RealtimePublisher } from '../../notification/index.js';
import type { CompetitionCounter } from '../infrastructure/competition-counter.js';
import type { PreferencesRepository } from '../infrastructure/preferences.repository.js';
import { CompetitionService } from './competition.service.js';

const NOW = new Date('2026-11-04T08:00:00.000Z');
const PREFERENCE_END = '2026-11-10T17:00:00.000Z';
const EXPIRES_AT = Date.parse(PREFERENCE_END) / 1000;

const campaign = {
  id: 7,
  status: 'PREFERENCE_SELECTION',
  phaseDeadlines: { preference_end: PREFERENCE_END },
  config: DEFAULT_CAMPAIGN_CONFIG,
} as unknown as CampaignSettings;

/** The service over stubs; `rows` are the preferences of each JD in the database. */
function setup(rows: Record<number, number> = {}) {
  const tx = { execute: jest.fn().mockResolvedValue(undefined) };
  const db = { transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
  const campaigns = { getSettings: jest.fn().mockResolvedValue(campaign), isPhaseOpen: jest.fn().mockReturnValue(true) };
  const jds = {
    listShortlistCards: jest.fn().mockResolvedValue([
      { jdId: 1, quota: 2 },
      { jdId: 2, quota: 2 },
      { jdId: 3, quota: 1 },
    ]),
  };
  const repository = {
    countByJd: jest.fn((_campaignId: number, jdIds: readonly number[]) =>
      Promise.resolve(new Map(jdIds.flatMap((jdId) => (rows[jdId] === undefined ? [] : [[jdId, rows[jdId]] as const])))),
    ),
  };
  const counter = {
    read: jest.fn().mockResolvedValue(new Map()),
    write: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    drop: jest.fn().mockResolvedValue(undefined),
  };
  const publisher = { publishToCampaignStudents: jest.fn().mockResolvedValue(undefined) };
  const clock = { now: () => NOW } satisfies Clock;
  const service = new CompetitionService(
    db as unknown as Database,
    campaigns as unknown as CampaignService,
    jds as unknown as JdService,
    repository as unknown as PreferencesRepository,
    counter as unknown as CompetitionCounter,
    publisher as unknown as RealtimePublisher,
    clock,
  );
  return { service, tx, campaigns, repository, counter, publisher };
}

const replaced = (jdIds: number[]) => ({ campaignId: campaign.id, studentId: 1, jdIds });

/** The items of the n-th `competition.updated`, by JD id. */
function publishedItems(publisher: { publishToCampaignStudents: jest.Mock }, n = 0) {
  const [campaignId, message] = publisher.publishToCampaignStudents.mock.calls[n] as [number, { event: string; data: CompetitionUpdatedEvent }];
  expect(campaignId).toBe(campaign.id);
  expect(message.event).toBe(SERVER_EVENTS.COMPETITION_UPDATED);
  return [...message.data.items].sort((a, b) => a.jdId - b.jdId);
}

describe('CompetitionService (US-3.4 AC-2, AC-3, CONTEXT D48)', () => {
  it('GĐ4 counters answer while preferences are open; a missing one is counted from the database and set again', async () => {
    const { service, counter, repository } = setup({ 2: 3 });
    counter.read.mockResolvedValue(new Map([[1, 5]]));

    expect(await service.counts(campaign, [1, 2])).toEqual(new Map([[1, 5], [2, 3]]));
    expect(repository.countByJd).toHaveBeenCalledWith(campaign.id, [2]);
    expect(counter.fill).toHaveBeenCalledWith(new Map([[2, 3]]), EXPIRES_AT);
  });

  it('GĐ4 an unreadable Redis, or a campaign past preference selection, is answered from the database', async () => {
    const down = setup({ 1: 4 });
    down.counter.read.mockRejectedValue(new Error('Connection is closed.'));
    expect(await down.service.counts(campaign, [1, 2])).toEqual(new Map([[1, 4], [2, 0]]));
    expect(down.counter.fill).not.toHaveBeenCalled();

    const closed = setup({ 1: 4 });
    closed.campaigns.isPhaseOpen.mockReturnValue(false);
    expect(await closed.service.counts(campaign, [1])).toEqual(new Map([[1, 4]]));
    expect(closed.counter.read).not.toHaveBeenCalled();
  });

  it('GĐ4 a recount locks the JDs in one statement, overwrites their counters, then publishes the levels', async () => {
    const { service, tx, counter, publisher } = setup({ 1: 1, 2: 6 });

    await service.onPreferencesReplaced(replaced([2, 1]));

    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(counter.write).toHaveBeenCalledWith(new Map([[1, 1], [2, 6]]), EXPIRES_AT);
    expect(publishedItems(publisher)).toEqual([
      { jdId: 1, nvCount: 1, quota: 2, level: 'LOW' },
      { jdId: 2, nvCount: 6, quota: 2, level: 'HIGH' },
    ]);
    expect(counter.drop).not.toHaveBeenCalled();
  });

  it('GĐ4 a counter write that fails drops the keys, and the levels still go out', async () => {
    const { service, counter, publisher } = setup({ 3: 1 });
    counter.write.mockRejectedValue(new Error('Connection is closed.'));

    await service.onPreferencesReplaced(replaced([3]));

    expect(counter.drop).toHaveBeenCalledWith([3]);
    expect(publishedItems(publisher)).toEqual([{ jdId: 3, nvCount: 1, quota: 1, level: 'MEDIUM' }]);
  });

  it('GĐ4 a recount that fails drops the counters, so the next read counts from the database', async () => {
    const { service, campaigns, counter, publisher } = setup();
    campaigns.getSettings.mockRejectedValue(new Error('connection terminated'));

    await service.onPreferencesReplaced(replaced([1, 2]));

    expect(counter.drop).toHaveBeenCalledWith([1, 2]);
    expect(counter.write).not.toHaveBeenCalled();
    expect(publisher.publishToCampaignStudents).not.toHaveBeenCalled();
  });

  it('GĐ4 recounts queued while one runs are merged into a single next one', async () => {
    const { service, repository } = setup({ 1: 1, 2: 1, 3: 1 });

    await Promise.all([
      service.onPreferencesReplaced(replaced([1])),
      service.onPreferencesReplaced(replaced([2])),
      service.onPreferencesAutoAssigned({ campaignId: campaign.id, studentIds: [2], jdIds: [3, 2] }),
    ]);

    expect(repository.countByJd.mock.calls.map(([, jdIds]) => jdIds)).toEqual([[1], [2, 3]]);
  });
});
