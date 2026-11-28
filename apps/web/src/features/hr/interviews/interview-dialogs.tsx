import {
  INTERVIEW_MODE_LABELS,
  INTERVIEW_MODES,
  INTERVIEW_NOTE_MAX,
  INTERVIEW_RESULT_LABELS,
  INTERVIEW_RESULTS,
  INTERVIEW_LOCATION_MAX,
  type InterviewMode,
  type InterviewResult,
  InterviewSlotSchema,
  type JdSlots,
  type StaffInterviewView,
} from '@srm/shared';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { DeadlineField } from '@/features/center/campaigns/deadline-field';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDateTime } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { useRecordInterviewResult, useRescheduleInterview, useScheduleInterview } from './api';

interface SlotDialogProps {
  jdId: number;
  nominationId: number;
  studentName: string;
  /** Moving an interview; scheduling a new one when absent. */
  interview?: StaffInterviewView;
  onClose: () => void;
}

/**
 * "Tạo lịch" / "Đổi lịch" (US-5.4 AC-1, AC-2): time, mode and place or link. A form that can be
 * changed again, so a Sheet (DESIGN.md §6 › sheet): right from `md`, bottom on phones.
 */
export function InterviewSlotSheet({ jdId, nominationId, studentName, interview, onClose }: SlotDialogProps) {
  const isMobile = useIsMobile();
  const schedule = useScheduleInterview(jdId);
  const reschedule = useRescheduleInterview(jdId, interview?.interviewId ?? 0);
  const [scheduledAt, setScheduledAt] = useState<string | null>(interview?.scheduledAt ?? null);
  const [mode, setMode] = useState<InterviewMode>(interview?.mode ?? 'ONLINE');
  const [location, setLocation] = useState(interview?.location ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The version the sheet was opened with (LESSONS §25).
  const [rowVersion] = useState(interview?.rowVersion ?? 0);
  const [openedAt] = useState(() => Date.now());
  const pending = schedule.isPending || reschedule.isPending;
  const parsed = InterviewSlotSchema.safeParse({ scheduledAt, mode, location });
  const issueOf = (path: string) => (submitted && !parsed.success ? parsed.error.issues.find((issue) => issue.path[0] === path)?.message : undefined);
  // Checked against when the sheet opened; the API checks against its own clock again.
  const pastError = submitted && scheduledAt !== null && Date.parse(scheduledAt) <= openedAt ? 'Chọn thời gian sau thời điểm này' : undefined;
  const timeError = issueOf('scheduledAt') ?? pastError;
  const locationError = issueOf('location');
  const idPrefix = `interview-${nominationId}`;

  async function submit() {
    setSubmitted(true);
    if (!parsed.success || pastError) return;
    setError(null);
    try {
      if (interview) await reschedule.mutateAsync({ ...parsed.data, rowVersion });
      else await schedule.mutateAsync({ ...parsed.data, nominationId });
      onClose();
      toast.success(interview ? 'Đã đổi lịch phỏng vấn' : 'Đã tạo lịch phỏng vấn', {
        description: `${studentName}: ${formatDateTime(parsed.data.scheduledAt)}. Sinh viên được báo qua hệ thống.`,
      });
    } catch (caught) {
      // Another write came first: the version is stale, so close and show the new state (DESIGN.md §6).
      if (caught instanceof ApiRequestError && caught.status === 409) {
        onClose();
        toast.error(apiErrorMessage(caught));
        return;
      }
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && !pending && onClose()}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className={isMobile ? 'max-h-[90svh]' : 'md:max-w-lg'}>
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <SheetHeader>
            <SheetTitle className="break-words">{interview ? 'Đổi lịch phỏng vấn' : 'Tạo lịch phỏng vấn'}</SheetTitle>
            <SheetDescription className="break-words">
              {studentName}
              {interview ? `. Lịch hiện tại: ${formatDateTime(interview.scheduledAt)}. Sinh viên sẽ xác nhận lại lịch mới.` : '.'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4">
            {error && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Chưa lưu được lịch</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {interview?.status === 'RESCHEDULE_REQUESTED' && interview.rescheduleNote && (
              <Alert>
                <CircleAlert />
                <AlertTitle>Sinh viên xin đổi lịch</AlertTitle>
                <AlertDescription className="break-words whitespace-pre-wrap">{interview.rescheduleNote}</AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <Field data-invalid={timeError !== undefined}>
                <FieldLabel htmlFor={`${idPrefix}-time`}>Thời gian</FieldLabel>
                <DeadlineField
                  id={`${idPrefix}-time`}
                  label="thời gian phỏng vấn"
                  value={scheduledAt}
                  onChange={setScheduledAt}
                  invalid={timeError !== undefined}
                  disabled={pending}
                  notBefore={new Date(openedAt)}
                />
                {timeError ? <FieldError>{timeError}</FieldError> : <FieldDescription>Giờ theo múi giờ của máy.</FieldDescription>}
              </Field>
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-mode`}>Hình thức</FieldLabel>
                <Select value={mode} onValueChange={(value) => setMode(value as InterviewMode)} disabled={pending}>
                  <SelectTrigger id={`${idPrefix}-mode`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVIEW_MODES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {INTERVIEW_MODE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={locationError !== undefined}>
                <FieldLabel htmlFor={`${idPrefix}-location`}>{mode === 'ONLINE' ? 'Đường link phòng họp' : 'Địa điểm'}</FieldLabel>
                <Input
                  id={`${idPrefix}-location`}
                  value={location}
                  maxLength={INTERVIEW_LOCATION_MAX}
                  disabled={pending}
                  aria-invalid={locationError !== undefined}
                  placeholder={mode === 'ONLINE' ? 'https://…' : 'Ví dụ: Phòng 301, tòa nhà A'}
                  onChange={(event) => setLocation(event.target.value)}
                />
                {locationError && <FieldError>{locationError}</FieldError>}
              </Field>
            </FieldGroup>
          </div>
          <SheetFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {interview ? 'Lưu lịch mới' : 'Tạo lịch'}
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Hủy
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

interface ResultDialogProps {
  jdId: number;
  studentName: string;
  interview: StaffInterviewView;
  slots: JdSlots;
  onClose: () => void;
}

const RESULT_HINTS: Record<InterviewResult, string> = {
  PASSED: 'Sinh viên nhận lời mời thực tập và có hạn trả lời.',
  RESERVE: 'Đạt yêu cầu nhưng chờ suất trống; được lên Đạt khi có người từ chối.',
  FAILED: 'Sinh viên về hàng chờ với các nguyện vọng còn lại.',
  ABSENT: 'Vắng không báo trước, xử lý như Không đạt.',
};

/**
 * "Nhập kết quả" (US-5.4 AC-3, AC-4, BR-13): the result cannot be changed afterwards, so an
 * AlertDialog with the form inside (DESIGN.md §6 › alert-dialog). When the JD has no place left a
 * PASSED becomes RESERVE: the dialog says so before, and the toast after.
 */
export function InterviewResultDialog({ jdId, studentName, interview, slots, onClose }: ResultDialogProps) {
  const record = useRecordInterviewResult(jdId, interview.interviewId);
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowVersion] = useState(interview.rowVersion);
  const pending = record.isPending;
  const placesLeft = Math.max(0, slots.quota - slots.accepted - slots.passed);
  const resultError = submitted && result === null ? 'Chọn kết quả phỏng vấn' : undefined;
  const idPrefix = `result-${interview.interviewId}`;

  async function submit() {
    setSubmitted(true);
    if (result === null) return;
    setError(null);
    try {
      const response = await record.mutateAsync({ result, note: note.trim() === '' ? null : note.trim(), rowVersion });
      onClose();
      if (response.reservedForQuota) {
        toast.warning('Đã hết suất, chuyển Dự bị', {
          description: `${studentName} vào danh sách dự bị và được lên Đạt khi có suất trống.`,
        });
      } else if (response.nominationStatus === 'CLOSED') {
        toast.info('JD đã nhận đủ chỉ tiêu', { description: `Hồ sơ dự bị của ${studentName} đóng lại.` });
      } else {
        toast.success('Đã lưu kết quả phỏng vấn', { description: `${studentName}: ${INTERVIEW_RESULT_LABELS[result]}.` });
      }
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 409) {
        onClose();
        toast.error(apiErrorMessage(caught));
        return;
      }
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">Kết quả phỏng vấn của {studentName}</AlertDialogTitle>
            <AlertDialogDescription>
              Kết quả không sửa được sau khi lưu. JD còn {placesLeft} suất chưa có người nhận hoặc chờ trả lời.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa lưu được kết quả</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <FieldSet data-invalid={resultError !== undefined}>
              <FieldLegend variant="label">Kết quả</FieldLegend>
              <RadioGroup value={result ?? ''} onValueChange={(value) => setResult(value as InterviewResult)} aria-invalid={resultError !== undefined}>
                {INTERVIEW_RESULTS.map((value) => {
                  // BR-14 (CONTEXT D66): Dự bị only once no place is left; the server checks it again.
                  const unavailable = value === 'RESERVE' && placesLeft > 0;
                  return (
                    <FieldLabel key={value} htmlFor={`${idPrefix}-${value}`}>
                      <Field orientation="horizontal" data-disabled={unavailable || undefined}>
                        <RadioGroupItem value={value} id={`${idPrefix}-${value}`} disabled={pending || unavailable} />
                        <FieldContent>
                          <FieldTitle>{INTERVIEW_RESULT_LABELS[value]}</FieldTitle>
                          <FieldDescription>
                            {value === 'PASSED' && placesLeft === 0
                              ? 'JD đã hết suất: hồ sơ sẽ chuyển Dự bị.'
                              : unavailable
                                ? 'JD còn suất trống: sinh viên đạt yêu cầu thì chọn Đạt để gửi lời mời.'
                                : RESULT_HINTS[value]}
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    </FieldLabel>
                  );
                })}
              </RadioGroup>
              {resultError && <FieldError>{resultError}</FieldError>}
            </FieldSet>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-note`}>Nhận xét</FieldLabel>
              <Textarea
                id={`${idPrefix}-note`}
                value={note}
                maxLength={INTERVIEW_NOTE_MAX}
                disabled={pending}
                onChange={(event) => setNote(event.target.value)}
              />
              <FieldDescription>Chỉ HR và Trung tâm xem được.</FieldDescription>
            </Field>
          </FieldGroup>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Quay lại
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Lưu kết quả
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
