import { CircleAlert, FileText, House } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useCurrentUser } from '@/app/session';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaigns } from '@/features/center/campaigns/api';
import { useConsents, useMyCvs } from '@/features/student/profile/api';
import { hasCurrentConsent, PROFILE_PATH, takesCvs } from '@/features/student/profile/intake';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';

interface Todo {
  campaignId: number;
  title: string;
  description: string;
}

/**
 * Home of the student portal: what to do now (US-1.6 AC-1). A campaign taking CVs leads the
 * student to consent and submit on "Hồ sơ" as soon as they open the portal. Four states of
 * DESIGN.md §7.
 */
export function StudentHomePage() {
  const user = useCurrentUser();
  const campaigns = useCampaigns();
  const consents = useConsents();
  const cvs = useMyCvs();
  const [now] = useState(() => Date.now());

  const title = (
    <h1 className="font-heading text-xl font-semibold md:text-2xl">Xin chào, {user.fullName ?? user.email}</h1>
  );

  if (campaigns.isPending || consents.isPending || cvs.isPending) {
    return (
      <>
        {title}
        <Skeleton className="h-40 w-full" aria-busy="true" />
      </>
    );
  }

  const failed = [campaigns, consents, cvs].find((query) => query.isError);
  if (failed || !campaigns.data || !consents.data || !cvs.data) {
    return (
      <>
        {title}
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được việc cần làm</AlertTitle>
          <AlertDescription>{apiErrorMessage(failed?.error)}</AlertDescription>
          <AlertAction>
            <Button
              variant="outline"
              onClick={() => {
                for (const query of [campaigns, consents, cvs]) if (query.isError) void query.refetch();
              }}
            >
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      </>
    );
  }

  const consentList = consents.data;
  const cvList = cvs.data;
  const todos: Todo[] = campaigns.data
    .filter((campaign) => takesCvs(campaign, now))
    .flatMap((campaign) => {
      const deadline = campaign.phaseDeadlines.intake_end;
      const until = deadline ? ` đến ${formatDateTime(deadline)}` : '';
      if (!hasCurrentConsent(consentList, campaign.id)) {
        return [
          {
            campaignId: campaign.id,
            title: 'Đồng ý điều khoản và nộp CV',
            description: `Đợt ${campaign.name} đang nhận CV${until}. Đọc và đồng ý điều khoản xử lý dữ liệu cá nhân, rồi nộp CV.`,
          },
        ];
      }
      if (!cvList.some((cv) => cv.campaignId === campaign.id && cv.active)) {
        return [{ campaignId: campaign.id, title: 'Nộp CV', description: `Đợt ${campaign.name} đang nhận CV${until}.` }];
      }
      return [];
    });

  if (todos.length === 0) {
    return (
      <>
        {title}
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <House />
            </EmptyMedia>
            <EmptyTitle>Chưa có việc cần làm</EmptyTitle>
            <EmptyDescription>Các việc cần làm của đợt thực tập sẽ hiện ở đây.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    );
  }

  return (
    <>
      {title}
      {todos.map((todo) => (
        <Card key={todo.campaignId}>
          <CardHeader>
            <CardTitle>
              <h2>{todo.title}</h2>
            </CardTitle>
            <CardDescription className="break-words">{todo.description}</CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-end">
            <Button asChild className="w-full sm:w-auto">
              <Link to={`${PROFILE_PATH}?campaign=${todo.campaignId}`}>
                <FileText data-icon="inline-start" />
                Mở hồ sơ
              </Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </>
  );
}
