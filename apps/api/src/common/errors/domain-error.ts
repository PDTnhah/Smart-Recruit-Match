import type { ApiErrorCode, MissingCell, PreferenceRejectionCode } from '@srm/shared';

// Plain classes without NestJS imports, so domain/ code may throw them too.
// ApiExceptionFilter (or DomainErrorFilter) turns them into `{ code, message, details }` responses.

export abstract class DomainError extends Error {
  abstract readonly code: ApiErrorCode;
  abstract readonly httpStatus: number;

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The state table has no edge from the current state to the requested one (AD-8). */
export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION';
  readonly httpStatus = 422;

  constructor(entity: string, from: string, to: string) {
    super(`${entity}: transition ${from} -> ${to} is not allowed`, { entity, from, to });
  }
}

/** The edge exists but a business condition (guard) does not hold; `reasonCode` says which. */
export class TransitionConditionFailedError extends DomainError {
  readonly code = 'TRANSITION_CONDITION_FAILED';
  readonly httpStatus = 422;

  constructor(entity: string, from: string, to: string, reasonCode: string, message?: string) {
    super(message ?? `${entity}: condition ${reasonCode} not met for ${from} -> ${to}`, {
      entity,
      from,
      to,
      reasonCode,
    });
  }
}

/** Someone else changed the row since the caller read it (optimistic lock on row_version). */
export class RowVersionConflictError extends DomainError {
  readonly code = 'ROW_VERSION_CONFLICT';
  readonly httpStatus = 409;

  constructor(entity: string, id: number, expected: number, actual?: number) {
    super(`${entity} ${id} was modified concurrently (expected row_version ${expected})`, {
      entity,
      id,
      expectedRowVersion: expected,
      ...(actual === undefined ? {} : { actualRowVersion: actual }),
    });
  }
}

export class EntityNotFoundError extends DomainError {
  readonly code = 'ENTITY_NOT_FOUND';
  readonly httpStatus = 404;

  constructor(entity: string, id: number) {
    super(`${entity} ${id} not found`, { entity, id });
  }
}

// Authentication, authorization and validation (US-1.3, CONTEXT D25).

/** No access token, or the token is malformed, expired or signed with another key. */
export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED';
  readonly httpStatus = 401;

  constructor(message = 'Authentication required') {
    super(message);
  }
}

/** Login failed. Unknown email and wrong password share this error so neither leaks (AC-2). */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly httpStatus = 401;

  constructor() {
    super('Invalid email or password');
  }
}

/** The caller's role is not allowed on this route. Out-of-scope records use EntityNotFoundError. */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;

  constructor(message = 'Forbidden') {
    super(message);
  }
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Request body, query or params failed its Zod schema. Details never echo the submitted values. */
export class ValidationFailedError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 400;

  constructor(issues: ValidationIssue[]) {
    super('Request validation failed', { issues });
  }
}

export class EmailTakenError extends DomainError {
  readonly code = 'EMAIL_TAKEN';
  readonly httpStatus = 409;

  constructor() {
    super('An account with this email already exists');
  }
}

export class StudentCodeTakenError extends DomainError {
  readonly code = 'STUDENT_CODE_TAKEN';
  readonly httpStatus = 409;

  constructor() {
    super('A student with this student code already exists');
  }
}

/** The request is well-formed but this role cannot be created this way (HR joins by invitation). */
export class RoleNotAllowedError extends DomainError {
  readonly code = 'ROLE_NOT_ALLOWED';
  readonly httpStatus = 422;

  constructor(role: string, message: string) {
    super(message, { role });
  }
}

// Campaign setup and phase checks (US-1.4, CONTEXT D27).

/** The campaign has left DRAFT: name, target and parameters are locked; past deadlines too. */
export class CampaignConfigLockedError extends DomainError {
  readonly code = 'CAMPAIGN_CONFIG_LOCKED';
  readonly httpStatus = 409;

  constructor(campaignId: number, status: string, fields: string[]) {
    super(`campaign ${campaignId} is ${status}; ${fields.join(', ')} can no longer change`, {
      campaignId,
      status,
      fields,
    });
  }
}

// Companies, HR invitations, JDs and file uploads (US-1.5, CONTEXT D28).

/** The invitation token is malformed, expired, signed with another key, or already used. */
export class InvitationInvalidError extends DomainError {
  readonly code = 'INVITATION_INVALID';
  readonly httpStatus = 422;

  constructor() {
    super('The invitation link is invalid, expired or already used');
  }
}

/** Only a DRAFT JD can be edited or get a new file; after submission the content is frozen. */
export class JdNotEditableError extends DomainError {
  readonly code = 'JD_NOT_EDITABLE';
  readonly httpStatus = 409;

  constructor(id: number, status: string) {
    super(`job_description ${id} is ${status}; only a DRAFT can be edited`, { id, status });
  }
}

/**
 * The JD's normalised requirements cannot be changed by this caller now (US-2.3, CONTEXT D35);
 * `reasonCode` says why: still a draft, awaiting approval, confirmation belongs to HR, …
 */
