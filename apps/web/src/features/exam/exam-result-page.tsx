import { APPLICATION_STATUS_LABELS, type ExamResult, type ExamResultEssay, type ExamResultScores } from '@srm/shared';
import { ArrowLeft, CircleAlert, Hourglass } from 'lucide-react';
import { Fragment } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatX100 } from '@/features/student/preferences/labels';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { useExamResult } from './api';
import { EXAMS_PATH } from './paths';

/** A score or a number of points as the API gives it (two decimals at most): 72,5 and 8. */
function scoreText(value: number): string {
  return formatX100(Math.round(value * 100));
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="self-start">
      <Link to={EXAMS_PATH}>
        <ArrowLeft data-icon="inline-start" />
        Bài test
      </Link>
    </Button>
  );
}

function PageTitle() {
  return <h1 className="font-heading text-xl font-semibold md:text-2xl">Kết quả bài test</h1>;
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-6 w-2/3 max-w-sm" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-sm text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function ScoresCard({ scores }: { scores: ExamResultScores }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Điểm bài test</h2>
        </CardTitle>
        <CardDescription>Công bố lúc {formatDateTime(scores.publishedAt)}. Thang điểm 100.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-3 gap-4">
          <Figure label="Điểm test" value={scoreText(scores.sTest)} />
          <Figure label="Phần A" value={scoreText(scores.partA)} hint="Trắc nghiệm" />
          <Figure label="Phần B" value={scoreText(scores.partB)} hint="Tự luận" />
        </dl>
        <p className="text-sm text-muted-foreground">
          Điểm test cộng điểm hai phần theo tỷ trọng của đề. Đáp án câu trắc nghiệm không được công bố vì sinh viên khác
          có thể gặp cùng câu.
        </p>
      </CardContent>
    </Card>
  );
}

function PreferenceCard({ preference }: { preference: ExamResultScores['preference'] }) {
  if (preference === null) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Nguyện vọng</h2>
        </CardTitle>
        <CardDescription>Điểm tổng hợp dùng để xếp thứ tự khi phân bổ.</CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-2">
          <Badge variant={preference.rank === 1 ? 'default' : 'outline'}>NV{preference.rank}</Badge>
          <Badge variant="secondary">{APPLICATION_STATUS_LABELS[preference.status]}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4">
          <Figure label="Điểm phù hợp CV" value={preference.sCv === null ? '—' : scoreText(preference.sCv)} />
          <Figure label="Điểm tổng hợp" value={preference.sFinal === null ? '—' : scoreText(preference.sFinal)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function SkillsCard({ skills }: { skills: ExamResultScores['skills'] }) {
  if (skills.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Điểm theo kỹ năng</h2>
        </CardTitle>
        <CardDescription>Mỗi kỹ năng tính trên các câu hỏi về kỹ năng đó, cùng tỷ trọng với điểm test.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {skills.map((skill) => (
            <li key={skill.skill} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 font-medium break-words">{skill.skill}</span>
                <span className="shrink-0 text-sm tabular-nums">
                  {skill.score === null ? 'Không tính' : `${scoreText(skill.score)} / 100`}
                </span>
              </div>
              {skill.score !== null && <Progress value={skill.score} aria-label={`Điểm kỹ năng ${skill.skill}`} />}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function EssayResult({ essay }: { essay: ExamResultEssay }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`essay-${essay.questionId}`}>
      <div className="flex items-baseline justify-between gap-4">
        <h3 id={`essay-${essay.questionId}`} className="font-medium">
          Câu {essay.no}
        </h3>
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {scoreText(essay.points)} / {essay.maxPoints} điểm
        </span>
      </div>
      <p className="text-sm whitespace-pre-line text-muted-foreground break-words">{essay.stem}</p>
      {essay.criteria.length > 0 ? (
        <ol className="flex flex-col gap-4">
          {essay.criteria.map((criterion) => (
            <li key={criterion.no} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="font-medium">Tiêu chí {criterion.no}</span>
                <span className="shrink-0 tabular-nums">
                  {scoreText(criterion.points)} / {criterion.maxPoints}
                </span>
              </div>
              <p className="text-sm break-words">{criterion.reason}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Không có nhận xét theo tiêu chí: câu bỏ trống hoặc do cán bộ chấm.</p>
      )}
    </section>
  );
}

function EssaysCard({ essays }: { essays: ExamResultEssay[] }) {
  if (essays.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Câu tự luận</h2>
        </CardTitle>
        <CardDescription>
          Mỗi câu được chấm hai lần độc lập theo các tiêu chí của đề; điểm là trung bình hai lần, nhận xét lấy từ lần
          đầu.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {essays.map((essay, index) => (
          <Fragment key={essay.questionId}>
            {index > 0 && <Separator />}
            <EssayResult essay={essay} />
          </Fragment>
        ))}
      </CardContent>
    </Card>
  );
}

function ResultBody({ result }: { result: ExamResult }) {
  return (
    <>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium break-words">{result.jdTitle}</span>
        {result.companyName && <span className="text-sm text-muted-foreground break-words">{result.companyName}</span>}
        <span className="text-sm text-muted-foreground">Đã nộp lúc {formatDateTime(result.submittedAt)}</span>
      </div>
      {result.scores === null ? (
        <Alert>
          <Hourglass />
          <AlertTitle>Bài đang được chấm</AlertTitle>
          <AlertDescription>
            Kết quả được công bố sau khi hết hạn làm bài test của đợt và mọi câu tự luận đã có điểm; có câu cần cán bộ
            chấm thêm. Khi có kết quả, hệ thống gửi thông báo và email.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <ScoresCard scores={result.scores} />
          <PreferenceCard preference={result.scores.preference} />
          <SkillsCard skills={result.scores.skills} />
          <EssaysCard essays={result.scores.essays} />
        </>
      )}
    </>
  );
}

function ResultView({ sessionId }: { sessionId: number }) {
  const query = useExamResult(sessionId);
  return (
    <>
      <div className="flex flex-col gap-2">
        <BackLink />
        <PageTitle />
      </div>
      {query.isPending ? (
        <PageSkeleton />
      ) : query.isError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được kết quả bài test</AlertTitle>
          <AlertDescription>{apiErrorMessage(query.error)}</AlertDescription>
          <AlertAction>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <ResultBody result={query.data} />
      )}
    </>
  );
}

/**
 * `/sv/exams/:sessionId/result` (US-4.4 AC-12): the student's own results once published: S_test,
 * the two parts, the skill map, the preference's S_cv and S_final, and each essay's points with
 * the Grader's reasons by criterion number; until then, that the test is being graded. Nothing of
 * the answer key or the rubric reaches the page (the API leaves them out). Four states of
 * DESIGN.md §7; one column at 360 px (§5).
 */
export function ExamResultPage() {
  const sessionId = Number(useParams().sessionId);
  if (!Number.isInteger(sessionId) || sessionId <= 0) return <Navigate to={EXAMS_PATH} replace />;
  return <ResultView sessionId={sessionId} />;
}
