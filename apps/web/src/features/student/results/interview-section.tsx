import {
  INTERVIEW_MODE_LABELS,
  INTERVIEW_NOTE_MAX,
  INTERVIEW_STATUS_LABELS,
  type MyInterviews,
  OFFER_STATUS_LABELS,
  type OfferDeclinePolicy,
} from '@srm/shared';
import { CalendarClock, CalendarX, Hourglass, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useNow } from '@/features/exam/server-clock';
import { INTERVIEW_STATUS_STYLE, OFFER_STATUS_STYLE } from '@/features/hr/interviews/labels';
import { ConfirmActionDialog } from '@/features/student/profile/confirm-action-dialog';
import { formatCountdown, formatDateTime, formatRelative } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { IconBadge } from '@/shared/ui/icon-badge';
import { useAnswerOffer, useConfirmInterview, useRequestReschedule } from './api';

type Item = MyInterviews['items'][number];
type Interview = NonNullable<Item['interview']>;
type Offer = NonNullable<Item['offer']>;

/** What declining means in the campaign (Q4, BR-16, CONTEXT D66), said before the student confirms. */
const DECLINE_CONSEQUENCE: Record<OfferDeclinePolicy, string> = {
  DEMOTE:
    'Bạn sẽ về hàng chờ với các nguyện vọng còn lại, nhưng được xếp sau mọi sinh viên khác ở các vòng còn lại của đợt. Suất này được chuyển cho sinh viên dự bị.',
  EXCLUDE: 'Bạn sẽ không được xét ở các vòng còn lại của đợt. Suất này được chuyển cho sinh viên dự bị.',
};

const HOUR = 3_600_000;

/** A 409 means the page is stale (HR moved the time, the offer expired): reload and say why. */
function handleError(caught: unknown, setError: (message: string) => void, close: () => void) {
  if (caught instanceof ApiRequestError && caught.status === 409) {
    close();
    toast.error(apiErrorMessage(caught));
    return;
  }
  setError(apiErrorMessage(caught));
}

function InterviewBlock({ interview }: { interview: Interview }) {
  const confirm = useConfirmInterview(interview.interviewId);
  const reschedule = useRequestReschedule(interview.interviewId);
  const [dialog, setDialog] = useState<'confirm' | 'reschedule' | null>(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowVersion, setRowVersion] = useState(interview.rowVersion);
  const close = () => {
    setDialog(null);
    setError(null);
    setSubmitted(false);
  };
  const open = (next: 'confirm' | 'reschedule') => {
    setRowVersion(interview.rowVersion); // the version shown when the dialog opens (LESSONS §25)
    setDialog(next);
  };
  const noteError = submitted && note.trim() === '' ? 'Nhập lý do xin đổi lịch' : undefined;
  const notDone = interview.status !== 'DONE';
  // The one request (FR-30): the button is gone once it is made, also after HR set a new time.
  const canAskAgain = notDone && interview.rescheduleRequestedAt === null && interview.status !== 'RESCHEDULE_REQUESTED';
  const isLink = /^https?:\/\//i.test(interview.location);

  return (
    <section aria-label="Lịch phỏng vấn" className="flex flex-col gap-3">
      <span className="flex flex-wrap items-center gap-2">
        <CalendarClock className="size-5 shrink-0" aria-hidden="true" />
        <h3 className="text-base font-medium">Lịch phỏng vấn</h3>
        <IconBadge style={INTERVIEW_STATUS_STYLE[interview.status]}>{INTERVIEW_STATUS_LABELS[interview.status]}</IconBadge>
      </span>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Thời gian</dt>
        <dd className="tabular-nums">{formatDateTime(interview.scheduledAt)}</dd>
        <dt className="text-muted-foreground">Hình thức</dt>
        <dd>{INTERVIEW_MODE_LABELS[interview.mode]}</dd>
        <dt className="text-muted-foreground">{interview.mode === 'ONLINE' ? 'Đường link' : 'Địa điểm'}</dt>
        <dd className="min-w-0 break-words">
          {isLink ? (
            <a href={interview.location} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-4">
              {interview.location}
            </a>
          ) : (
            interview.location
          )}
        </dd>
      </dl>
      {interview.status === 'RESCHEDULE_REQUESTED' && (
        <p className="text-sm text-muted-foreground">Đã gửi yêu cầu đổi lịch. Doanh nghiệp sẽ đặt giờ mới và báo cho bạn.</p>
      )}
      {notDone && (interview.status === 'SCHEDULED' || canAskAgain) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {interview.status === 'SCHEDULED' && (
            <Button className="w-full sm:w-auto" onClick={() => open('confirm')}>
              Xác nhận lịch
            </Button>
          )}
          {canAskAgain && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => open('reschedule')}>
              <CalendarX data-icon="inline-start" />
              Xin đổi lịch
            </Button>
          )}
        </div>
      )}
      <ConfirmActionDialog
        open={dialog === 'confirm'}
        onClose={close}
        title="Xác nhận lịch phỏng vấn?"
        description={`Bạn sẽ tham gia phỏng vấn lúc ${formatDateTime(interview.scheduledAt)}.`}
        actionLabel="Xác nhận lịch"
        pending={confirm.isPending}
        error={error}
        errorTitle="Chưa xác nhận được"
        onConfirm={() => {
          confirm.mutateAsync(rowVersion).then(
            () => {
              close();
              toast.success('Đã xác nhận lịch phỏng vấn');
            },
            (caught: unknown) => handleError(caught, setError, close),
          );
        }}
      />
      <ConfirmActionDialog
        open={dialog === 'reschedule'}
        onClose={close}
        title="Xin đổi lịch phỏng vấn?"
        description="Bạn chỉ được xin đổi lịch một lần. Doanh nghiệp sẽ đặt giờ mới."
        actionLabel="Gửi yêu cầu"
        pending={reschedule.isPending}
        error={error}
        errorTitle="Chưa gửi được yêu cầu"
        onConfirm={() => {
          setSubmitted(true);
          if (note.trim() === '') return;
          reschedule.mutateAsync({ rowVersion, note: note.trim() }).then(
            () => {
              close();
              toast.success('Đã gửi yêu cầu đổi lịch');
            },
            (caught: unknown) => handleError(caught, setError, close),
          );
        }}
      >
        <Field data-invalid={noteError !== undefined}>
          <FieldLabel htmlFor={`reschedule-${interview.interviewId}`}>Lý do</FieldLabel>
          <Textarea
            id={`reschedule-${interview.interviewId}`}
            value={note}
            maxLength={INTERVIEW_NOTE_MAX}
            disabled={reschedule.isPending}
            placeholder="Ví dụ: trùng lịch thi cuối kỳ, có thể phỏng vấn sau 15:00"
            aria-invalid={noteError !== undefined}
            onChange={(event) => setNote(event.target.value)}
          />
          {noteError ? <FieldError>{noteError}</FieldError> : <FieldDescription>Doanh nghiệp xem được lý do này.</FieldDescription>}
        </Field>
      </ConfirmActionDialog>
    </section>
  );
}

