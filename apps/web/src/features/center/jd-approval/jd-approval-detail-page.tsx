import { ArrowLeft, CircleAlert } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useJd } from '@/features/jds/api';
import { JdDetails } from '@/features/jds/jd-details';
import { JdStatusBadge } from '@/features/jds/jd-status-badge';
import { apiErrorMessage } from '@/shared/api/errors';
import { ApproveJdDialog } from './approve-jd-dialog';
import { JD_APPROVAL_PATH } from './paths';

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="self-start">
      <Link to={JD_APPROVAL_PATH}>
        <ArrowLeft data-icon="inline-start" />
        Duyệt JD
      </Link>
    </Button>
  );
}

/** `/admin/job-descriptions/:id`: a JD with its original file and the approve action (AC-7, AC-10). */
export function JdApprovalDetailPage() {
  const id = Number(useParams().id);
  if (!Number.isInteger(id) || id <= 0) return <Navigate to={JD_APPROVAL_PATH} replace />;
  return <JdApprovalDetail id={id} />;
}

function JdApprovalDetail({ id }: { id: number }) {
  const jd = useJd(id);

  if (jd.isPending) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6" aria-busy="true">
        <Skeleton className="h-8 w-2/3 max-w-sm" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (jd.isError) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <BackLink />
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được JD</AlertTitle>
          <AlertDescription>{apiErrorMessage(jd.error)}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => void jd.refetch()}>
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      </div>
    );
  }

  const data = jd.data;
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 font-heading text-xl font-semibold break-words md:text-2xl">{data.title}</h1>
          <JdStatusBadge jd={data} />
          {data.status === 'PENDING_APPROVAL' && (
            <div className="ml-auto">
              <ApproveJdDialog jd={data} />
            </div>
          )}
        </div>
      </div>
      <JdDetails jd={data} showCompany />
    </div>
  );
}
