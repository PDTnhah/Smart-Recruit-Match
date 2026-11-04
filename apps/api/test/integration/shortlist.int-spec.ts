// US-3.3 AC-1–AC-4, AC-16, AC-17 (FR-15, NFR-4, BR-11, GĐ3, CONTEXT D47): a student reads their own
// shortlist with the whole explanation of each S_cv, the JDs they are not eligible for with the
// reasons, and a state that tells "still scoring" from "nothing reaches θ_cv". Results are written
// directly; the matching run is US-3.2's test.
import {
  type MatchCodeCriteria,
  type Role,
  ShortlistResponseSchema,
  type StoredMatchAssessment,
} from '@srm/shared';
import { eq } from 'drizzle-orm';
import { jobDescriptions, matchRuns } from '../../src/db/schema/index.js';
import { RULES_VERSION } from '../../src/modules/matching/domain/rules-version.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createPreference } from '../helpers/factories.js';
import { createJdInState } from '../helpers/jd.js';
import {
  createApprovedJds,
  createConfirmedCv,
  createPreferenceCampaign,
  type CvRef,
  rejectPair,
  scorePair,
  waitingPair,
} from '../helpers/shortlist.js';

const CRITERIA: MatchCodeCriteria = {
  must_have: [
    {
      skill: 'TypeScript',
      level_required: 'INTERMEDIATE',
      verdict: 'MET',
      evidence: 'TypeScript',
      match_kind: 'EXACT',
      tier: 3,
      via: null,
      sources: [{ section: 'PROJECT', index: 0, text: 'TypeScript' }],
    },
    {
      skill: 'Docker',
      level_required: 'BASIC',
      verdict: 'NOT_MET',
      evidence: null,
      match_kind: 'NONE',
      tier: 0,
      via: null,
      sources: [],
    },
  ],
  nice_to_have: [
    {
      skill: 'MySQL',
      level_required: 'BASIC',
      verdict: 'PARTIAL',
      evidence: 'PostgreSQL',
      match_kind: 'FAMILY',
      tier: 1,
      via: 'PostgreSQL',
      sources: [{ section: 'SKILLS_LIST', index: 1, text: 'PostgreSQL' }],
    },
  ],
  education: { major_match: 'EXACT', major_unrecognized: false },
  language: { verdict: 'MET', evidence: 'IELTS 6.5', required: 'Tiếng Anh (B1)', held: 'IELTS 6.5 (B2)' },
  zones: [
    { zone: 'BACKEND', demandWeightX100: 400, coverageX100: 7500 },
    { zone: 'DEVOPS_CLOUD', demandWeightX100: 100, coverageX100: 0 },
  ],
  gaps: [
    { skill: 'Docker', group: 'must_have', levelRequired: 'BASIC', verdict: 'NOT_MET' },
    { skill: 'MySQL', group: 'nice_to_have', levelRequired: 'BASIC', verdict: 'PARTIAL' },
  ],
};

const ASSESSMENT: StoredMatchAssessment = {
  project_relevance: {
    score_0_4: 3,
    reason: 'Dự án quản lý thư viện dùng NestJS.',
    evidence: ['Xây dựng API quản lý thư viện bằng NestJS', 'Triển khai Kubernetes cho 1 triệu người dùng'],
  },
  strengths: ['Có dự án backend thực tế'],
  suggestions: ['Học thêm Docker'],
  summary: 'Phù hợp với vị trí backend.',
  // The second quote is not in the CV: shown with a warning (CONTEXT D46).
  evidence_check: [
    { quote: 'Xây dựng API quản lý thư viện bằng NestJS', score: 97, matched: true },
    { quote: 'Triển khai Kubernetes cho 1 triệu người dùng', score: 41, matched: false },
  ],
};

const BREAKDOWN = [
  { criterion: 'must_have', applicable: true, scoreX100: 5000, weightBp: 4000, effectiveWeightBp: 4000, contributionX100: 2000 },
  { criterion: 'nice_to_have', applicable: true, scoreX100: 5000, weightBp: 1500, effectiveWeightBp: 1500, contributionX100: 750 },
  { criterion: 'project', applicable: true, scoreX100: 7500, weightBp: 2000, effectiveWeightBp: 2000, contributionX100: 1500 },
  { criterion: 'education', applicable: true, scoreX100: 10000, weightBp: 1500, effectiveWeightBp: 1500, contributionX100: 1500 },
  { criterion: 'language', applicable: true, scoreX100: 10000, weightBp: 1000, effectiveWeightBp: 1000, contributionX100: 1000 },
] as const;

