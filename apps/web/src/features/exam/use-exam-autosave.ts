import {
  EXAM_SAVE_MAX_ANSWERS,
  type ExamAnswerValue,
  ExamAnswerValueSchema,
  type ExamSavedAnswer,
  type SaveExamAnswersResult,
} from '@srm/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { saveExamAnswers, type Timed } from './api';

// Autosave of the exam room (US-4.3 AC-13, NFR-10, CONTEXT D51). Every change waits in a queue,
// copied to localStorage so a reload or a crash keeps it, and goes to `PUT .../answers` 1.5 s after
// the last change, at least every 30 s, when the network comes back and when the tab is hidden.
// Changes made while a request runs wait for their own quiet time, so a student typing without a
// pause sends about two requests a minute and never more than ~42, under the API's 120 (AC-12).
// Only the flush before the submit sends on until nothing waits.

/** A change waiting for the server: the new answer, or null when the student cleared it. */
export type AnswerChange = ExamAnswerValue | null;

/** OFFLINE: no network; RETRYING: the server failed; CLOSED: the server takes no more answers. */
export type SaveStatus = 'SAVED' | 'SAVING' | 'OFFLINE' | 'RETRYING' | 'CLOSED';

/** FAILED: changes are still waiting (no network or a server error). */
export type FlushOutcome = 'SAVED' | 'CLOSED' | 'FAILED';

/** Quiet time after the last change before it is sent. */
const DEBOUNCE_MS = 1_500;

/** Changes still waiting are sent at least this often. */
const PERIOD_MS = 30_000;

/**
 * A request body stays well under the API's 100 KB JSON limit: a UTF-16 unit of an essay is at most
 * 3 bytes of UTF-8, plus room for the field names. A single essay always fits (5000 units).
 */
const BATCH_BYTES = 80_000;

/** The next request: at most EXAM_SAVE_MAX_ANSWERS answers, and at most BATCH_BYTES. */
function nextBatch(pending: ReadonlyMap<number, AnswerChange>): [number, AnswerChange][] {
  const batch: [number, AnswerChange][] = [];
  let bytes = 0;
  for (const entry of pending) {
    const answer = entry[1];
    const size = 64 + 3 * (answer && 'text' in answer ? answer.text.length : 16);
    if (batch.length > 0 && (batch.length === EXAM_SAVE_MAX_ANSWERS || bytes + size > BATCH_BYTES)) break;
    batch.push(entry);
    bytes += size;
  }
  return batch;
}

const PendingSchema = z.array(z.tuple([z.number().int().positive(), ExamAnswerValueSchema.nullable()]));

const storageKey = (sessionId: number) => `srm.exam.${sessionId}.pending`;

/** The changes of the session not saved yet when the room last closed; empty when storage fails. */
function readPending(sessionId: number): Map<number, AnswerChange> {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    const parsed = raw === null ? null : PendingSchema.safeParse(JSON.parse(raw));
    return new Map(parsed?.success ? parsed.data : []);
  } catch {
    return new Map();
  }
}

/** Storage may be full or blocked (private mode): the queue in memory still works. */
function writePending(sessionId: number, pending: ReadonlyMap<number, AnswerChange>): void {
  try {
    if (pending.size === 0) localStorage.removeItem(storageKey(sessionId));
    else localStorage.setItem(storageKey(sessionId), JSON.stringify([...pending]));
  } catch {
    // Kept in memory only.
  }
}

/** Whether the server keeps the answer at the submit: an essay of blanks only is no answer. */
export function isAnswered(answer: ExamAnswerValue | undefined): boolean {
  if (!answer) return false;
  return 'optionCode' in answer || answer.text.trim() !== '';
}

function answersWith(
  held: ReadonlyMap<number, ExamAnswerValue>,
  changes: ReadonlyMap<number, AnswerChange>,
): Map<number, ExamAnswerValue> {
  const answers = new Map(held);
  for (const [questionId, change] of changes) {
    if (change) answers.set(questionId, change);
    else answers.delete(questionId);
  }
  return answers;
}

/** Question ids of a 422 EXAM_ANSWER_INVALID. */
function invalidQuestionIds(error: ApiRequestError): number[] {
  const ids = error.body?.details?.questionIds;
  return Array.isArray(ids) ? ids.filter((id): id is number => typeof id === 'number') : [];
}

interface AutosaveOptions {
  sessionId: number;
  /** The answers the server held when the paper was read. */
  saved: readonly ExamSavedAnswer[];
  /** Each save brings the server's clock back. */
  onSaved: (result: Timed<SaveExamAnswersResult>) => void;
  /** The server refused a save because the session is closed (submitted, or past its deadline). */
  onClosed: () => void;
}

export interface ExamAutosave {
  /** The answers shown: those the server holds with the changes still waiting on top. */
  answers: ReadonlyMap<number, ExamAnswerValue>;
  status: SaveStatus;
  setAnswer: (questionId: number, answer: AnswerChange) => void;
  /** Waits for a request under way, then sends every change still waiting. */
  flush: () => Promise<FlushOutcome>;
  /** Whether changes are waiting; for event handlers, not for rendering. */
  hasPending: () => boolean;
  /** After the submit: no more saves, and nothing kept in storage. */
  stop: () => void;
}

