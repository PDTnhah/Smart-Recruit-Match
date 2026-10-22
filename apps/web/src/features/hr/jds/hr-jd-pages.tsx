import type { JobDescription } from '@srm/shared';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useJd } from '@/features/jds/api';
import { JdDetails } from '@/features/jds/jd-details';
import { JdStatusBadge } from '@/features/jds/jd-status-badge';
import { RequirementsPanel } from '@/features/jds/requirements/requirements-panel';
import { apiErrorMessage } from '@/shared/api/errors';
import { JdFileCard } from './jd-file-card';
import { JdForm } from './jd-form';
import { HR_JDS_PATH } from './paths';
import { SubmitJdDialog } from './submit-jd-dialog';

function PageHeader({ title, jd, actions }: { title: string; jd?: JobDescription; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link to={HR_JDS_PATH}>
          <ArrowLeft data-icon="inline-start" />
          JD của tôi
        </Link>
      </Button>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 font-heading text-xl font-semibold break-words md:text-2xl">{title}</h1>
        {jd && <JdStatusBadge jd={jd} />}
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
    </div>
  );
}

/** `/hr/job-descriptions/new` (US-1.5 AC-4, AC-5, AC-10). */
export function HrJdCreatePage() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Đăng JD" />
      <JdForm />
    </div>
  );
}

/**
 * `/hr/job-descriptions/:id`: edit and submit a draft (US-1.5 AC-6, AC-10); once submitted, the
 * JD next to its normalised requirements, which HR reviews and confirms (US-2.3 AC-7, AC-8).
 */
export function HrJdDetailPage() {
  const id = Number(useParams().id);
  if (!Number.isInteger(id) || id <= 0) return <Navigate to={HR_JDS_PATH} replace />;
  return <HrJdDetail id={id} />;
}

function HrJdDetail({ id }: { id: number }) {
  const jd = useJd(id);
  const [unsaved, setUnsaved] = useState(false);

  if (jd.isPending) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6" aria-busy="true">
        <Skeleton className="h-8 w-2/3 max-w-sm" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (jd.isError) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <PageHeader title="JD" />
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
  if (data.status === 'DRAFT') {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <PageHeader title={data.title} jd={data} actions={<SubmitJdDialog jd={data} unsavedChanges={unsaved} />} />
        {/* Keyed by id, not row_version: a file upload must not wipe unsaved input. */}
        <JdForm key={data.id} jd={data} onDirtyChange={setUnsaved} />
        <JdFileCard jd={data} />
      </div>
    );
  }

  // The original JD on the left, the requirements on the right (AC-7); stacked below lg.
  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title={data.title} jd={data} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <JdDetails jd={data} />
        <RequirementsPanel jdId={data.id} />
      </div>
    </div>
  );
}
