import type { CampaignStatus } from '@srm/shared';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiErrorMessage } from '@/shared/api/errors';
import { useCampaign } from './api';
import { CampaignStatusBadge } from './campaign-status-badge';
import { DraftCampaignForm } from './draft-campaign-form';
import { OpenCampaignDialog } from './open-campaign-dialog';
import { CAMPAIGNS_PATH } from './paths';
import { RunningCampaignForm } from './running-campaign-form';

function PageHeader({ title, status, actions }: { title: string; status?: CampaignStatus; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link to={CAMPAIGNS_PATH}>
          <ArrowLeft data-icon="inline-start" />
          Đợt thực tập
        </Link>
      </Button>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 font-heading text-xl font-semibold break-words md:text-2xl">{title}</h1>
        {status && <CampaignStatusBadge status={status} />}
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
    </div>
  );
}

/** `/admin/campaigns/new` (US-1.4 AC-1, AC-9). */
export function CampaignCreatePage() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Tạo đợt thực tập" />
      <DraftCampaignForm />
    </div>
  );
}

/** `/admin/campaigns/:id`: edit a draft, or view a running campaign and move its deadlines. */
export function CampaignEditPage() {
  const id = Number(useParams().id);
  if (!Number.isInteger(id) || id <= 0) return <Navigate to={CAMPAIGNS_PATH} replace />;
  return <CampaignEditor id={id} />;
}

function CampaignEditor({ id }: { id: number }) {
  const campaign = useCampaign(id);

  if (campaign.isPending) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6" aria-busy="true">
        <Skeleton className="h-8 w-2/3 max-w-sm" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (campaign.isError) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <PageHeader title="Đợt thực tập" />
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được đợt thực tập</AlertTitle>
          <AlertDescription>{apiErrorMessage(campaign.error)}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => void campaign.refetch()}>
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      </div>
    );
  }

  const data = campaign.data;
  const isDraft = data.status === 'DRAFT';
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={data.name}
        status={data.status}
        actions={isDraft ? <OpenCampaignDialog campaign={data} /> : undefined}
      />
      {/* Remount on every saved version, so the form starts from what the API returned. */}
      {isDraft ? (
        <DraftCampaignForm key={data.rowVersion} campaign={data} />
      ) : (
        <RunningCampaignForm key={data.rowVersion} campaign={data} />
      )}
    </div>
  );
}
