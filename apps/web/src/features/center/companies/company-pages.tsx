import { ArrowLeft, CircleAlert } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiErrorMessage } from '@/shared/api/errors';
import { useCompany } from './api';
import { CompanyForm } from './company-form';
import { HrAccountsCard } from './hr-accounts-card';
import { COMPANIES_PATH } from './paths';

function PageHeader({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link to={COMPANIES_PATH}>
          <ArrowLeft data-icon="inline-start" />
          Doanh nghiệp
        </Link>
      </Button>
      <h1 className="min-w-0 font-heading text-xl font-semibold break-words md:text-2xl">{title}</h1>
    </div>
  );
}

/** `/admin/companies/new` (US-1.5 AC-1, AC-10). */
export function CompanyCreatePage() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Thêm doanh nghiệp" />
      <CompanyForm />
    </div>
  );
}

/** `/admin/companies/:id`: edit the company, list and invite its HR accounts (AC-1, AC-2, AC-10). */
export function CompanyDetailPage() {
  const id = Number(useParams().id);
  if (!Number.isInteger(id) || id <= 0) return <Navigate to={COMPANIES_PATH} replace />;
  return <CompanyDetail id={id} />;
}

function CompanyDetail({ id }: { id: number }) {
  const company = useCompany(id);

  if (company.isPending) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6" aria-busy="true">
        <Skeleton className="h-8 w-2/3 max-w-sm" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (company.isError) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <PageHeader title="Doanh nghiệp" />
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được doanh nghiệp</AlertTitle>
          <AlertDescription>{apiErrorMessage(company.error)}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => void company.refetch()}>
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={company.data.name} />
      {/* Remount on every saved version, so the form starts from what the API returned. */}
      <CompanyForm key={company.data.updatedAt} company={company.data} />
      <HrAccountsCard companyId={company.data.id} />
    </div>
  );
}
