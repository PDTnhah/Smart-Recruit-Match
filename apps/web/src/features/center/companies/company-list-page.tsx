import type { Company } from '@srm/shared';
import { Building2, CircleAlert, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiErrorMessage } from '@/shared/api/errors';
import { useCompanies } from './api';
import { COMPANIES_PATH, companyPath } from './paths';

function NewCompanyButton() {
  return (
    <Button asChild>
      <Link to={`${COMPANIES_PATH}/new`}>
        <Plus data-icon="inline-start" />
        Thêm doanh nghiệp
      </Link>
    </Button>
  );
}

function CompanyTable({ companies }: { companies: Company[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tên doanh nghiệp</TableHead>
          <TableHead>Lĩnh vực</TableHead>
          <TableHead>Người liên hệ</TableHead>
          <TableHead>
            <span className="sr-only">Thao tác</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {companies.map((company) => {
          const contact = [company.contact.name, company.contact.email, company.contact.phone]
            .filter(Boolean)
            .join(' · ');
          return (
            <TableRow key={company.id}>
              <TableCell className="max-w-72 truncate font-medium" title={company.name}>
                <Link to={companyPath(company.id)} className="hover:underline">
                  {company.name}
                </Link>
              </TableCell>
              <TableCell>{company.field ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="max-w-72 truncate" title={contact}>
                {contact || <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={companyPath(company.id)}>Sửa, mời HR</Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** "Doanh nghiệp" of the center portal (US-1.5 AC-10), with the four states of DESIGN.md §7. */
export function CompanyListPage() {
  const companies = useCompanies();

  let content;
  if (companies.isPending) {
    content = (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  } else if (companies.isError) {
    content = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được danh sách doanh nghiệp</AlertTitle>
        <AlertDescription>{apiErrorMessage(companies.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void companies.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (companies.data.length === 0) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2 />
          </EmptyMedia>
          <EmptyTitle>Chưa có doanh nghiệp</EmptyTitle>
          <EmptyDescription>Thêm doanh nghiệp tham gia rồi mời HR của họ để đăng JD.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <NewCompanyButton />
        </EmptyContent>
      </Empty>
    );
  } else {
    content = <CompanyTable companies={companies.data} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold md:text-2xl">Doanh nghiệp</h1>
        {companies.isSuccess && companies.data.length > 0 && <NewCompanyButton />}
      </div>
      {content}
    </>
  );
}
