import type { CvStatus } from '@srm/shared';
import { Badge } from '@/components/ui/badge';
import { CV_STATUS_BADGE, CV_STATUS_LABELS } from './labels';

export function CvStatusBadge({ status }: { status: CvStatus }) {
  return <Badge variant={CV_STATUS_BADGE[status]}>{CV_STATUS_LABELS[status]}</Badge>;
}
