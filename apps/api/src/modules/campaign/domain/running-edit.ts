import { isDeepStrictEqual } from 'node:util';
import {
  actualCampaignPhase,
  CAMPAIGN_DEADLINE_KEYS,
  type CampaignConfig,
  type CampaignConfigPatch,
  type CampaignDeadlineKey,
  type CampaignDeadlines,
  type CampaignStatus,
  type CampaignTarget,
  DEADLINE_REQUIRED,
  DEADLINE_TOO_SOON,
  earliestDeadlineMove,
  isCampaignFinal,
  isConfigKeyLocked,
  normalizeAudienceValue,
  type PhaseDeadlinesInput,
} from '@srm/shared';

const TARGET_KEYS = ['cohorts', 'majors'] as const;

export interface RunningCampaign {
  status: CampaignStatus;
  name: string;
  target: CampaignTarget;
  config: CampaignConfig;
  phaseDeadlines: CampaignDeadlines;
}

export interface RunningPatch {
  name?: string | undefined;
  target?: CampaignTarget | undefined;
  config?: CampaignConfigPatch | undefined;
  phaseDeadlines?: PhaseDeadlinesInput | undefined;
}

/** A deadline that moves, both as UTC ISO strings. */
export interface DeadlineMove {
  key: CampaignDeadlineKey;
  before: string;
  after: string;
}

export interface FieldIssue {
  path: string;
  message: string;
}

export interface RunningEdit {
  /** The actual phase the rules were applied in (`actualCampaignPhase`). */
  phase: CampaignStatus;
  /** Fields this phase no longer lets change: the API answers 409 CAMPAIGN_CONFIG_LOCKED. */
  locked: string[];
  /** Values refused in any phase: 400, one issue per field. */
  invalid: FieldIssue[];
  /** Only when the name changes. */
  name?: string;
  /** Only when values are added: the stored target, then the new values. */
  target?: CampaignTarget;
  /** The parameters that change, with their new values. */
  config: Partial<CampaignConfig>;
  deadlines: DeadlineMove[];
}

/**
 * What an edit of a campaign that has left DRAFT may change (US-1.10 AC-1, AC-3, AC-4, CONTEXT
 * D56), in its actual phase:
 * - the name, until the campaign is closed or cancelled;
 * - the target, by adding cohorts or majors only, during intake;
 * - a parameter, until the phase that first uses it (CAMPAIGN_CONFIG_USED_FROM);
 * - a deadline still ahead, later, or earlier but not within DEADLINE_MIN_NOTICE_HOURS of now.
 * Values sent unchanged are not edits. Checks on the merged result (deadlines in phase order, the
 * sums of the weights) are left to the schemas.
 */
export function planRunningEdit(campaign: RunningCampaign, patch: RunningPatch, now: Date): RunningEdit {
  const phase = actualCampaignPhase(campaign.status, campaign.phaseDeadlines, now);
  const final = isCampaignFinal(phase);
  const edit: RunningEdit = { phase, locked: [], invalid: [], config: {}, deadlines: [] };

  if (patch.name !== undefined && patch.name !== campaign.name) {
    if (final) edit.locked.push('name');
    else edit.name = patch.name;
  }

  if (patch.target) {
    const target = addedTarget(campaign.target, patch.target, phase, edit.locked);
    if (target) edit.target = target;
  }

  for (const [key, value] of Object.entries(patch.config ?? {}) as [keyof CampaignConfig, unknown][]) {
    // Deep: `competition_thresholds` is an object, sent again unchanged by a form (CONTEXT D48).
    if (value === undefined || isDeepStrictEqual(value, campaign.config[key])) continue;
    if (isConfigKeyLocked(key, phase)) edit.locked.push(`config.${key}`);
    else Object.assign(edit.config, { [key]: value });
  }

  for (const key of CAMPAIGN_DEADLINE_KEYS) {
    const next = patch.phaseDeadlines?.[key];
    if (next === undefined) continue;
    const current = campaign.phaseDeadlines[key];
    if (current !== undefined && next !== null && Date.parse(next) === Date.parse(current)) continue;
    const path = `phaseDeadlines.${key}`;
    if (final || current === undefined || Date.parse(current) <= now.getTime()) edit.locked.push(path);
    else if (next === null) edit.invalid.push({ path, message: DEADLINE_REQUIRED });
    else if (Date.parse(next) < earliestDeadlineMove(current, now).getTime()) {
      edit.invalid.push({ path, message: DEADLINE_TOO_SOON });
    } else edit.deadlines.push({ key, before: current, after: new Date(next).toISOString() });
  }
  return edit;
}

/** Whether the edit changes anything once it is allowed. */
export function hasChanges(edit: RunningEdit): boolean {
  return (
    edit.name !== undefined ||
    edit.target !== undefined ||
    Object.keys(edit.config).length > 0 ||
    edit.deadlines.length > 0
  );
}

/**
 * The stored target with the values the patch adds, or undefined when it adds none. A removed
 * value, or an addition after intake, locks that list: students already in the campaign stay in
 * it. Values match as `isInTarget` matches them; the stored spelling is kept.
 */
function addedTarget(
  before: CampaignTarget,
  sent: CampaignTarget,
  phase: CampaignStatus,
  locked: string[],
): CampaignTarget | undefined {
  const merged: CampaignTarget = { cohorts: [...before.cohorts], majors: [...before.majors] };
  let added = false;
  for (const key of TARGET_KEYS) {
    const sentValues = new Set(sent[key].map(normalizeAudienceValue));
    const stored = new Set(before[key].map(normalizeAudienceValue));
    const fresh = sent[key].filter((value) => !stored.has(normalizeAudienceValue(value)));
    const removed = [...stored].some((value) => !sentValues.has(value));
    if (removed || (fresh.length > 0 && phase !== 'INTAKE')) {
      locked.push(`target.${key}`);
    } else if (fresh.length > 0) {
      merged[key].push(...fresh);
      added = true;
    }
  }
  return added ? merged : undefined;
}
