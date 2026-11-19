import { EXAM_PARTS, type QuestionReviewSample } from '@srm/shared';
import { CircleAlert, FileQuestion, Lock } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { EXAM_PART_TITLES } from '@/features/center/question-bank/labels';
import { formatNumber } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { useReviewSample } from './api';
import { SampleQuestionCard } from './sample-question-card';

function Summary({ sample }: { sample: QuestionReviewSample }) {
  const reviewed = sample.questions.filter((question) => question.review !== null).length;
  const reported = sample.questions.filter((question) => question.review?.verdict === 'ERROR').length;
  const locked = sample.bank?.status === 'LOCKED';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Duyệt đề mẫu</CardTitle>
        <CardDescription>
          {formatNumber(sample.questions.length)} câu chọn ngẫu nhiên từ ngân hàng câu hỏi của JD, chia đều theo các ô của
          ma trận đề. Xác nhận câu đúng, hoặc báo lỗi câu sai: câu bị báo lỗi bị loại ngay và không được rút cho sinh
          viên. Duyệt là tùy chọn, không ai duyệt thì kỳ thi vẫn diễn ra.
        </CardDescription>
        {locked && (
          <CardAction>
            <Badge>
              <Lock data-icon="inline-start" />
              Đã khóa
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p className="tabular-nums" aria-live="polite">
          Đã duyệt {formatNumber(reviewed)}/{formatNumber(sample.questions.length)} câu · {formatNumber(reported)} câu bị
          báo lỗi
        </p>
        {locked && sample.bank && (
          <p className="text-muted-foreground">
            Ngân hàng đã khóa (phiên bản {formatNumber(sample.bank.version)}): mỗi câu bị báo lỗi làm phiên bản tăng thêm
            một. Bài test đã rút trước đó giữ nguyên đề.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * "Duyệt đề mẫu" (FR-19, US-4.9 AC-6), for HR of the JD's company and for CENTER: a random sample of the JD's
 * question bank, part A then part B, each question with its answer key or rubric and the review actions.
 * `readOnly` hides the actions (a cancelled campaign: the API refuses them anyway).
 */
export function ReviewSamplePanel({ jdId, readOnly = false }: { jdId: number; readOnly?: boolean }) {
  const sample = useReviewSample(jdId);

  if (sample.isPending) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6" aria-busy="true">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (sample.isError) {
    return (
      <Alert variant="destructive" className="max-w-3xl">
        <CircleAlert />
        <AlertTitle>Không tải được đề mẫu</AlertTitle>
        <AlertDescription>{apiErrorMessage(sample.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void sample.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  const data = sample.data;
  if (data.questions.length === 0) {
    return (
      <Empty className="max-w-3xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestion />
          </EmptyMedia>
          <EmptyTitle>Chưa có câu hỏi để duyệt</EmptyTitle>
          <EmptyDescription>
            Ngân hàng câu hỏi của JD này chưa có câu dùng được. Trung tâm sinh câu cho ngân hàng sau khi duyệt JD; mẫu
            duyệt có ngay khi có câu.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // The API lists part A then part B, so a question's number is its place in the sample.
  const numbered = data.questions.map((question, index) => ({ question, number: index + 1 }));
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <Summary sample={data} />
      {EXAM_PARTS.map((part) => {
        const questions = numbered.filter(({ question }) => question.part === part);
        if (questions.length === 0) return null;
        return (
          <section key={part} className="flex flex-col gap-4" aria-labelledby={`review-part-${part}`}>
            <h2 id={`review-part-${part}`} className="font-heading text-base font-medium">
              {EXAM_PART_TITLES[part]}
            </h2>
            {questions.map(({ question, number }) => (
              <SampleQuestionCard key={question.id} jdId={jdId} question={question} number={number} readOnly={readOnly} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