export class JdRequirementsNotEditableError extends DomainError {
  readonly code = 'JD_REQUIREMENTS_NOT_EDITABLE';
  readonly httpStatus = 409;

  constructor(id: number, status: string, reasonCode: string) {
    super(`job_description ${id} (${status}): requirements cannot be changed (${reasonCode})`, {
      id,
      status,
      reasonCode,
    });
  }
}

/** The upload exceeded the size limit; multer stopped reading it before it reached storage. */
export class FileTooLargeError extends DomainError {
  readonly code = 'FILE_TOO_LARGE';
  readonly httpStatus = 413;

  constructor(maxBytes: number) {
    super(`The file is larger than ${maxBytes} bytes`, { maxBytes });
  }
}

/** The file content (magic bytes) is not one of the allowed types, whatever its name says. */
export class UnsupportedFileTypeError extends DomainError {
  readonly code = 'UNSUPPORTED_FILE_TYPE';
  readonly httpStatus = 415;

  constructor(allowed: readonly string[], detected?: string) {
    super(`Only ${allowed.join(', ')} files are accepted`, {
      allowed: [...allowed],
      ...(detected ? { detected } : {}),
    });
  }
}

/**
 * The action belongs to another phase of the campaign (FR-2): the status is not one of `allowed`,
 * or the deadline ending the current phase has passed before the scheduler moved the campaign.
 */
export class CampaignPhaseMismatchError extends DomainError {
  readonly code = 'CAMPAIGN_PHASE_MISMATCH';
  readonly httpStatus = 409;

  constructor(campaignId: number, status: string, allowed: readonly string[], phaseEndedAt?: string) {
    super(
      phaseEndedAt
        ? `campaign ${campaignId}: phase ${status} ended at ${phaseEndedAt}`
        : `campaign ${campaignId} is ${status}; this action needs ${allowed.join(' or ')}`,
      { campaignId, status, allowed: [...allowed], ...(phaseEndedAt ? { phaseEndedAt } : {}) },
    );
  }
}

// Data-processing consent and CV submission (US-1.6, CONTEXT D30).

/** The student has not accepted the current terms for this campaign; nothing of theirs is processed (NFR-2). */
export class ConsentRequiredError extends DomainError {
  readonly code = 'CONSENT_REQUIRED';
  readonly httpStatus = 403;

  constructor(campaignId: number, termsVersion: number) {
    super(`consent to terms v${termsVersion} for campaign ${campaignId} is required`, { campaignId, termsVersion });
  }
}

/** The student accepted a terms version other than the current one (the page was stale). */
export class TermsOutdatedError extends DomainError {
  readonly code = 'TERMS_OUTDATED';
  readonly httpStatus = 409;

  constructor(accepted: number, current: number) {
    super(`terms v${accepted} is not the current version v${current}`, { accepted, current });
  }
}

/** Another upload of the same student and campaign committed first; at most one CV is active (BR-01). */
export class CvSubmissionConflictError extends DomainError {
  readonly code = 'CV_SUBMISSION_CONFLICT';
  readonly httpStatus = 409;

  constructor(campaignId: number) {
    super(`another CV for campaign ${campaignId} was submitted at the same time`, { campaignId });
  }
}

/**
 * The CV version named is not one whose profile the student may change now: it is still being
 * analysed, already confirmed (or awaiting confirmation, for "Sửa lại"), or a newer version
 * replaced it (US-2.6, CONTEXT D40).
 */
export class CvProfileNotEditableError extends DomainError {
  readonly code = 'CV_PROFILE_NOT_EDITABLE';
  readonly httpStatus = 409;

  constructor(id: number, status: string, active: boolean) {
    super(`cv ${id} (${status}${active ? '' : ', superseded'}): the profile cannot be changed now`, { id, status, active });
  }
}

// Skill catalogue review (US-2.5, CONTEXT D39).

/**
 * The name would share its match key with another skill (its name, or an approved skill's alias):
 * two catalogue skills must never match one spelling. `details` names that skill, so ADMIN can
 * merge into it instead.
 */
export class SkillNameTakenError extends DomainError {
  readonly code = 'SKILL_NAME_TAKEN';
  readonly httpStatus = 409;

  constructor(name: string, owner: { id: number; canonicalName: string; status: string }) {
    super(`"${name}" matches skill ${owner.id} (${owner.canonicalName}, ${owner.status})`, {
      name,
      skillId: owner.id,
      canonicalName: owner.canonicalName,
      status: owner.status,
    });
  }
}

// Skill taxonomy (US-2.7, CONTEXT D43).

/**
 * The implications asked for would close a cycle, or a skill would imply itself. `details.path`
 * runs from the skill being edited back to it (`[A, B, A]`; `[A, A]` for itself).
 */
export class SkillImplicationCycleError extends DomainError {
  readonly code = 'SKILL_IMPLICATION_CYCLE';
  readonly httpStatus = 422;

  constructor(path: ReadonlyArray<{ id: number; canonicalName: string }>) {
    super(`implications would form a cycle: ${path.map((skill) => skill.canonicalName).join(' => ')}`, {
      path: path.map(({ id, canonicalName }) => ({ id, canonicalName })),
    });
  }
}