describe('GĐ3 shortlist of a student (US-3.3)', () => {
  let t: AuthTestApp;

  beforeAll(async () => {
    t = await createAuthTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const shortlistOf = async (student: LoggedIn) =>
    ShortlistResponseSchema.parse((await student.agent.get(api('me/shortlist')).expect(200)).body);

  async function studentWithCv(campaignId: number, version = 1): Promise<{ student: LoggedIn; cv: CvRef }> {
    const student = await t.loginAs('STUDENT');
    const studentId = student.user.studentId!;
    const cv = await createConfirmedCv(t.db, studentId, campaignId, { version });
    return { student, cv: { id: cv.id, version: cv.version, studentId, campaignId } };
  }

  it('GĐ3 shortlist: eligible JDs with S_cv >= theta, sorted, with breakdown and evidence', async () => {
    const campaign = await createPreferenceCampaign(t.db);
    const [best, second, below, skipped, waiting, versioned] = await createApprovedJds(t.db, campaign.id, 6);
    await createJdInState(t.db, { companyId: best!.companyId, campaignId: campaign.id, status: 'PENDING_APPROVAL' });
    const { student, cv } = await studentWithCv(campaign.id, 2);

    await scorePair(t.db, cv, best!, 81.5, { criteria: CRITERIA, assessment: ASSESSMENT, scvBreakdown: [...BREAKDOWN] });
    await scorePair(t.db, cv, second!, 50); // exactly θ_cv
    await scorePair(t.db, cv, below!, 49.99);
    await waitingPair(t.db, cv, skipped!, { skipped: true });
    await waitingPair(t.db, cv, waiting!);
    // BR-18: the JD moved to version 2 after it was scored; the old score no longer counts.
    await scorePair(t.db, cv, versioned!, 95);
    await t.db.update(jobDescriptions).set({ version: 2 }).where(eq(jobDescriptions.id, versioned!.id));
    // An older CV version scored high stays out too.
    const old = await createConfirmedCv(t.db, cv.studentId, campaign.id, { version: 1, active: false });
    await scorePair(t.db, { ...cv, id: old.id, version: 1 }, below!, 99);
    // NV1 saved earlier.
    await createPreference(t.db, { campaignId: campaign.id, studentId: cv.studentId, jdId: second!.id, rank: 1 });

    const body = await shortlistOf(student);
    expect(body.state).toBe('READY');
    expect(body.campaign).toEqual({
      id: campaign.id,
      name: campaign.name,
      status: 'PREFERENCE_SELECTION',
      preferenceEnd: campaign.phaseDeadlines.preference_end,
      nNv: 3,
      requireFullPreferences: false,
      editable: true,
    });
    expect(body.items.map((item) => [item.jd.id, item.sCv, item.preferenceRank])).toEqual([
      [best!.id, 81.5, null],
      [second!.id, 50, 1],
    ]);
    expect(body.items[0]).toEqual({
      jd: {
        id: best!.id,
        title: best!.title,
        companyName: expect.any(String) as string,
        positionGroup: null,
        location: 'Hà Nội',
        workMode: 'ONSITE',
      },
      sCv: 81.5,
      breakdown: BREAKDOWN,
      skills: { must_have: CRITERIA.must_have, nice_to_have: CRITERIA.nice_to_have },
      zones: CRITERIA.zones,
      language: CRITERIA.language,
      education: CRITERIA.education,
      project: {
        score: 3,
        reason: 'Dự án quản lý thư viện dùng NestJS.',
        quotes: [
          { quote: 'Xây dựng API quản lý thư viện bằng NestJS', matched: true },
          { quote: 'Triển khai Kubernetes cho 1 triệu người dùng', matched: false },
        ],
      },
      gaps: CRITERIA.gaps,
      strengths: ['Có dự án backend thực tế'],
      suggestions: ['Học thêm Docker'],
      summary: 'Phù hợp với vị trí backend.',
      preferenceRank: null,
    });
    expect({
      ineligible: body.ineligible,
      below: body.belowThresholdCount,
      notScored: body.notScoredCount,
      pending: body.pendingCount,
    }).toEqual({ ineligible: [], below: 1, notScored: 1, pending: 2 });
    expect(body.preferences).toEqual([{ jdId: second!.id, rank: 1, status: 'PENDING_TEST' }]);
  });

  it('GĐ3 shortlist: ineligible JDs listed with reasons, not selectable', async () => {
    const campaign = await createPreferenceCampaign(t.db);
    const [fits, gpa, language] = await createApprovedJds(t.db, campaign.id, 3);
    const { student, cv } = await studentWithCv(campaign.id);
    await scorePair(t.db, cv, fits!, 70);
    await rejectPair(t.db, cv, gpa!, [{ code: 'GPA_BELOW_MIN', required: 3, actual: 2.5 }]);
    await rejectPair(t.db, cv, language!, [
      { code: 'LANGUAGE_NOT_MET', required: 'Tiếng Anh (B2)', actual: ['TOEIC 450 (A2)'] },
      { code: 'YEAR_MISSING', required: 3, actual: null },
    ]);

    const body = await shortlistOf(student);
    expect(body.items.map((item) => item.jd.id)).toEqual([fits!.id]);
    expect(body.ineligible).toEqual([
      { jd: expect.objectContaining({ id: gpa!.id }) as unknown, reasons: [{ code: 'GPA_BELOW_MIN', required: 3, actual: 2.5 }] },
      {
        jd: expect.objectContaining({ id: language!.id }) as unknown,
        reasons: [
          { code: 'LANGUAGE_NOT_MET', required: 'Tiếng Anh (B2)', actual: ['TOEIC 450 (A2)'] },
          { code: 'YEAR_MISSING', required: 3, actual: null },
        ],
      },
    ]);

    // Not selectable (BR-04).
    const res = await student.agent
      .put(api('me/preferences'))
      .send({ campaignId: campaign.id, preferences: [{ jdId: gpa!.id, rank: 1 }] })
      .expect(422);
    expect(res.body).toMatchObject({ code: 'PREFERENCE_NOT_IN_SHORTLIST', details: { jdIds: [gpa!.id] } });
  });

  it('BR-11 shortlist: no other student data, non-STUDENT 403', async () => {
    const campaign = await createPreferenceCampaign(t.db);
    const [shared, onlyB] = await createApprovedJds(t.db, campaign.id, 2);
    const a = await studentWithCv(campaign.id);
    const b = await studentWithCv(campaign.id);
    await scorePair(t.db, a.cv, shared!, 61.25);
    await scorePair(t.db, b.cv, shared!, 93.75);
    await scorePair(t.db, b.cv, onlyB!, 88.5);
    await createPreference(t.db, { campaignId: campaign.id, studentId: b.cv.studentId, jdId: onlyB!.id, rank: 1 });

    const body = await shortlistOf(a.student);
    expect(body.items.map((item) => [item.jd.id, item.sCv])).toEqual([[shared!.id, 61.25]]);
    expect(body.preferences).toEqual([]);
    const raw = JSON.stringify(body);
    for (const foreignScore of ['93.75', '88.5']) expect(raw).not.toContain(foreignScore);
    expect(raw).not.toContain(`"id":${onlyB!.id}`);

    for (const role of ['HR', 'CENTER', 'ADMIN'] satisfies Role[]) {
      const { agent } = await t.loginAs(role);
      await agent.get(api('me/shortlist')).expect(403);
      await agent
        .put(api('me/preferences'))
        .send({ campaignId: campaign.id, preferences: [] })
        .expect(403);
    }
    await t.http().get(api('me/shortlist')).expect(401);
  });

  it('GĐ3 shortlist: scoring in progress vs empty shortlist vs no confirmed CV', async () => {
    const campaign = await createPreferenceCampaign(t.db);
    const [jd] = await createApprovedJds(t.db, campaign.id, 1);

    // No CV at all: no campaign either.
    const nobody = await t.loginAs('STUDENT');
    expect(await shortlistOf(nobody)).toMatchObject({ state: 'NO_CONFIRMED_CV', campaign: null, items: [] });

    // A CV still to confirm: the campaign is known, the shortlist is not.
    const unconfirmed = await t.loginAs('STUDENT');
    await createConfirmedCv(t.db, unconfirmed.user.studentId!, campaign.id, { status: 'PENDING_CONFIRMATION' });
    expect(await shortlistOf(unconfirmed)).toMatchObject({ state: 'NO_CONFIRMED_CV', campaign: { id: campaign.id } });

    // Confirmed, no result yet: still scoring.
    const fresh = await studentWithCv(campaign.id);
    expect(await shortlistOf(fresh.student)).toMatchObject({ state: 'SCORING', items: [], pendingCount: 1 });

    // Scored, nothing reaches θ_cv: an empty shortlist, not "scoring".
    const weak = await studentWithCv(campaign.id);
    await scorePair(t.db, weak.cv, jd!, 30);
    expect(await shortlistOf(weak.student)).toMatchObject({ state: 'READY', items: [], belowThresholdCount: 1 });

    // A run of the campaign still waiting for results: scoring, whatever is stored.
    await t.db.insert(matchRuns).values({
      campaignId: campaign.id,
      status: 'RUNNING',
      actorKind: 'SYSTEM',
      rulesVersion: RULES_VERSION,
      pairsTotal: 1,
      pairsIneligible: 0,
      pairsSkipped: 0,
      pairsCached: 1,
      pairsSent: 0,
    });
    expect(await shortlistOf(weak.student)).toMatchObject({ state: 'SCORING', belowThresholdCount: 1 });
  });

  it('GĐ3 shortlist: the campaign of the newest active CV, outside DRAFT and CLOSED; read-only after the deadline', async () => {
    const current = await createPreferenceCampaign(t.db);
    const [jd] = await createApprovedJds(t.db, current.id, 1);
    const { student, cv } = await studentWithCv(current.id);
    await scorePair(t.db, cv, jd!, 75);
    // A newer active CV in a closed campaign is not the one shown.
    const closed = await createPreferenceCampaign(t.db, { status: 'CLOSED' });
    await createConfirmedCv(t.db, cv.studentId, closed.id);

    const body = await shortlistOf(student);
    expect(body).toMatchObject({ state: 'READY', campaign: { id: current.id, editable: true } });

    // Testing has started: the list is shown, read-only (AC-9).
    const testing = await createPreferenceCampaign(t.db, { status: 'TESTING' });
    const late = await studentWithCv(testing.id);
    expect(await shortlistOf(late.student)).toMatchObject({ campaign: { id: testing.id, editable: false } });
  });
});
