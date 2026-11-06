import { QUESTION_BANK_JD_STATES } from '@srm/shared';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QuestionBankPanel } from '@/features/center/question-bank/question-bank-panel';
import { useJd } from '@/features/jds/api';
import { JdDetails } from '@/features/jds/jd-details';
import { JdStatusBadge } from '@/features/jds/jd-status-badge';
import { RequirementsPanel } from '@/features/jds/requirements/requirements-panel';
import { apiErrorMessage } from '@/shared/api/errors';
import { ApproveJdDialog } from './approve-jd-dialog';
import { JD_APPROVAL_PATH } from './paths';

/** `?tab=question-bank` opens the bank, so a reload or a link keeps it. */
const TAB_PARAM = 'tab';
const QUESTION_BANK_TAB = 'question-bank';
const DETAILS_TAB = 'details';

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

/**
 * `/admin/job-descriptions/:id`: a JD with its original file, the requirements HR confirmed and the
 * hidden-text flag (US-2.3 AC-12), and the approve action (US-1.5 AC-7, AC-10). An approved JD's
 * requirements can be versioned here (BR-18), and it has the "Ngân hàng câu hỏi" tab (US-4.1 AC-11).
 */
export function JdApprovalDetailPage() {
  const id = Number(useParams().id);
  if (!Number.isInteger(id) || id <= 0) return <Navigate to={JD_APPROVAL_PATH} replace />;
  return <JdApprovalDetail id={id} />;
}

function JdApprovalDetail({ id }: { id: number }) {
  const jd = useJd(id);
  const [params, setParams] = useSearchParams();
  const tab = params.get(TAB_PARAM) === QUESTION_BANK_TAB ? QUESTION_BANK_TAB : DETAILS_TAB;
  // The bank tab mounts once opened, so a JD only read on its details tab does not load (and make)
  // the bank, then stays mounted like the details tab.
  const [bankOpened, setBankOpened] = useState(tab === QUESTION_BANK_TAB);
  if (tab === QUESTION_BANK_TAB && !bankOpened) setBankOpened(true);

  function selectTab(next: string) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === QUESTION_BANK_TAB) updated.set(TAB_PARAM, next);
        else updated.delete(TAB_PARAM);
        return updated;
      },
      { replace: true },
    );
  }

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
  const details = (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <JdDetails jd={data} showCompany />
      {data.status !== 'DRAFT' && <RequirementsPanel jdId={data.id} />}
    </div>
  );
  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
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
      {QUESTION_BANK_JD_STATES.includes(data.status) ? (
        <Tabs value={tab} onValueChange={selectTab} className="gap-6">
          <TabsList>
            <TabsTrigger value={DETAILS_TAB}>Thông tin JD</TabsTrigger>
            <TabsTrigger value={QUESTION_BANK_TAB}>Ngân hàng câu hỏi</TabsTrigger>
          </TabsList>
          {/* Both stay mounted, so switching tabs keeps a form being edited (DESIGN.md §6 › tabs). */}
          <TabsContent value={DETAILS_TAB} forceMount className="data-[state=inactive]:hidden">
            {details}
          </TabsContent>
          <TabsContent value={QUESTION_BANK_TAB} forceMount className="data-[state=inactive]:hidden">
            {bankOpened && <QuestionBankPanel jdId={data.id} visible={tab === QUESTION_BANK_TAB} />}
          </TabsContent>
        </Tabs>
      ) : (
        details
      )}
    </div>
  );
}
