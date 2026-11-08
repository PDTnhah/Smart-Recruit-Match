import { Inject, Injectable } from '@nestjs/common';
import type { ExamAnswerValue, ExamOptionLayout } from '@srm/shared';
import type { Redis } from 'ioredis';
import { REDIS } from '../../../redis/redis.module.js';

// Answers of open exam sessions live in Redis until the session closes (ARCHITECTURE › Redis,
// US-4.3 AC-6, AC-8, CONTEXT D51). Two hashes per session:
//
//   exam:{id}:session  student, deadline (ms), closed ('0' | '1'), and one field `q:{questionId}`
//                      per question: '*' for an essay, the comma-separated option codes of an MCQ.
//   exam:{id}:answers  `{questionId}` → 'C:{optionCode}' or 'T:{essay text}'.
//
// Each operation is one Lua script, so a check and the write it allows are one atomic step. Expiries
// are relative (PEXPIRE), computed from `Clock`: Redis counts in real time, the tests in fake time.

export const examSessionKey = (sessionId: number) => `exam:${sessionId}:session`;
export const examAnswersKey = (sessionId: number) => `exam:${sessionId}:answers`;

/** Keys outlive the deadline by a day, for a sweep that runs late; then Redis drops them. */
const KEEP_AFTER_DEADLINE_MS = 86_400_000;

/** A closed session keeps its `closed` mark an hour, so a late save is refused without PostgreSQL. */
const KEEP_AFTER_CLOSE_MS = 3_600_000;

const ESSAY_SPEC = '*';

/**
 * ARGV: student id, now (ms), grace (ms), then one triple per answer: question id, kind ('C' code,
 * 'T' text, 'D' delete), value. Returns {'OK', deadline} or the reason it refused: MISSING (no
 * session key), NOT_OWNER, CLOSED, DEADLINE_PASSED, or INVALID followed by the question ids.
 */
const SAVE_SCRIPT = `
local meta = redis.call('HMGET', KEYS[1], 'student', 'deadline', 'closed')
if not meta[1] then return {'MISSING'} end
if meta[1] ~= ARGV[1] then return {'NOT_OWNER'} end
if meta[3] == '1' then return {'CLOSED'} end
if tonumber(ARGV[2]) > tonumber(meta[2]) + tonumber(ARGV[3]) then return {'DEADLINE_PASSED'} end
local invalid = {}
for i = 4, #ARGV, 3 do
  local spec = redis.call('HGET', KEYS[1], 'q:' .. ARGV[i])
  local kind = ARGV[i + 1]
  local ok = false
  if spec then
    if kind == 'D' then
      ok = true
    elseif kind == 'T' then
      ok = spec == '${ESSAY_SPEC}'
    elseif kind == 'C' and spec ~= '${ESSAY_SPEC}' then
      for code in string.gmatch(spec, '[^,]+') do
        if code == ARGV[i + 2] then ok = true break end
      end
    end
  end
  if not ok then invalid[#invalid + 1] = ARGV[i] end
end
if #invalid > 0 then
  table.insert(invalid, 1, 'INVALID')
  return invalid
end
for i = 4, #ARGV, 3 do
  if ARGV[i + 1] == 'D' then
    redis.call('HDEL', KEYS[2], ARGV[i])
  else
    redis.call('HSET', KEYS[2], ARGV[i], ARGV[i + 1] .. ':' .. ARGV[i + 2])
  end
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl > 0 and redis.call('EXISTS', KEYS[2]) == 1 then redis.call('PEXPIRE', KEYS[2], ttl) end
return {'OK', meta[2]}
`;

/**
 * Marks the session closed, then reads its answers: no save can land after this snapshot.
 * Returns nil when the session key is missing.
 */
const CLOSE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
redis.call('HSET', KEYS[1], 'closed', '1')
return redis.call('HGETALL', KEYS[2])
`;

/**
 * Writes the session hash only when it is missing, so a rebuild never reopens a session another
 * request has closed meanwhile. ARGV: time to live (ms), then field/value pairs. Returns 1 if written.
 */
const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], unpack(ARGV, 2))
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return 1
`;

