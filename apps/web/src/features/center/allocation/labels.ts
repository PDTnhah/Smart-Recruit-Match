import {
  ALLOCATION_EXCLUSION_REASON_LABELS,
  ALLOCATION_OUTCOME_REASON_LABELS,
  ALLOCATION_PENDING_KIND_LABELS,
  ALLOCATION_PENDING_KINDS,
  ALLOCATION_ROUND_STATUS_LABELS,
  type AllocationPendingKind,
  type AllocationPreferenceOutcome,
  type AllocationRoundStatus,
  type NominationAdjustment,
} from '@srm/shared';
import { FilePen, Send } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { ApiRequestError } from '@/shared/api/errors';
import type { IconBadgeStyle } from '@/shared/ui/icon-badge';

export { ALLOCATION_ROUND_STATUS_LABELS };

/** DESIGN.md §6 `badge`: a draft is still being worked on, a published round is out. */
export const ROUND_STATUS_BADGE: Readonly<Record<AllocationRoundStatus, IconBadgeStyle>> = {
  DRAFT: { variant: 'outline', icon: FilePen },
  PUBLISHED: { variant: 'default', icon: Send },
};

export const ADJUSTMENT_OP_LABELS: Readonly<Record<NominationAdjustment['op'], string>> = {
  add: 'Thêm',
  remove: 'Bỏ',
  move: 'Chuyển',
};

/** "Chưa đủ điều kiện …: điểm test dưới ngưỡng, …" for the center. */
export function outcomeText(outcome: Pick<AllocationPreferenceOutcome, 'reason' | 'exclusionReasons'>): string {
  const reason = ALLOCATION_OUTCOME_REASON_LABELS[outcome.reason];
  if (outcome.exclusionReasons.length === 0) return reason;
  const rules = outcome.exclusionReasons.map((code) => ALLOCATION_EXCLUSION_REASON_LABELS[code].toLowerCase());
  return `${reason}: ${rules.join(', ')}`;
}

/** A score as stored, two decimals at most, with a decimal comma (DESIGN.md §10). */
export const formatScore = (value: number) => formatNumber(value, 2);

/**
 * `409 ALLOCATION_NOT_READY` lists what keeps the round from running; the screen says how many of
 * each kind, e.g. "3 bài test chưa có điểm cuối, 12 bài còn trong hạn phúc khảo".
 */
export function pendingSummary(error: unknown): string | null {
  if (!(error instanceof ApiRequestError) || error.body?.code !== 'ALLOCATION_NOT_READY') return null;
  const pending = error.body.details?.pending;
  if (!Array.isArray(pending)) return null;
  const counts = new Map<AllocationPendingKind, number>();
  for (const item of pending as { kind?: unknown }[]) {
    const kind = ALLOCATION_PENDING_KINDS.find((known) => known === item.kind);
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const total = typeof error.body.details?.total === 'number' ? error.body.details.total : pending.length;
  const parts = ALLOCATION_PENDING_KINDS.filter((kind) => counts.has(kind)).map(
    (kind) => `${ALLOCATION_PENDING_KIND_LABELS[kind].toLowerCase()}: ${formatNumber(counts.get(kind)!)}`,
  );
  const shown = total > pending.length ? ` (đếm trong ${formatNumber(pending.length)} mục đầu)` : '';
  return `Còn ${formatNumber(total)} nguyện vọng chưa sẵn sàng — ${parts.join('; ')}${shown}.`;
}
