import { type Campaign, isCampaignFinal } from './campaign.js';
import type { Cv } from './cv.js';

// Which campaign the student screens show (US-1.6, US-1.8, CONTEXT D47, D55). The API checks
// phases and ownership on every write; these rules only decide what a screen opens and offers.
// `campaigns` are those the student sees (`GET /api/campaigns`), in any order: a higher id is a
// newer campaign, as that route sorts them (CONTEXT D27); a cancelled campaign is never among them
// (CONTEXT D56), but the rules skip it like a closed one. `cvs` are every version of the student
// (`GET /api/cvs/me`).

/** The fields of a campaign the rules read. */
export type StudentCampaign = Pick<Campaign, 'id' | 'status' | 'phaseDeadlines'>;

/** The fields of a CV version the rules read. */
export type StudentCv = Pick<Cv, 'id' | 'campaignId' | 'active'>;

/** The campaign takes CVs: INTAKE and before `intake_end` (CONTEXT D27). */
export function takesCvs(campaign: StudentCampaign, now: number): boolean {
  const deadline = campaign.phaseDeadlines.intake_end;
  return campaign.status === 'INTAKE' && (deadline === undefined || Date.parse(deadline) > now);
}

/** Ids of the campaigns where the student has an active CV (BR-01: at most one per campaign). */
export function campaignIdsWithActiveCv(cvs: readonly StudentCv[]): Set<number> {
  return new Set(cvs.filter((cv) => cv.active).map((cv) => cv.campaignId));
}

/**
 * The student's newest active CV whose campaign is among `campaigns` and is not a draft, closed or
 * cancelled, with that campaign; CVs of other campaigns are skipped. It is the rule
 * `GET /api/me/shortlist` and "Nguyện vọng" follow (CONTEXT D47).
 */
export function campaignOfNewestActiveCv<C extends StudentCampaign, V extends StudentCv>(
  campaigns: readonly C[],
  cvs: readonly V[],
): { campaign: C; cv: V } | null {
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  for (const cv of cvs.filter((item) => item.active).sort((a, b) => b.id - a.id)) {
    const campaign = byId.get(cv.campaignId);
    if (campaign && campaign.status !== 'DRAFT' && !isCampaignFinal(campaign.status)) return { campaign, cv };
  }
  return null;
}

/**
 * The campaign "Hồ sơ" opens when the URL names none the student sees (US-1.8 AC-1, CONTEXT D55),
 * the first that applies:
 *
 * 1. a campaign taking CVs where the student has an active CV;
 * 2. another campaign taking CVs;
 * 3. the campaign of the newest active CV, as in {@link campaignOfNewestActiveCv};
 * 4. the newest campaign.
 *
 * In tiers 1, 2 and 4 the newest campaign wins; tier 3 goes by the newest CV. A new campaign for
 * the same cohort therefore never hides the CV the student already submitted elsewhere.
 */
export function pickProfileCampaign<C extends StudentCampaign>(
  campaigns: readonly C[],
  cvs: readonly StudentCv[],
  now: number,
): C | undefined {
  const withCv = campaignIdsWithActiveCv(cvs);
  const newestFirst = [...campaigns].sort((a, b) => b.id - a.id);
  const open = newestFirst.filter((campaign) => takesCvs(campaign, now));
  return (
    open.find((campaign) => withCv.has(campaign.id)) ??
    open[0] ??
    campaignOfNewestActiveCv(campaigns, cvs)?.campaign ??
    newestFirst[0]
  );
}

/**
 * Where to send a student who looks at a campaign without a CV of theirs while another campaign,
 * not over, holds their active CV (US-1.8 AC-3): of those, the one "Hồ sơ" would open by
 * default. A CV in a closed or cancelled campaign no longer counts (as in tier 3), so it sends
 * nobody away from a campaign where they have to submit again. `undefined` when the campaign shown
 * has a CV or no such campaign exists.
 */
export function otherCampaignWithCv<C extends StudentCampaign>(
  campaigns: readonly C[],
  cvs: readonly StudentCv[],
  shownId: number,
  now: number,
): C | undefined {
  const withCv = campaignIdsWithActiveCv(cvs);
  if (withCv.has(shownId)) return undefined;
  return pickProfileCampaign(
    campaigns.filter((campaign) => withCv.has(campaign.id) && !isCampaignFinal(campaign.status)),
    cvs,
    now,
  );
}
