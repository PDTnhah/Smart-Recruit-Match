import {
  HR_REJECT_REASON_LABELS,
  NOMINATION_STATUS_LABELS,
  NOMINATION_WARNING_LABELS,
  type NominationDetail,
} from '@srm/shared';
import { CircleAlert, FileText, TriangleAlert, UserRound } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { CvTrustBody } from '@/features/center/grading/cv-trust-section';
import { SCV_CRITERION_LABELS } from '@/features/center/campaigns/labels';
import { SKILL_LEVEL_LABELS } from '@/features/jds/labels';
import {
  EducationSection,
  LanguageSection,
  ProjectSection,
  ScoreSection,
  Section,
  SkillSection,
  TextList,
  ZoneSection,
} from '@/features/student/preferences/jd-explanation-sheet';
import { VERDICT_LABELS } from '@/features/student/preferences/labels';
import { ProfileSummary } from '@/features/student/profile/profile-summary';
import { formatDateTime, formatNumber } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { IconBadge } from '@/shared/ui/icon-badge';
import { useNomination } from './api';
import { InviteDialog, RejectDialog } from './decision-dialogs';
import { HR_STATUS_LABELS, NOMINATION_STATUS_STYLE } from './labels';

// Both load with the sheet's content only: react-pdf and recharts stay out of the portal's main bundle.
const CvViewer = lazy(() => import('@/shared/files/cv-viewer').then((module) => ({ default: module.CvViewer })));
const SkillRadar = lazy(() => import('./skill-radar').then((module) => ({ default: module.SkillRadar })));

type SheetTab = 'review' | 'profile' | 'cv';

const score = (value: number | null) => (value === null ? '–' : formatNumber(value, 2));

