import type { ConsentList } from '@srm/shared';

// What the student screens share about submitting a CV (US-1.6). Which campaign a screen opens,
// and whether it takes CVs, is in `@srm/shared` (`schemas/student-campaign.ts`, US-1.8).

/** The path of the "Hồ sơ" screen (menu segment `cv`, DESIGN.md §12). */
export const PROFILE_PATH = '/sv/cv';

/** The student accepted the current terms version for the campaign (AC-1, AC-2). */
export function hasCurrentConsent(consents: ConsentList, campaignId: number): boolean {
  return consents.items.some(
    (consent) => consent.campaignId === campaignId && consent.termsVersion === consents.currentTermsVersion,
  );
}
