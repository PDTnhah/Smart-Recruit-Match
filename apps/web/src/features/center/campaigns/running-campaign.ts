import {
  CAMPAIGN_CONFIG_USED_FROM,
  type CampaignConfig,
  type CampaignStatus,
  type CampaignTarget,
  campaignMachine,
  canTransition,
  isConfigKeyLocked,
  normalizeAudienceValue,
} from '@srm/shared';
import { CAMPAIGN_STATUS_LABELS } from './labels';

// What the form of an open campaign may change (US-1.10 AC-10, CONTEXT D56). The API decides
// (`planRunningEdit`); these only keep the form from offering what it would refuse. The actual
// phase and the earliest deadline move come from @srm/shared, as the API uses them.

/** Why a parameter is read-only in `phase`, or null while it can change. */
export function lockedParameterNote(key: keyof CampaignConfig, phase: CampaignStatus): string | null {
  if (!isConfigKeyLocked(key, phase)) return null;
  const usedFrom = CAMPAIGN_CONFIG_USED_FROM[key];
  return usedFrom === null
    ? 'Đợt đã kết thúc, không sửa được.'
    : `Đã dùng từ giai đoạn “${CAMPAIGN_STATUS_LABELS[usedFrom]}”, không sửa được nữa.`;
}

/** Whether `next` adds a cohort or major to the stored target; the form never removes one. */
export function addsToTarget(stored: CampaignTarget, next: CampaignTarget): boolean {
  return (['cohorts', 'majors'] as const).some((key) => {
    const known = new Set(stored[key].map(normalizeAudienceValue));
    return next[key].some((value) => !known.has(normalizeAudienceValue(value)));
  });
}

/** Whether CENTER can cancel the campaign: it is open, not a draft and not over (AC-6). */
export function isCancellable(status: CampaignStatus): boolean {
  return canTransition(campaignMachine, status, 'CANCELLED');
}

/**
 * Campaigns the campaign filter of the center's work lists offers (CV cần xử lý, Duyệt JD, Chấm
 * tay): opened and not cancelled, since nothing runs in a cancelled one (US-1.10 AC-7).
 */
export function isWorkCampaign(status: CampaignStatus): boolean {
  return status !== 'DRAFT' && status !== 'CANCELLED';
}
