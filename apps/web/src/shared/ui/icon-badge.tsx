import type { VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type badgeVariants } from '@/components/ui/badge';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

/** How one value shows as a badge: a built-in Badge variant and its icon. */
export interface IconBadgeStyle {
  variant: BadgeVariant;
  icon: LucideIcon;
}

/**
 * A Badge with its icon before the words (DESIGN.md §6 `badge`), so the meaning never rests on
 * colour (§11). Callers map each value to an `IconBadgeStyle`.
 */
export function IconBadge({ style, children }: { style: IconBadgeStyle; children: ReactNode }) {
  const Icon = style.icon;
  return (
    <Badge variant={style.variant}>
      <Icon data-icon="inline-start" aria-hidden="true" />
      {children}
    </Badge>
  );
}