/** Takes saves again; a missing key stays missing, so the next save rebuilds it whole. */
const REOPEN_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('HSET', KEYS[1], 'closed', '0')
return 1
`;

type ExamRedis = Redis & {
  examSaveAnswers(sessionKey: string, answersKey: string, ...args: string[]): Promise<string[]>;
  examCloseAndRead(sessionKey: string, answersKey: string): Promise<string[] | null>;
  examCreateSession(sessionKey: string, ...args: string[]): Promise<number>;
  examReopen(sessionKey: string): Promise<number>;
};

/** What Redis needs of a session, as PostgreSQL holds it. */
export interface StoredSessionShape {
  id: number;
  studentId: number;
  deadlineAt: Date;
  questionIds: readonly number[];
  optionLayout: ExamOptionLayout;
}

/** An answer to write, or `null` to clear the question's answer. */
export interface AnswerChange {
  questionId: number;
  answer: ExamAnswerValue | null;
}

export type SaveOutcome =
  | { kind: 'OK'; deadlineAt: Date }
  | { kind: 'MISSING' | 'NOT_OWNER' | 'CLOSED' | 'DEADLINE_PASSED' }
  | { kind: 'INVALID'; questionIds: number[] };

/** `exam:{id}:session` and `exam:{id}:answers` (US-4.3, CONTEXT D51). */
@Injectable()
export class ExamAnswerStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    if (!('examSaveAnswers' in redis)) {
      redis.defineCommand('examSaveAnswers', { numberOfKeys: 2, lua: SAVE_SCRIPT });
      redis.defineCommand('examCloseAndRead', { numberOfKeys: 2, lua: CLOSE_SCRIPT });
      redis.defineCommand('examCreateSession', { numberOfKeys: 1, lua: CREATE_SCRIPT });
      redis.defineCommand('examReopen', { numberOfKeys: 1, lua: REOPEN_SCRIPT });
    }
  }

  private get commands(): ExamRedis {
    return this.redis as ExamRedis;
  }

  /**
   * The session hash, when it is missing: after the start commits, or rebuilt from PostgreSQL once
   * Redis lost it. Answers saved before a loss are gone (CONTEXT D51); the session itself goes on.
   */
  async create(session: StoredSessionShape, now: Date, options: { closed: boolean }): Promise<boolean> {
    const fields: string[] = [
      'student',
      String(session.studentId),
      'deadline',
      String(session.deadlineAt.getTime()),
      'closed',
      options.closed ? '1' : '0',
    ];
    for (const questionId of session.questionIds) {
      const slots = session.optionLayout[String(questionId)];
      fields.push(`q:${questionId}`, slots ? slots.map((slot) => slot.code).join(',') : ESSAY_SPEC);
    }
    const ttl = options.closed
      ? KEEP_AFTER_CLOSE_MS
      : Math.max(0, session.deadlineAt.getTime() - now.getTime()) + KEEP_AFTER_DEADLINE_MS;
    return (await this.commands.examCreateSession(examSessionKey(session.id), String(ttl), ...fields)) === 1;
  }

  /** AC-6: checks and writes in one script; the server's `now` decides the deadline. */
  async save(
    sessionId: number,
    studentId: number,
    now: Date,
    graceMs: number,
    changes: readonly AnswerChange[],
  ): Promise<SaveOutcome> {
    const args = [String(studentId), String(now.getTime()), String(graceMs)];
    for (const { questionId, answer } of changes) {
      if (answer === null) args.push(String(questionId), 'D', '');
      else if ('optionCode' in answer) args.push(String(questionId), 'C', answer.optionCode);
      else args.push(String(questionId), 'T', answer.text);
    }
    const [kind, ...rest] = await this.commands.examSaveAnswers(examSessionKey(sessionId), examAnswersKey(sessionId), ...args);
    switch (kind) {
      case 'OK':
        return { kind, deadlineAt: new Date(Number(rest[0])) };
      case 'INVALID':
        return { kind, questionIds: rest.map(Number) };
      case 'MISSING':
      case 'NOT_OWNER':
      case 'CLOSED':
      case 'DEADLINE_PASSED':
        return { kind };
      default:
        throw new Error(`examSaveAnswers: unexpected reply ${String(kind)}`);
    }
  }

  /** The answers saved so far, by question id. */
  async read(sessionId: number): Promise<Map<number, ExamAnswerValue>> {
    return answersOf(await this.redis.hgetall(examAnswersKey(sessionId)));
  }

  /** AC-8: closes the session to saves, then reads its answers; null when Redis lost the session. */
  async closeAndRead(sessionId: number): Promise<Map<number, ExamAnswerValue> | null> {
    const reply = await this.commands.examCloseAndRead(examSessionKey(sessionId), examAnswersKey(sessionId));
    if (reply === null) return null;
    const flat: Record<string, string> = {};
    for (let i = 0; i + 1 < reply.length; i += 2) flat[reply[i] as string] = reply[i + 1] as string;
    return answersOf(flat);
  }

  /** The close that `closeAndRead` began did not commit: the session takes saves again. */
  async reopen(sessionId: number): Promise<void> {
    await this.commands.examReopen(examSessionKey(sessionId));
  }

  /** The answers are in PostgreSQL now; the keys stay an hour to refuse late saves quickly. */
  async expireAfterClose(sessionId: number): Promise<void> {
    await this.redis
      .multi()
      .pexpire(examSessionKey(sessionId), KEEP_AFTER_CLOSE_MS)
      .pexpire(examAnswersKey(sessionId), KEEP_AFTER_CLOSE_MS)
      .exec();
  }
}

function answersOf(stored: Record<string, string>): Map<number, ExamAnswerValue> {
  const answers = new Map<number, ExamAnswerValue>();
  for (const [field, value] of Object.entries(stored)) {
    const questionId = Number(field);
    if (!Number.isSafeInteger(questionId)) continue;
    if (value.startsWith('C:')) answers.set(questionId, { optionCode: value.slice(2) });
    else if (value.startsWith('T:')) answers.set(questionId, { text: value.slice(2) });
  }
  return answers;
}