/**
 * Only approved skills carry a taxonomy and only they may be implied: `skillIds` are the skills
 * named that are not approved (or do not exist).
 */
export class SkillNotApprovedError extends DomainError {
  readonly code = 'SKILL_NOT_APPROVED';
  readonly httpStatus = 422;

  constructor(skillIds: readonly number[]) {
    super(`skills ${skillIds.join(', ')} are not approved skills`, { skillIds: [...skillIds] });
  }
}

/** The campaign has a matching run that has not finished (US-3.2 AC-13); one runs at a time. */
export class MatchingRunInProgressError extends DomainError {
  readonly code = 'MATCHING_RUN_IN_PROGRESS';
  readonly httpStatus = 409;

  constructor(campaignId: number) {
    super(`campaign ${campaignId} already has a matching run in progress`, { campaignId });
  }
}

/**
 * A matching run would send more pairs than one job carries (MATCH_RUN_MAX_PAIRS, US-3.2): nothing
 * is stored, and a lower `match_top_m` brings it under the limit.
 */
export class MatchingRunTooLargeError extends DomainError {
  readonly code = 'MATCHING_RUN_TOO_LARGE';
  readonly httpStatus = 409;

  constructor(campaignId: number, pairs: number, max: number) {
    super(`campaign ${campaignId}: a matching run would send ${pairs} pairs, more than ${max}`, { campaignId, pairs, max });
  }
}

/**
 * The broker did not take an AI job the caller waits on (US-3.2). Nothing was sent; what the job
 * was for is marked failed, so the caller may try again.
 */
export class AiUnavailableError extends DomainError {
  readonly code = 'AI_UNAVAILABLE';
  readonly httpStatus = 503;

  constructor(jobType: string) {
    super(`the ${jobType} job could not be sent to the AI Service`, { jobType });
  }
}

// Preference lists (US-3.3, CONTEXT D47).

/**
 * A preference list breaks a rule of BR-04 or of the campaign (AC-6, AC-8); nothing is stored. The
 * code names the rule and the message, in Vietnamese, is the one the web shows.
 */
export class PreferencesRejectedError extends DomainError {
  readonly httpStatus = 422;

  constructor(
    readonly code: PreferenceRejectionCode,
    message: string,
    details: { campaignId: number; jdIds?: number[] },
  ) {
    super(message, details);
  }
}

// Exam blueprint and question bank (US-4.1, CONTEXT D49).

/** The JD has no question bank before the center approves it (BR-02, US-4.1 AC-3). */
export class JdNotApprovedError extends DomainError {
  readonly code = 'JD_NOT_APPROVED';
  readonly httpStatus = 409;

  constructor(jdId: number, status: string) {
    super(`job_description ${jdId} is ${status}; its question bank comes once it is approved`, { jdId, status });
  }
}

/** CENTER locked the bank (US-4.2 AC-6): its blueprint and questions are final. */
export class QuestionBankLockedError extends DomainError {
  readonly code = 'QUESTION_BANK_LOCKED';
  readonly httpStatus = 409;

  constructor(bankId: number) {
    super(`question bank ${bankId} is locked`, { bankId });
  }
}

/** A generation job of the bank is running: the blueprint cannot change under it (US-4.1 AC-3). */
export class QuestionGenerationRunningError extends DomainError {
  readonly code = 'QUESTION_GENERATION_RUNNING';
  readonly httpStatus = 409;

  constructor(bankId: number, runId: number) {
    super(`question bank ${bankId} has generation run ${runId} in progress`, { bankId, runId });
  }
}

/**
 * The JD's requirements are newer than the bank's blueprint (BR-18, US-4.2 AC-11): CENTER saves the
 * blueprint again against them before the bank is locked or filled.
 */
export class QuestionBankJdOutdatedError extends DomainError {
  readonly code = 'QUESTION_BANK_JD_OUTDATED';
  readonly httpStatus = 409;

  constructor(bankId: number, bankJdVersion: number, jdVersion: number) {
    super(`question bank ${bankId} was made for JD version ${bankJdVersion}; the JD is at version ${jdVersion}`, {
      bankId,
      bankJdVersion,
      jdVersion,
    });
  }
}

/** A cell has fewer VALIDATED questions than 3× the questions it draws (US-4.2 AC-6). */
export class QuestionBankIncompleteError extends DomainError {
  readonly code = 'QUESTION_BANK_INCOMPLETE';
  readonly httpStatus = 409;

  constructor(bankId: number, missingCells: readonly MissingCell[]) {
    super(`question bank ${bankId} has ${missingCells.length} cells short of validated questions`, {
      bankId,
      missingCells,
    });
  }
}

/** Questions are drawn only from a locked bank (US-4.2 AC-8). */
export class BankNotLockedError extends DomainError {
  readonly code = 'BANK_NOT_LOCKED';
  readonly httpStatus = 409;

  constructor(bankId: number) {
    super(`question bank ${bankId} is not locked`, { bankId });
  }
}
