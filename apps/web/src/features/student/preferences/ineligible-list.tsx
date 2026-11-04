import type { IneligibleJd } from '@srm/shared';
import { useId } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ineligibleReasonText } from './labels';

/**
 * JDs whose hard conditions the student does not meet (US-3.3 AC-2): no S_cv, cannot be chosen,
 * each with every failed condition in Vietnamese.
 */
export function IneligibleList({ jds }: { jds: readonly IneligibleJd[] }) {
  const titleId = useId();
  if (jds.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-base font-medium">
          Không đủ điều kiện ({jds.length})
        </h2>
        <p className="text-sm text-muted-foreground">
          Hồ sơ chưa đáp ứng điều kiện bắt buộc của các JD này nên không chọn được.
        </p>
      </div>
      {jds.map(({ jd, reasons }) => (
        <Card key={jd.id} size="sm">
          <CardHeader>
            <CardTitle className="min-w-0">
              <h3 className="break-words">{jd.title}</h3>
            </CardTitle>
            <CardDescription className="truncate" title={jd.companyName}>
              {jd.companyName}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {reasons.map((reason, index) => (
                <li key={index} className="break-words">
                  {ineligibleReasonText(reason)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
