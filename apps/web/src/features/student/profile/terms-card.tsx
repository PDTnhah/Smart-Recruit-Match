import { type Campaign, CURRENT_TERMS } from '@srm/shared';
import { CircleAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/shared/api/errors';
import { useAcceptConsent } from './api';

/**
 * Step 1 of "Hồ sơ" (US-1.6 AC-1, NFR-2): the current terms, shown in full, and the button that
 * records consent for this campaign. Nothing is uploaded before it.
 */
export function TermsCard({ campaign }: { campaign: Campaign }) {
  const accept = useAcceptConsent();
  const [error, setError] = useState<string | null>(null);

  async function agree() {
    setError(null);
    try {
      await accept.mutateAsync({ campaignId: campaign.id, termsVersion: CURRENT_TERMS.version });
      toast.success('Đã ghi nhận đồng ý điều khoản');
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{CURRENT_TERMS.title}</h2>
        </CardTitle>
        <CardDescription>
          Phiên bản {CURRENT_TERMS.version}. Đọc kỹ trước khi nộp CV cho đợt {campaign.name}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {CURRENT_TERMS.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h3 className="text-base font-medium">{section.heading}</h3>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm break-words">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-4 sm:items-end">
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Chưa ghi nhận được đồng ý</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground">
          Bấm "Đồng ý điều khoản" nghĩa là sinh viên đã đọc và đồng ý cho hệ thống xử lý dữ liệu cá nhân như trên
          trong đợt thực tập này.
        </p>
        <Button onClick={() => void agree()} disabled={accept.isPending} className="w-full sm:w-auto">
          {accept.isPending ? <Spinner data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
          {accept.isPending ? 'Đang ghi nhận' : 'Đồng ý điều khoản'}
        </Button>
      </CardFooter>
    </Card>
  );
}
