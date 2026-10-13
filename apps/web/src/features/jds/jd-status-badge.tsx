import type { JobDescription } from '@srm/shared';
import { Badge } from '@/components/ui/badge';
import { JD_STATUS_BADGE, jdStatusLabel } from './labels';

export function JdStatusBadge({ jd }: { jd: Pick<JobDescription, 'status' | 'requirementsReady'> }) {
  return <Badge variant={JD_STATUS_BADGE[jd.status]}>{jdStatusLabel(jd)}</Badge>;
}
