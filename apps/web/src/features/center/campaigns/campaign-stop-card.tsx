import type { Campaign } from '@srm/shared';
import { type ReactNode, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CancelCampaignDialog } from './cancel-campaign-dialog';
import { DeleteCampaignDialog } from './delete-campaign-dialog';
import { isCancellable } from './running-campaign';

type DialogKind = 'cancel' | 'delete';

function Action({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * The end of the campaign page (US-1.10 AC-10, CONTEXT D56): cancel a campaign that has data,
 * delete one that has none. Away from the form's save button, since neither can be undone.
 */
export function CampaignStopCard({ campaign }: { campaign: Campaign }) {
  // The version on screen when a dialog opened goes with its request, not one a refetch has
  // brought in since: a change by someone else then answers 409 (LESSONS §25).
  const [dialog, setDialog] = useState<{ kind: DialogKind; rowVersion: number } | null>(null);
  const cancellable = isCancellable(campaign.status);
  const openChange = (kind: DialogKind) => (open: boolean) =>
    setDialog(open ? { kind, rowVersion: campaign.rowVersion } : null);
  const versionOf = (kind: DialogKind) => (dialog?.kind === kind ? dialog.rowVersion : campaign.rowVersion);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{cancellable ? 'Hủy hoặc xóa đợt' : 'Xóa đợt'}</CardTitle>
        <CardDescription>Hai thao tác này không hoàn tác được.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {cancellable && (
          <>
            <Action
              title="Hủy đợt"
              description="Cho đợt đã có sinh viên hoặc doanh nghiệp tham gia: đợt dừng và ẩn với sinh viên, HR; dữ liệu được giữ lại."
            >
              <CancelCampaignDialog
                campaign={campaign}
                rowVersion={versionOf('cancel')}
                open={dialog?.kind === 'cancel'}
                onOpenChange={openChange('cancel')}
              />
            </Action>
            <Separator />
          </>
        )}
        <Action
          title="Xóa đợt"
          description="Cho đợt tạo nhầm, chưa có dữ liệu: đợt bị xóa hẳn khỏi hệ thống."
        >
          <DeleteCampaignDialog
            campaign={campaign}
            rowVersion={versionOf('delete')}
            open={dialog?.kind === 'delete'}
            onOpenChange={openChange('delete')}
            onCancelInstead={cancellable ? () => setDialog({ kind: 'cancel', rowVersion: versionOf('delete') }) : undefined}
          />
        </Action>
      </CardContent>
    </Card>
  );
}