export function useExamAutosave({ sessionId, saved, onSaved, onClosed }: AutosaveOptions): ExamAutosave {
  const [restored] = useState(() => readPending(sessionId));
  const [held] = useState(() => new Map(saved.map((item) => [item.questionId, item.answer])));
  const [answers, setAnswers] = useState(() => answersWith(held, restored));
  const [status, setStatus] = useState<SaveStatus>(restored.size > 0 ? 'SAVING' : 'SAVED');
  const pending = useRef(restored);
  // What the server holds, as far as its replies tell.
  const confirmed = useRef(held);
  const running = useRef<Promise<FlushOutcome> | null>(null);
  const stopped = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handlers = useRef({ onSaved, onClosed });
  useEffect(() => {
    handlers.current = { onSaved, onClosed };
  });

  const stop = useCallback(() => {
    stopped.current = true;
    clearTimeout(debounce.current);
    pending.current.clear();
    writePending(sessionId, pending.current);
  }, [sessionId]);

  /**
   * One request at a time (`nextBatch`). `untilEmpty` also sends what changed while a request ran;
   * otherwise it goes on only while a request could not take everything waiting.
   */
  const send = useCallback(
    async (untilEmpty: boolean): Promise<FlushOutcome> => {
      let more = true;
      while (more && pending.current.size > 0 && !stopped.current) {
        const batch = nextBatch(pending.current);
        const cut = batch.length < pending.current.size;
        setStatus('SAVING');
        try {
          const result = await saveExamAnswers(sessionId, {
            answers: batch.map(([questionId, answer]) => ({ questionId, answer })),
          });
          for (const [questionId, answer] of batch) {
            if (answer) confirmed.current.set(questionId, answer);
            else confirmed.current.delete(questionId);
            // A change made while the request ran stays waiting.
            if (pending.current.get(questionId) === answer) pending.current.delete(questionId);
          }
          writePending(sessionId, pending.current);
          handlers.current.onSaved(result);
          more = untilEmpty || cut;
        } catch (error) {
          const code = error instanceof ApiRequestError ? error.body?.code : undefined;
          if (code === 'EXAM_CLOSED') {
            stop();
            setStatus('CLOSED');
            handlers.current.onClosed();
            return 'CLOSED';
          }
          if (error instanceof ApiRequestError && code === 'EXAM_ANSWER_INVALID') {
            // The server will never take these: show what it holds instead and save the rest.
            const listed = new Set(invalidQuestionIds(error));
            const refused = batch.some(([questionId]) => listed.has(questionId))
              ? batch.filter(([questionId]) => listed.has(questionId))
              : batch;
            const reverted: number[] = [];
            for (const [questionId, answer] of refused) {
              // Changed again meanwhile: the newer answer goes in the next turn.
              if (pending.current.get(questionId) !== answer) continue;
              pending.current.delete(questionId);
              reverted.push(questionId);
            }
            writePending(sessionId, pending.current);
            setAnswers((current) => {
              const next = new Map(current);
              for (const questionId of reverted) {
                const kept = confirmed.current.get(questionId);
                if (kept) next.set(questionId, kept);
                else next.delete(questionId);
              }
              return next;
            });
            toast.error(apiErrorMessage(error));
            continue;
          }
          setStatus(error instanceof TypeError || !navigator.onLine ? 'OFFLINE' : 'RETRYING');
          return 'FAILED';
        }
      }
      if (stopped.current) return 'CLOSED';
      if (pending.current.size === 0) setStatus('SAVED');
      return 'SAVED';
    },
    [sessionId, stop],
  );

  // The automatic turns (debounce, period, network back, tab hidden) start a run only when none is
  // going. The timer that re-arms the debounce calls the latest one.
  const autoSave = useRef<() => void>(() => undefined);
  const arm = useCallback(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => autoSave.current(), DEBOUNCE_MS);
  }, []);

  const run = useCallback(
    (untilEmpty: boolean): Promise<FlushOutcome> => {
      clearTimeout(debounce.current);
      const previous = running.current;
      if (previous && !untilEmpty) return previous;
      const next: Promise<FlushOutcome> = (previous ?? Promise.resolve<FlushOutcome>('SAVED'))
        .then((outcome) => (outcome === 'CLOSED' ? outcome : send(untilEmpty)))
        .then((outcome) => {
          // Changes made while the request ran get their own quiet time.
          if (outcome === 'SAVED' && pending.current.size > 0) arm();
          return outcome;
        })
        .finally(() => {
          if (running.current === next) running.current = null;
        });
      running.current = next;
      return next;
    },
    [send, arm],
  );

  useEffect(() => {
    autoSave.current = () => {
      if (pending.current.size > 0) void run(false);
    };
  }, [run]);

  const flush = useCallback(() => run(true), [run]);

  const setAnswer = useCallback(
    (questionId: number, answer: AnswerChange) => {
      if (stopped.current) return;
      setAnswers((current) => {
        const next = new Map(current);
        if (answer) next.set(questionId, answer);
        else next.delete(questionId);
        return next;
      });
      pending.current.set(questionId, answer);
      writePending(sessionId, pending.current);
      setStatus(navigator.onLine ? 'SAVING' : 'OFFLINE');
      arm();
    },
    [sessionId, arm],
  );

  useEffect(() => {
    const saveNow = () => autoSave.current();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveNow();
    };
    const onOffline = () => {
      if (pending.current.size > 0) setStatus('OFFLINE');
    };
    // Changes kept from an earlier visit go first.
    const first = setTimeout(saveNow, 0);
    const timer = setInterval(saveNow, PERIOD_MS);
    window.addEventListener('online', saveNow);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener('online', saveNow);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
      // Leaving the room: one last try; what fails stays in storage for the next visit.
      saveNow();
    };
  }, []);

  const hasPending = useCallback(() => pending.current.size > 0, []);

  return { answers, status, setAnswer, flush, hasPending, stop };
}
