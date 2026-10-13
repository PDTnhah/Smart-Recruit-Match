import type { CampaignStatus } from '@srm/shared';
import { Badge } from '@/components/ui/badge';
import { CAMPAIGN_STATUS_BADGE, CAMPAIGN_STATUS_LABELS } from './labels';

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge variant={CAMPAIGN_STATUS_BADGE[status]}>{CAMPAIGN_STATUS_LABELS[status]}</Badge>;
}
