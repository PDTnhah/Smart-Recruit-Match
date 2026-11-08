import type { Campaign, Cv, MyExamsResponse } from '@srm/shared';
import { CircleAlert, ClipboardCheck, FileText, House, ListOrdered, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useCurrentUser } from '@/app/session';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaigns } from '@/features/center/campaigns/api';
import { useMyExams } from '@/features/exam/api';
import { EXAMS_PATH } from '@/features/exam/paths';
import { PREFERENCES_PATH } from '@/features/student/preferences/paths';
import { useConsents, useMyCvs } from '@/features/student/profile/api';
import { hasCurrentConsent, PROFILE_PATH, takesCvs } from '@/features/student/profile/intake';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';

interface Todo {
  key: string;
  title: string;
  description: string;
  href: string;
  action: string;
  icon: LucideIcon;
}

/** GĐ4 is open for the campaign: its phase, before `preference_end` (the API decides on save anyway). */
function choosesPreferences(campaign: Campaign, now: number): boolean {
  const deadline = campaign.phaseDeadlines.preference_end;
  return campaign.status === 'PREFERENCE_SELECTION' && (!deadline || Date.parse(deadline) > now);
}

/**
 * The campaign "Nguyện vọng" shows, as `GET /api/me/shortlist` picks it (CONTEXT D47): that of the
 * student's newest active CV, unless the campaign is a draft or closed; with that CV.
 */
function preferenceCampaignOf(
  campaigns: readonly Campaign[],
  cvs: readonly Cv[],
): { campaign: Campaign; cv: Cv } | null {
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  for (const cv of [...cvs].filter((item) => item.active).sort((a, b) => b.id - a.id)) {
    const campaign = byId.get(cv.campaignId);
    if (campaign && campaign.status !== 'DRAFT' && campaign.status !== 'CLOSED') return { campaign, cv };
  }
  return null;
}

/** US-4.3: tests the student can start or go on with while the campaign is in TESTING. */
function examTodos(view: MyExamsResponse): Todo[] {
  const campaign = view.campaign;
  if (!campaign?.testingOpen) return [];
  const open = view.items.filter((item) => item.canStart || item.examStatus === 'IN_PROGRESS').length;
  if (open === 0) return [];
  const until = campaign.testingEnd ? ` đến ${formatDateTime(campaign.testingEnd)}` : '';
  return [
    {
      key: `exams-${campaign.id}`,
      title: 'Làm bài test',
      description: `Đợt ${campaign.name} đang cho làm bài test${until}. Còn ${open} bài test chưa nộp; mỗi bài chỉ làm một lần, nguyện vọng không làm bài test trước hạn sẽ bị hủy.`,
      href: EXAMS_PATH,
      action: 'Mở bài test',
      icon: ClipboardCheck,
    },
  ];
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
  const exams = useMyExams();
  const [now] = useState(() => Date.now());

  const title = (
    <h1 className="font-heading text-xl font-semibold md:text-2xl">Xin chào, {user.fullName ?? user.email}</h1>
  );

  if (campaigns.isPending || consents.isPending || cvs.isPending || exams.isPending) {
    return (
      <>
        {title}
        <Skeleton className="h-40 w-full" aria-busy="true" />
      </>
    );
  }

  // The tests are one source of todos among others: when they fail to load, the rest still shows.
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
                for (const query of [campaigns, consents, cvs, exams]) if (query.isError) void query.refetch();
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
  const profileTodo = (campaignId: number, title: string, description: string): Todo => ({
    key: `cv-${campaignId}`,
    title,
    description,
    href: `${PROFILE_PATH}?campaign=${campaignId}`,
    action: 'Mở hồ sơ',
    icon: FileText,
  });
  const intakeTodos: Todo[] = campaigns.data
    .filter((campaign) => takesCvs(campaign, now))
    .flatMap((campaign) => {
      const deadline = campaign.phaseDeadlines.intake_end;
      const until = deadline ? ` đến ${formatDateTime(deadline)}` : '';
      if (!hasCurrentConsent(consentList, campaign.id)) {
        return [
          profileTodo(
            campaign.id,
            'Đồng ý điều khoản và nộp CV',
            `Đợt ${campaign.name} đang nhận CV${until}. Đọc và đồng ý điều khoản xử lý dữ liệu cá nhân, rồi nộp CV.`,
          ),
        ];
      }
      if (!cvList.some((cv) => cv.campaignId === campaign.id && cv.active)) {
        return [profileTodo(campaign.id, 'Nộp CV', `Đợt ${campaign.name} đang nhận CV${until}.`)];
      }
      return [];
    });
  // US-3.3: the campaign "Nguyện vọng" shows is in GĐ4 and the student's CV there is confirmed.
  const shown = preferenceCampaignOf(campaigns.data, cvList);
  const preferenceTodos: Todo[] = (shown ? [shown] : [])
    .filter(({ campaign, cv }) => cv.status === 'CONFIRMED' && choosesPreferences(campaign, now))
    .map(({ campaign }) => {
      const deadline = campaign.phaseDeadlines.preference_end;
      return {
        key: `preferences-${campaign.id}`,
        title: 'Chọn nguyện vọng',
        description: `Đợt ${campaign.name} đang cho chọn nguyện vọng${deadline ? ` đến ${formatDateTime(deadline)}` : ''}. Xem các JD được gợi ý, chọn và xếp tối đa ${campaign.config.n_nv} nguyện vọng rồi lưu lại.`,
        href: PREFERENCES_PATH,
        action: 'Chọn nguyện vọng',
        icon: ListOrdered,
      };
    });
  const todos = [...intakeTodos, ...preferenceTodos, ...(exams.data ? examTodos(exams.data) : [])];
  const examsFailed = exams.isError && (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>Không tải được bài test</AlertTitle>
      <AlertDescription>{apiErrorMessage(exams.error)}</AlertDescription>
      <AlertAction>
        <Button variant="outline" onClick={() => void exams.refetch()}>
          Thử lại
        </Button>
      </AlertAction>
    </Alert>
  );

  if (todos.length === 0) {
    return (
      <>
        {title}
        {examsFailed}
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
      {examsFailed}
      {todos.map((todo) => (
        <Card key={todo.key}>
          <CardHeader>
            <CardTitle>
              <h2>{todo.title}</h2>
            </CardTitle>
            <CardDescription className="break-words">{todo.description}</CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-end">
            <Button asChild className="w-full sm:w-auto">
              <Link to={todo.href}>
                <todo.icon data-icon="inline-start" />
                {todo.action}
              </Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </>
  );
}
