import { CV_TRUST_LEVEL_LABELS, type CvTrustLevel, type CvTrustQuestion, type CvTrustView, type CvVerdict } from '@srm/shared';
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from 'lucide-react';
import { useId } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { IconBadge, type IconBadgeStyle } from '@/shared/ui/icon-badge';
import { useCvTrust } from './api';
import { CV_CLAIM_SECTION_LABELS, CV_VERDICT_LABELS } from './labels';

// DESIGN.md §6 › badge: like the skill verdicts and the competition levels, always with an icon.
const VERDICT_STYLE: Record<CvVerdict, IconBadgeStyle> = {
  CONSISTENT: { variant: 'default', icon: CircleCheck },
  PARTIAL: { variant: 'secondary', icon: CircleDashed },
  INCONSISTENT: { variant: 'outline', icon: CircleX },
  NO_ANSWER: { variant: 'outline', icon: CircleMinus },
};

const LEVEL_STYLE: Record<CvTrustLevel, IconBadgeStyle> = {
  HIGH: { variant: 'default', icon: SignalHigh },
  MEDIUM: { variant: 'secondary', icon: SignalMedium },
  LOW: { variant: 'outline', icon: SignalLow },
};

/** Text written by the student or the LLM: plain text, line breaks kept (Invariant 6). */
function PlainText({ text }: { text: string }) {
  return <p className="text-sm whitespace-pre-wrap break-words">{text}</p>;
}

function Question({ question }: { question: CvTrustQuestion }) {
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <h4 className="text-sm font-medium break-words">
        Câu {question.no} · {CV_CLAIM_SECTION_LABELS[question.claimSection]}: {question.claimLabel}
      </h4>
      <dl className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Câu hỏi</dt>
          <dd>
            <PlainText text={question.stem} />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Câu trả lời</dt>
          <dd>
            {question.answer ? (
              <PlainText text={question.answer} />
            ) : (
              <p className="text-sm text-muted-foreground">Bỏ trống.</p>
            )}
          </dd>
        </div>
        {question.verdict && (
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">Nhận định</dt>
            <dd className="flex flex-col items-start gap-1">
              <IconBadge style={VERDICT_STYLE[question.verdict]}>{CV_VERDICT_LABELS[question.verdict]}</IconBadge>
              {question.reason && <PlainText text={question.reason} />}
            </dd>
          </div>
        )}
        {question.quote && (
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">Trích dẫn từ câu trả lời</dt>
            <dd>
              <PlainText text={`“${question.quote}”`} />
            </dd>
          </div>
        )}
      </dl>
    </li>
  );
}

const STATE_NOTES: Record<Exclude<CvTrustView['state'], 'DONE'>, string> = {
  NONE: 'Bài này không có phần D.',
  PENDING: 'Câu trả lời đang được đối chiếu với CV; chỉ số có khi đối chiếu xong.',
  FAILED: 'Không đối chiếu được câu trả lời với CV, nên bài này không có chỉ số tin cậy.',
};

function TrustBody({ view }: { view: CvTrustView }) {
  return (
    <>
      {view.state === 'DONE' ? (
        // DONE always has both (CHECK on cv_verifications).
        <div className="flex flex-wrap items-center gap-2">
          <IconBadge style={LEVEL_STYLE[view.trustLevel!]}>{`Tin cậy: ${CV_TRUST_LEVEL_LABELS[view.trustLevel!]}`}</IconBadge>
          <span className="text-sm font-medium tabular-nums">Chỉ số {formatNumber(view.trustScore!)} / 100</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{STATE_NOTES[view.state]}</p>
      )}
      {view.questions.length > 0 && (
        <ol className="flex flex-col gap-4">
          {view.questions.map((question) => (
            <Question key={question.no} question={question} />
          ))}
        </ol>
      )}
    </>
  );
}

/**
 * Part D of the session and its CV trust index, read only (US-4.8 AC-7): staff reference, never
 * scored, so it sits after the grade of the answer.
 */
export function CvTrustSection({ sessionId }: { sessionId: number }) {
  const headingId = useId();
  const trust = useCvTrust(sessionId);
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2">
      <h3 id={headingId} className="text-base font-medium">
        Chỉ số tin cậy CV
      </h3>
      <p className="text-sm text-muted-foreground">
        Phần D của bài #{sessionId}: câu trả lời về dự án, kinh nghiệm, kỹ năng sinh viên khai trong CV, đối chiếu với
        CV. Chỉ để tham khảo, không tính vào điểm bài test và không dùng khi chấm câu tự luận.
      </p>
      {trust.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : trust.isError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được chỉ số tin cậy CV</AlertTitle>
          <AlertDescription>{apiErrorMessage(trust.error)}</AlertDescription>
          <AlertAction>
            <Button type="button" variant="outline" size="sm" onClick={() => void trust.refetch()}>
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <TrustBody view={trust.data} />
      )}
    </section>
  );
}
