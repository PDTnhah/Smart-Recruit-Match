import type { Campaign, ConsentList } from '@srm/shared';

// Rules the student screens share about a campaign taking CVs (US-1.6). The API checks the same
// at upload time; these only decide what the screen offers.

/** The path of the "Hồ sơ" screen (menu segment `cv`, DESIGN.md §12). */
export const PROFILE_PATH = '/sv/cv';

/** The campaign takes CVs: INTAKE and before `intake_end` (CONTEXT D27). */
export function takesCvs(campaign: Campaign, now: number): boolean {
  const deadline = campaign.phaseDeadlines.intake_end;
  return campaign.status === 'INTAKE' && (deadline === undefined || Date.parse(deadline) > now);
}

/** The student accepted the current terms version for the campaign (AC-1, AC-2). */
export function hasCurrentConsent(consents: ConsentList, campaignId: number): boolean {
  return consents.items.some(
    (consent) => consent.campaignId === campaignId && consent.termsVersion === consents.currentTermsVersion,
  );
}