/** Time left, by the server's deadline: days ahead as words, the last hours as a ticking clock. */
function Countdown({ expiresAt }: { expiresAt: string }) {
  const now = useNow(1000);
  const left = Date.parse(expiresAt) - now;
  if (left <= 0) return <span className="text-destructive">Đã quá hạn trả lời</span>;
  return (
    <span role="timer" className="tabular-nums">
      Còn {left < 24 * HOUR ? formatCountdown(left) : formatRelative(expiresAt).replace(/ nữa$/, '')}
    </span>
  );
}

function OfferBlock({ offer, policy }: { offer: Offer; policy: OfferDeclinePolicy }) {
  const answer = useAnswerOffer(offer.offerId);
  const [dialog, setDialog] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowVersion, setRowVersion] = useState(offer.rowVersion);
  const close = () => {
    setDialog(null);
    setError(null);
  };
  const open = (next: 'accept' | 'decline') => {
    setRowVersion(offer.rowVersion);
    setDialog(next);
  };
  const run = (kind: 'accept' | 'decline') => {
    answer.mutateAsync({ answer: kind, rowVersion }).then(
      () => {
        close();
        toast.success(kind === 'accept' ? 'Đã nhận lời mời thực tập' : 'Đã từ chối lời mời');
      },
      (caught: unknown) => handleError(caught, setError, close),
    );
  };

  return (
    <section aria-label="Lời mời thực tập" className="flex flex-col gap-3">
      <span className="flex flex-wrap items-center gap-2">
        <MailCheck className="size-5 shrink-0" aria-hidden="true" />
        <h3 className="text-base font-medium">Lời mời thực tập</h3>
        <IconBadge style={OFFER_STATUS_STYLE[offer.status]}>{OFFER_STATUS_LABELS[offer.status]}</IconBadge>
      </span>
      {offer.status === 'PENDING' ? (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Hourglass className="size-4 shrink-0" aria-hidden="true" />
            <span>Hạn trả lời {formatDateTime(offer.expiresAt)}.</span>
            <Countdown expiresAt={offer.expiresAt} />
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="w-full sm:w-auto" onClick={() => open('accept')}>
              Nhận lời mời
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => open('decline')}>
              Từ chối
            </Button>
          </div>
        </>
      ) : (
        offer.respondedAt && <p className="text-sm text-muted-foreground">Lúc {formatDateTime(offer.respondedAt)}.</p>
      )}
      <ConfirmActionDialog
        open={dialog === 'accept'}
        onClose={close}
        title="Nhận lời mời thực tập?"
        description="Bạn sẽ có nơi thực tập. Mọi nguyện vọng khác của bạn trong đợt sẽ đóng lại và không được xét tiếp."
        actionLabel="Nhận lời mời"
        pending={answer.isPending}
        error={error}
        errorTitle="Chưa nhận được lời mời"
        onConfirm={() => run('accept')}
      />
      <ConfirmActionDialog
        open={dialog === 'decline'}
        onClose={close}
        title="Từ chối lời mời thực tập?"
        description={DECLINE_CONSEQUENCE[policy]}
        actionLabel="Từ chối lời mời"
        pending={answer.isPending}
        error={error}
        errorTitle="Chưa từ chối được"
        onConfirm={() => run('decline')}
      />
    </section>
  );
}

/**
 * GĐ9 on the student's result card (US-5.4 AC-12, NFR-13): the interview with "Xác nhận lịch" and
 * "Xin đổi lịch" (gone after the one request), and the offer with its deadline from the server,
 * "Nhận lời mời" and "Từ chối" (the dialog says what declining means, Q4). One column at 360 px.
 */
export function InterviewSection({ item }: { item: Item }) {
  if (!item.interview && !item.offer) return null;
  return (
    <div className="flex flex-col gap-6">
      <Separator />
      {item.interview && <InterviewBlock interview={item.interview} />}
      {item.offer && <OfferBlock offer={item.offer} policy={item.offerDeclinePolicy} />}
    </div>
  );
}
