import { Badge } from '@/components/ui/badge';
import { JD_STATUS_BADGE, type JdStatusFields, jdStatusLabel } from './labels';

export function JdStatusBadge({ jd }: { jd: JdStatusFields }) {
  return <Badge variant={JD_STATUS_BADGE[jd.status]}>{jdStatusLabel(jd)}</Badge>;
}
