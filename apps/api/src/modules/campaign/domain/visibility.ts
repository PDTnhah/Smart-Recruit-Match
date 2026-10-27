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
    case 'STUDENT':
      return campaign.status !== 'DRAFT' && viewer.audience !== null && isInTarget(campaign.target, viewer.audience);
  }
}

/**
 * Whether a student belongs to the campaign's target: the target lists both their cohort and their
 * major. Also decides who is notified about the campaign (US-1.7), so recipients and readers match.
 */
export function isInTarget(target: CampaignTarget, audience: StudentAudience): boolean {
  return (
    audience.cohort !== null &&
    audience.major !== null &&
    includesValue(target.cohorts, audience.cohort) &&
    includesValue(target.majors, audience.major)
  );
}

function includesValue(values: readonly string[], value: string): boolean {
  const wanted = normalizeAudienceValue(value);
  return values.some((candidate) => normalizeAudienceValue(candidate) === wanted);
}