function ScoreTiles({ nomination }: { nomination: NominationDetail }) {
  const tiles = [
    ['S_final', nomination.scores.sFinal],
    ['S_test', nomination.scores.sTest],
    ['S_cv', nomination.scores.sCv],
  ] as const;
  return (
    <dl className="grid grid-cols-3 gap-4">
      {tiles.map(([name, value]) => (
        <div key={name} className="flex flex-col gap-1 rounded-lg border p-3">
          <dt className="text-sm text-muted-foreground">{name}</dt>
          <dd className="text-xl font-semibold tabular-nums">{score(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** HR's decision once made: when, and for a rejection the reason and the note (HR's own). */
function DecisionNote({ nomination }: { nomination: NominationDetail }) {
  const { review } = nomination;
  if (!review) return null;
  return (
    <Alert>
      <UserRound />
      <AlertTitle>
        {review.decision === 'INVITE'
          ? `Đã mời phỏng vấn lúc ${formatDateTime(review.decidedAt)}`
          : `Đã từ chối lúc ${formatDateTime(review.decidedAt)}: ${HR_REJECT_REASON_LABELS[review.reasonCode!]}`}
      </AlertTitle>
      {review.note && <AlertDescription className="whitespace-pre-wrap break-words">{review.note}</AlertDescription>}
    </Alert>
  );
}

/** Warnings of the test (AGENTS › Invariant 8): to check in the interview, never to fail a student. */
function Warnings({ nomination }: { nomination: NominationDetail }) {
  if (nomination.warnings.length === 0) return null;
  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>Cảnh báo khi làm test – chỉ để cảnh báo</AlertTitle>
      <AlertDescription>
        <TextList
          items={nomination.warnings.map((warning) => `${NOMINATION_WARNING_LABELS[warning.code]} (${formatNumber(warning.count)} câu)`)}
        />
        <p>Không dùng để đánh trượt; kiểm chứng lại khi phỏng vấn.</p>
      </AlertDescription>
    </Alert>
  );
}

function ReviewTab({ nomination }: { nomination: NominationDetail }) {
  const { match } = nomination;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <DecisionNote nomination={nomination} />
      <ScoreTiles nomination={nomination} />
      <Warnings nomination={nomination} />
      <Section title="Bản đồ năng lực">
        {nomination.test && nomination.test.skills.length > 0 ? (
          <Suspense fallback={<Skeleton className="aspect-square w-full max-w-sm" />}>
            <SkillRadar skills={nomination.test.skills} />
          </Suspense>
        ) : (
          <p className="text-sm text-muted-foreground">Bài test không có điểm theo kỹ năng.</p>
        )}
      </Section>
      {nomination.cvTrust.state !== 'NONE' && (
        <Section title="Chỉ số tin cậy CV">
          <p className="text-sm text-muted-foreground">
            Câu trả lời của phần C về dự án, kinh nghiệm, kỹ năng khai trong CV, đối chiếu với CV. Chỉ để tham khảo, không
            tính vào điểm.
          </p>
          <CvTrustBody view={nomination.cvTrust} />
        </Section>
      )}
      {match ? (
        <>
          <ScoreSection item={match} />
          {match.gaps.length > 0 && (
            <Section title="Kỹ năng còn thiếu">
              <TextList
                items={match.gaps.map(
                  (gap) =>
                    `${gap.skill}: yêu cầu ${SKILL_LEVEL_LABELS[gap.levelRequired]}, hồ sơ ${VERDICT_LABELS[gap.verdict].toLowerCase()}`,
                )}
              />
            </Section>
          )}
          <SkillSection title={SCV_CRITERION_LABELS.must_have} skills={match.skills.must_have} />
          <SkillSection title={SCV_CRITERION_LABELS.nice_to_have} skills={match.skills.nice_to_have} />
          <ZoneSection item={match} />
          <ProjectSection item={match} />
          <LanguageSection item={match} />
          <EducationSection item={match} />
        </>
      ) : (
        <Section title="Điểm phù hợp">
          <p className="text-sm text-muted-foreground">Không còn kết quả chấm phù hợp chi tiết của hồ sơ này.</p>
        </Section>
      )}
    </div>
  );
}

function NoCv({ title }: { title: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileText />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>Sinh viên không còn CV đang dùng trong đợt này.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function Body({ jdId, nomination, readOnly }: { jdId: number; nomination: NominationDetail; readOnly: boolean }) {
  const [tab, setTab] = useState<SheetTab>('review');
  // The CV loads once its tab is opened, then stays mounted (DESIGN.md §6 › tabs).
  const [cvOpened, setCvOpened] = useState(false);
  if (tab === 'cv' && !cvOpened) setCvOpened(true);
  const label = HR_STATUS_LABELS[nomination.status] ?? NOMINATION_STATUS_LABELS[nomination.status];
  const decidable = nomination.status === 'NOMINATED' && !readOnly;
  return (
    <>
      {/* Room for the close button in the corner. */}
      <SheetHeader className="pr-12">
        <SheetTitle className="break-words">{nomination.student.fullName}</SheetTitle>
        <SheetDescription className="break-words">
          Mã SV {nomination.student.studentCode} · Vòng {nomination.roundNo} · Hạn phản hồi{' '}
          {formatDateTime(nomination.reviewDueAt)}
        </SheetDescription>
        <div>
          <IconBadge style={NOMINATION_STATUS_STYLE[nomination.status]}>{label}</IconBadge>
        </div>
      </SheetHeader>
      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next as SheetTab)}
        className="flex min-h-0 flex-1 flex-col gap-4 px-4"
      >
        <TabsList variant="line" aria-label="Phần của hồ sơ" className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="review">Đánh giá</TabsTrigger>
          <TabsTrigger value="profile">Hồ sơ năng lực</TabsTrigger>
          <TabsTrigger value="cv">CV gốc</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <TabsContent value="review" forceMount className="data-[state=inactive]:hidden">
            <ReviewTab nomination={nomination} />
          </TabsContent>
          <TabsContent value="profile" forceMount className="data-[state=inactive]:hidden">
            {nomination.cv?.profile ? <ProfileSummary profile={nomination.cv.profile} /> : <NoCv title="Chưa có hồ sơ năng lực" />}
          </TabsContent>
          <TabsContent value="cv" forceMount className="data-[state=inactive]:hidden">
            {!nomination.cv ? (
              <NoCv title="Không có file CV" />
            ) : (
              cvOpened && (
                <Suspense fallback={<Skeleton className="aspect-[210/297] w-full" />}>
                  <CvViewer fileId={nomination.cv.fileId} fileName={nomination.cv.fileName} hint="Mở file CV ở thẻ mới để xem bản gốc." />
                </Suspense>
              )
            )}
          </TabsContent>
        </div>
      </Tabs>
      <SheetFooter className="sm:flex-row sm:justify-end">
        {decidable && (
          <>
            <RejectDialog jdId={jdId} nomination={nomination} />
            <InviteDialog jdId={jdId} nomination={nomination} />
          </>
        )}
        <SheetClose asChild>
          <Button variant="outline">Đóng</Button>
        </SheetClose>
      </SheetFooter>
    </>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <>
      <SheetHeader className="pr-12">
        <SheetTitle>Hồ sơ đề cử</SheetTitle>
        <SheetDescription className="sr-only">Hồ sơ của sinh viên được đề cử vào JD</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">{children}</div>
    </>
  );
}

/**
 * One nomination, opened from the table (GĐ8, US-5.3 AC-2, AC-12): the scores, the skill map of the
 * test, its warnings, the CV trust index and the S_cv evidence; the competence profile; the original
 * CV. Invite and reject sit in the footer while the nomination waits for HR. A bottom sheet on
 * phones, a wide side sheet from `md` (DESIGN.md §5 item 7, §6 › sheet).
 */
export function NominationSheet({
  jdId,
  nominationId,
  readOnly,
  onClose,
}: {
  jdId: number;
  nominationId: number | null;
  /** The campaign is over: read only. */
  readOnly: boolean;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const detail = useNomination(nominationId);
  let content;
  if (detail.isPending) {
    content = (
      <Frame>
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Frame>
    );
  } else if (detail.isError) {
    content = (
      <Frame>
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được hồ sơ đề cử</AlertTitle>
          <AlertDescription>{apiErrorMessage(detail.error)}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      </Frame>
    );
  } else {
    content = <Body key={detail.data.nominationId} jdId={jdId} nomination={detail.data} readOnly={readOnly} />;
  }
  return (
    <Sheet open={nominationId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'max-h-[90svh]' : 'data-[side=right]:md:max-w-3xl'}
      >
        {content}
      </SheetContent>
    </Sheet>
  );
}
