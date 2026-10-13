import { type CampaignStatus, type CampaignTarget, normalizeAudienceValue } from '@srm/shared';

/** The cohort and major of a student, as the student module knows them. */
export interface StudentAudience {
  cohort: string | null;
  major: string | null;
}

export type CampaignViewer =
  | { role: 'CENTER' | 'ADMIN' | 'HR' }
  /** `audience` is null when the student record is unknown; such a student sees no campaign. */
  | { role: 'STUDENT'; audience: StudentAudience | null };

/**
 * Which campaigns a caller may read (EPIC-1 › RBAC additions, CONTEXT D27): CENTER and ADMIN see
 * every campaign; HR sees every campaign that has left DRAFT; a student sees a campaign that has
 * left DRAFT and whose target lists both their cohort and their major.
 */
export function canSeeCampaign(
  viewer: CampaignViewer,
  campaign: { status: CampaignStatus; target: CampaignTarget },
): boolean {
  switch (viewer.role) {
    case 'CENTER':
    case 'ADMIN':
      return true;
    case 'HR':
      return campaign.status !== 'DRAFT';
    case 'STUDENT': {
      if (campaign.status === 'DRAFT') return false;
      const cohort = viewer.audience?.cohort ?? null;
      const major = viewer.audience?.major ?? null;
      return (
        cohort !== null &&
        major !== null &&
        includesValue(campaign.target.cohorts, cohort) &&
        includesValue(campaign.target.majors, major)
      );
    }
  }
}

function includesValue(values: readonly string[], value: string): boolean {
  const wanted = normalizeAudienceValue(value);
  return values.some((candidate) => normalizeAudienceValue(candidate) === wanted);
}
