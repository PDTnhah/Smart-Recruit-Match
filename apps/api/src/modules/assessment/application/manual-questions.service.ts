import { Inject, Injectable } from '@nestjs/common';
import {
  cellRoom,
  EXAM_PART_OF_TYPE,
  type JobDescription,
  type ManualQuestion,
  type ManualQuestionList,
  QUESTION_BANK_JD_STATES,
  type QuestionImportFormat,
  type QuestionImportPreview,
  type SaveManualQuestionsRequest,
  type SaveManualQuestionsResult,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import {
  EntityNotFoundError,
  JdNotApprovedError,
  ManualQuestionsInvalidError,
  QuestionBankJdOutdatedError,
  QuestionBankLockedError,
  QuestionGenerationRunningError,
  QuestionImportFileInvalidError,
} from '../../../common/errors/index.js';
import { displayFileName, type UploadedFileLike } from '../../../common/storage/upload-validation.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { UserDirectory } from '../../iam/index.js';
import { ASSESSMENT_AUDIT_ACTIONS, QUESTION_BANK_ENTITY } from '../domain/audit-actions.js';
import { coverageOf } from '../domain/blueprint.js';
import { importColumnOf, planManualQuestions, readImportSheet } from '../domain/manual-questions.js';
import {
  type QuestionBankRecord,
  QuestionBanksRepository,
  type QuestionRecord,
} from '../infrastructure/question-banks.repository.js';
import {
  buildImportTemplate,
  IMPORT_CONTENT_TYPES,
  ImportFileError,
  readQuestionFile,
} from '../infrastructure/question-import-file.js';
import { QuestionBankService } from './question-bank.service.js';

export interface ImportTemplate {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

/**
 * Questions CENTER and HR add by hand to a JD's bank, from the form or a file (FR-42, US-4.13,
 * CONTEXT D62). CENTER for every JD, HR for the JDs of its company: a JD of another company answers
 * 404 like a missing one (BR-11), through `JdService.get`. A question added by hand is DRAFT,
 * usable at once, and passes the rules of the Test Generator's drafts (`planManualQuestions`). A
 * file is previewed first, nothing saved; a save is checked again from scratch under the bank's
 * locks, and keeps every question or none.
 */
@Injectable()
export class ManualQuestionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jds: JdService,
    private readonly campaigns: CampaignService,
    private readonly banks: QuestionBanksRepository,
    private readonly questionBanks: QuestionBankService,
    private readonly users: UserDirectory,
    private readonly audit: AuditService,
  ) {}

  /**
   * AC-3: `GET /api/jds/{id}/question-bank/import-template`. The `.xlsx` lists the blueprint's
   * cells with the usable questions each holds; reading never makes the bank.
   */
  async template(user: AuthUser, jdId: number, format: QuestionImportFormat): Promise<ImportTemplate> {
    await this.requireJd(user, jdId);
    const bank = await this.banks.findByJd(jdId);
    const cells = bank ? coverageOf(bank.blueprint, await this.banks.countQuestions(bank.id)) : [];
    return {
      buffer: await buildImportTemplate(format, cells),
      fileName: `mau-cau-hoi-jd-${jdId}.${format}`,
      contentType: IMPORT_CONTENT_TYPES[format],
    };
  }

  /**
   * AC-4: `POST /api/jds/{id}/question-bank/import/preview`. Every row of the file as a question,
   * with every problem at its column: the schema's, then the bank's rules for the rows that parse.
   * Nothing is saved. A file refused as a whole is 400 QUESTION_IMPORT_FILE_INVALID; a locked bank,
   * an outdated blueprint or a closed campaign 409, as a save would be.
   */
  async preview(user: AuthUser, jdId: number, file: UploadedFileLike): Promise<QuestionImportPreview> {
    await this.requireJd(user, jdId);
    let rows;
    try {
      rows = await readQuestionFile(file.buffer);
    } catch (error) {
      if (error instanceof ImportFileError) throw new QuestionImportFileInvalidError(error.reason);
      throw error;
    }
    const sheet = readImportSheet(rows);
    if (!sheet.ok) {
      throw new QuestionImportFileInvalidError(sheet.error, sheet.columns ? { columns: sheet.columns } : {});
    }

    const { bank, existing } = await this.db.transaction(async (tx) => {
      const found = await this.openBank(tx, user, jdId);
      return { bank: found, existing: await this.banks.questionStems(tx, found.id) };
    });
    const parsed = sheet.rows.flatMap((row) => (row.question ? [{ row, question: row.question }] : []));
    const plan = planManualQuestions(
      parsed.map((entry) => entry.question),
      { blueprint: bank.blueprint, existing },
      (index) => `dòng ${parsed[index]?.row.row ?? index + 1}`,
    );
    for (const issue of plan.issues) {
      parsed[issue.index]?.row.issues.push({ column: importColumnOf(issue.field), code: issue.code, message: issue.message });
    }
    return { jdId, fileName: displayFileName(file.originalname, 'xlsx'), rows: sheet.rows };
  }

  /**
   * AC-1, AC-5, AC-6: `POST /api/jds/{id}/question-bank/questions`. Under the QUESTION_BANK lock of
   * the JD (the bank is made on first use, as for a run) and the bank's row lock, 409 in this
   * order: the campaign is closed or cancelled, the bank is LOCKED, the blueprint predates the JD's
   * requirements, a run is RUNNING. Then every
   * rule again (AC-2): one question breaking one, and none is saved (400 with every issue). The
   * questions are written DRAFT, with one audit entry for the save.
   */
  async save(user: AuthUser, jdId: number, body: SaveManualQuestionsRequest): Promise<SaveManualQuestionsResult> {
    await this.requireJd(user, jdId);
    return this.db.transaction(async (tx) => {
      const bank = await this.openBank(tx, user, jdId);
      const running = await this.questionBanks.runningRun(tx, bank.id);
      if (running) throw new QuestionGenerationRunningError(bank.id, running.id);
      const plan = planManualQuestions(body.questions, {
        blueprint: bank.blueprint,
        existing: await this.banks.questionStems(tx, bank.id),
      });
      if (plan.issues.length > 0) throw new ManualQuestionsInvalidError(plan.issues);
      const questionIds = await this.banks.insertManualQuestions(
        tx,
        bank.id,
        user.userId,
        plan.rows.map((entry) => entry.row),
      );
      await this.audit.record(tx, {
        actor: userActor(user),
        action: ASSESSMENT_AUDIT_ACTIONS.QUESTIONS_ADDED_MANUALLY,
        entity: QUESTION_BANK_ENTITY,
        entityId: bank.id,
        after: {
          origin: body.origin,
          fileName: body.fileName ? displayFileName(body.fileName, 'xlsx') : null,
          count: questionIds.length,
          questionIds,
        },
      });
      return { bankId: bank.id, questionIds };
    });
  }

  /**
   * AC-7: `GET /api/jds/{id}/question-bank/manual-questions`. The questions HR of the JD's company
   * added, whatever their status, with CENTER's rejection: only HR of that company can add to the
   * JD's bank, so they are those whose author is an HR account. Never the AI's, nor CENTER's
   * (CONTEXT D62). Read in one snapshot.
   */
  async listOfCompany(user: AuthUser, jdId: number): Promise<ManualQuestionList> {
    const jd = await this.requireJd(user, jdId);
    const { bank, rows, counts } = await this.db.transaction(
      async (tx) => {
        const found = await this.banks.findByJd(jdId, tx);
        if (!found) return { bank: undefined, rows: [], counts: [] };
        const [manual, tally] = await Promise.all([
          this.banks.manualQuestions(found.id, tx),
          this.banks.countQuestions(found.id, tx),
        ]);
        return { bank: found, rows: manual, counts: tally };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    if (!bank) return { jdId, bank: null, cells: [], questions: [] };
    const authorIds = [...new Set(rows.flatMap((row) => (row.createdBy === null ? [] : [row.createdBy])))];
    const hr = new Map(
      (await this.users.findContacts(authorIds))
        .filter((contact) => contact.role === 'HR')
        .map((contact) => [contact.id, contact.fullName ?? contact.email]),
    );
    return {
      jdId,
      bank: { id: bank.id, status: bank.status, version: bank.version, jdOutdated: bank.jdVersion < jd.version },
      cells: coverageOf(bank.blueprint, counts).map((cell) => ({
        type: cell.type,
        skill: cell.skill,
        difficulty: cell.difficulty,
        usable: cell.usable,
        room: cellRoom(cell),
      })),
      questions: rows.flatMap((row) => {
        const name = row.createdBy === null ? undefined : hr.get(row.createdBy);
        return name === undefined || row.createdBy === null ? [] : [manualQuestionView(row, { id: row.createdBy, name })];
      }),
    };
  }

  /** The JD if the caller may add to its bank: 404 outside the caller's scope (BR-11), 409 before approval. */
  private async requireJd(user: AuthUser, jdId: number): Promise<JobDescription> {
    const jd = await this.jds.get(user, jdId);
    if (!QUESTION_BANK_JD_STATES.includes(jd.status)) throw new JdNotApprovedError(jdId, jd.status);
    return jd;
  }

  /**
   * The JD's bank under the QUESTION_BANK lock and its row lock, made on first use: 409 when the
   * campaign is closed or cancelled (US-1.10), the bank is LOCKED (AC-6, D50), or the JD's
   * requirements are newer than the blueprint: its cells may hold a skill the JD dropped, so a
   * question goes in only once the blueprint is saved again, as for a run (US-4.2 AC-11).
   */
  private async openBank(tx: DbTx, user: AuthUser, jdId: number): Promise<QuestionBankRecord> {
    const jd = await this.questionBanks.requireBankJd(jdId);
    await this.campaigns.assertNotFinal(jd.campaignId, { tx });
    const found = await this.questionBanks.lockBank(tx, jd, userActor(user));
    const bank = await this.banks.lock(tx, found.id);
    if (!bank) throw new EntityNotFoundError(QUESTION_BANK_ENTITY, found.id);
    if (bank.status === 'LOCKED') throw new QuestionBankLockedError(bank.id);
    if (bank.jdVersion < jd.jdVersion) throw new QuestionBankJdOutdatedError(bank.id, bank.jdVersion, jd.jdVersion);
    return bank;
  }
}

function manualQuestionView(row: QuestionRecord, author: { id: number; name: string }): ManualQuestion {
  return {
    id: row.id,
    rowVersion: row.rowVersion,
    status: row.status,
    part: EXAM_PART_OF_TYPE[row.type],
    type: row.type,
    skill: row.skill,
    difficulty: row.difficulty,
    stem: row.content.stem,
    options: row.content.options,
    correctOption: row.answerKey.correct_option,
    explanation: row.answerKey.explanation,
    sampleAnswer: row.answerKey.sample_answer,
    rubric: row.rubric,
    createdBy: { ...author, role: 'HR' },
    createdAt: row.createdAt.toISOString(),
    rejection: row.manualRejection
      ? { reason: row.manualRejection.reason, note: row.manualRejection.note, rejectedAt: row.manualRejection.rejected_at }
      : null,
  };
}
