import type { CampaignStatus } from '../../states/campaign.js';
import {
  campaignOfNewestActiveCv,
  otherCampaignWithCv,
  pickProfileCampaign,
  type StudentCampaign,
  type StudentCv,
  takesCvs,
} from '../student-campaign.js';

const NOW = Date.parse('2026-11-13T04:05:00Z');
const LATER = '2026-11-30T17:00:00Z';
const EARLIER = '2026-11-10T17:00:00Z';

function campaign(id: number, status: CampaignStatus, intakeEnd?: string): StudentCampaign {
  return { id, status, phaseDeadlines: intakeEnd === undefined ? {} : { intake_end: intakeEnd } };
}

function cv(id: number, campaignId: number, active = true): StudentCv {
  return { id, campaignId, active };
}

describe('US-1.8: the campaign the student screens open (CONTEXT D55)', () => {
  describe('takesCvs', () => {
    it('GĐ2: a campaign takes CVs in INTAKE before intake_end, or without one', () => {
      expect(takesCvs(campaign(1, 'INTAKE', LATER), NOW)).toBe(true);
      expect(takesCvs(campaign(1, 'INTAKE'), NOW)).toBe(true);
      expect(takesCvs(campaign(1, 'INTAKE', EARLIER), NOW)).toBe(false);
      expect(takesCvs(campaign(1, 'INTAKE', new Date(NOW).toISOString()), NOW)).toBe(false);
      expect(takesCvs(campaign(1, 'PREFERENCE_SELECTION', LATER), NOW)).toBe(false);
    });
  });

  describe('pickProfileCampaign (AC-1)', () => {
    it('GĐ2: the incident of 2026-11-13, a new campaign opened after the CV was submitted, keeps the campaign with the CV', () => {
      // Newest first, as GET /api/campaigns returns them: 6 opened at 04:03, 5 at 04:01, 1 holds cv:1.
      const campaigns = [campaign(6, 'INTAKE', LATER), campaign(5, 'INTAKE', LATER), campaign(1, 'INTAKE', LATER)];
      expect(pickProfileCampaign(campaigns, [cv(1, 1)], NOW)?.id).toBe(1);
    });

    it('GĐ2 tier 1: of the campaigns taking CVs with an active CV, the newest wins', () => {
      const campaigns = [campaign(6, 'INTAKE', LATER), campaign(4, 'INTAKE', LATER), campaign(2, 'INTAKE', LATER)];
      expect(pickProfileCampaign(campaigns, [cv(3, 2), cv(7, 4)], NOW)?.id).toBe(4);
      // The newer CV does not matter within the tier, the newer campaign does.
      expect(pickProfileCampaign(campaigns, [cv(9, 2), cv(7, 4)], NOW)?.id).toBe(4);
    });

    it('GĐ2 tier 2: without a CV in a campaign taking CVs, the newest campaign taking CVs wins', () => {
      const campaigns = [
        campaign(7, 'PREFERENCE_SELECTION', LATER),
        campaign(6, 'INTAKE', LATER),
        campaign(5, 'INTAKE', LATER),
        campaign(3, 'TESTING'),
      ];
      expect(pickProfileCampaign(campaigns, [cv(1, 3)], NOW)?.id).toBe(6);
      expect(pickProfileCampaign(campaigns, [], NOW)?.id).toBe(6);
    });

    it('GĐ2 tier 2: a campaign with the CV but past intake_end gives way to a newer one taking CVs', () => {
      const campaigns = [campaign(6, 'INTAKE', LATER), campaign(1, 'INTAKE', EARLIER)];
      expect(pickProfileCampaign(campaigns, [cv(1, 1)], NOW)?.id).toBe(6);
    });

    it('GĐ2 tier 3: no campaign takes CVs, the campaign of the newest active CV wins unless closed (D47)', () => {
      const campaigns = [
        campaign(8, 'CLOSED'),
        campaign(7, 'ALLOCATION_REVIEW'),
        campaign(6, 'TESTING'),
        campaign(5, 'INTAKE', EARLIER),
      ];
      expect(pickProfileCampaign(campaigns, [cv(2, 6), cv(4, 7)], NOW)?.id).toBe(7);
      // The newest CV is in a closed campaign: the next newest counts.
      expect(pickProfileCampaign(campaigns, [cv(2, 6), cv(9, 8)], NOW)?.id).toBe(6);
    });

    it('GĐ2 tier 4: no campaign takes CVs and no usable CV, the newest campaign wins', () => {
      const campaigns = [campaign(8, 'CLOSED'), campaign(6, 'TESTING')];
      expect(pickProfileCampaign(campaigns, [cv(9, 8)], NOW)?.id).toBe(8);
      expect(pickProfileCampaign(campaigns, [], NOW)?.id).toBe(8);
    });

    it('GĐ2: inactive CV versions are ignored, as are CVs of campaigns the student no longer sees', () => {
      const campaigns = [campaign(6, 'INTAKE', LATER), campaign(1, 'INTAKE', LATER)];
      expect(pickProfileCampaign(campaigns, [cv(1, 1, false)], NOW)?.id).toBe(6);
      expect(pickProfileCampaign([campaign(6, 'TESTING'), campaign(5, 'TESTING')], [cv(3, 99), cv(2, 5)], NOW)?.id).toBe(5);
    });

    it('GĐ2: no campaign, no pick', () => {
      expect(pickProfileCampaign([], [cv(1, 1)], NOW)).toBeUndefined();
    });

    it('GĐ2: the newest campaign is the one with the highest id, whatever order the list comes in', () => {
      const oldestFirst = [campaign(2, 'TESTING'), campaign(4, 'INTAKE', LATER), campaign(6, 'INTAKE', LATER)];
      expect(pickProfileCampaign(oldestFirst, [cv(1, 4), cv(3, 6)], NOW)?.id).toBe(6);
      expect(pickProfileCampaign(oldestFirst, [], NOW)?.id).toBe(6);
      expect(pickProfileCampaign([campaign(2, 'TESTING'), campaign(8, 'CLOSED')], [], NOW)?.id).toBe(8);
    });
  });

  describe('campaignOfNewestActiveCv (D47)', () => {
    it('GĐ4: returns the campaign of the newest active CV that is neither a draft nor closed, with that CV', () => {
      const campaigns = [campaign(3, 'CLOSED'), campaign(2, 'PREFERENCE_SELECTION'), campaign(1, 'TESTING')];
      const cvs = [cv(1, 1), cv(5, 3), cv(4, 2), cv(6, 2, false)];
      expect(campaignOfNewestActiveCv(campaigns, cvs)).toEqual({ campaign: campaigns[1], cv: cvs[2] });
      expect(campaignOfNewestActiveCv(campaigns, [cv(5, 3)])).toBeNull();
      expect(campaignOfNewestActiveCv([campaign(1, 'DRAFT')], [cv(1, 1)])).toBeNull();
    });

    it('GĐ4: does not reorder the CV list it is given', () => {
      const cvs = [cv(1, 1), cv(2, 1, false), cv(3, 2)];
      campaignOfNewestActiveCv([campaign(1, 'INTAKE')], cvs);
      expect(cvs.map((item) => item.id)).toEqual([1, 2, 3]);
    });
  });

  describe('otherCampaignWithCv (AC-3)', () => {
    const campaigns = [
      campaign(6, 'INTAKE', LATER),
      campaign(5, 'INTAKE', LATER),
      campaign(3, 'TESTING'),
      campaign(1, 'INTAKE', EARLIER),
    ];

    it('GĐ2: a campaign without the CV points to the one holding it', () => {
      expect(otherCampaignWithCv(campaigns, [cv(1, 1)], 6, NOW)?.id).toBe(1);
    });

    it('GĐ2: of several campaigns holding a CV, points to the one "Hồ sơ" would open', () => {
      // 5 takes CVs and holds one: tier 1 wins over the newer CV in 3.
      expect(otherCampaignWithCv(campaigns, [cv(1, 5), cv(4, 3)], 6, NOW)?.id).toBe(5);
      // None of them takes CVs: the newest CV, in 3, wins over 1.
      expect(otherCampaignWithCv(campaigns, [cv(2, 1), cv(4, 3)], 6, NOW)?.id).toBe(3);
    });

    it('GĐ2: nothing to point to when the campaign shown has the CV or no other campaign has one', () => {
      expect(otherCampaignWithCv(campaigns, [cv(1, 6), cv(2, 1)], 6, NOW)).toBeUndefined();
      expect(otherCampaignWithCv(campaigns, [], 6, NOW)).toBeUndefined();
      expect(otherCampaignWithCv(campaigns, [cv(1, 1, false)], 6, NOW)).toBeUndefined();
      expect(otherCampaignWithCv(campaigns, [cv(1, 99)], 6, NOW)).toBeUndefined();
    });

    it('GĐ2: a CV in a closed campaign does not send the student away from a campaign taking CVs', () => {
      const withClosed = [campaign(6, 'INTAKE', LATER), campaign(4, 'CLOSED'), campaign(3, 'TESTING')];
      expect(otherCampaignWithCv(withClosed, [cv(5, 4)], 6, NOW)).toBeUndefined();
      // Another campaign still in play does count, even when the closed one holds the newer CV.
      expect(otherCampaignWithCv(withClosed, [cv(2, 3), cv(5, 4)], 6, NOW)?.id).toBe(3);
    });
  });
});
