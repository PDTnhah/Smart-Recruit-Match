import { z } from 'zod';
import { CAMPAIGN_STATES, type CampaignStatus } from '../states/campaign.js';

// Campaign setup (FR-2, PRD GĐ0, CONTEXT D27). The web form and the API validate with these
// schemas. Keys inside `phaseDeadlines` and `config` are snake_case: they are stored as-is in
// campaigns.phase_deadlines / campaigns.config, and later stories refer to them by these names.

/** Phase deadlines in phase order; each must be later than the one before it. */
export const CAMPAIGN_DEADLINE_KEYS = ['intake_end', 'preference_end', 'testing_end'] as const;

export type CampaignDeadlineKey = (typeof CAMPAIGN_DEADLINE_KEYS)[number];

/** The deadline that ends each phase the scheduler advances on its own (CONTEXT D27). */
export const PHASE_END_DEADLINE: Readonly<Partial<Record<CampaignStatus, CampaignDeadlineKey>>> = {
  INTAKE: 'intake_end',
  PREFERENCE_SELECTION: 'preference_end',
  TESTING: 'testing_end',
};

/** α and β are compared as integers ×100, never as floats (AGENTS › Invariant 9). */
export function toHundredths(value: number): number {
  return Math.round(value * 100);
}

// --- Parameters (PRD GĐ0 table) ---------------------------------------------------------------

const positiveInt = (label: string) =>
  z
    .number({ error: `${label} phải là một số` })
    .int({ error: `${label} phải là số nguyên` })
    .positive({ error: `${label} phải lớn hơn 0` });

const score = (label: string) =>
  z
    .number({ error: `${label} phải là một số` })
    .min(0, { error: `${label} phải từ 0 đến 100` })
    .max(100, { error: `${label} phải từ 0 đến 100` });

const weight = (label: string) =>
  z
    .number({ error: `${label} phải là một số` })
    .min(0, { error: `${label} phải từ 0 đến 1` })
    .max(1, { error: `${label} phải từ 0 đến 1` })
    .multipleOf(0.01, { error: `${label} có tối đa hai chữ số thập phân` });

// Declared once without defaults: the full schema adds PRD defaults, the patch schema stays partial
// (in Zod 4, `.partial()` would still fill defaults in).
const CONFIG_FIELDS = {
  n_nv: positiveInt('N_NV'),
  theta_cv: score('θ_cv'),
  theta_test: score('θ_test'),
  alpha: weight('α'),
  beta: weight('β'),
  k: z.number({ error: 'k phải là một số' }).min(1, { error: 'k phải từ 1 trở lên' }),
  r_max: positiveInt('R_max'),
  t_test_minutes: positiveInt('T_test'),
  sla_hr_business_days: positiveInt('SLA_HR'),
  t_offer_days: positiveInt('T_offer'),
};

/** PRD GĐ0 defaults. Q1 (N_NV) and Q3 (k) are still open; these are the PRD proposals. */
export const DEFAULT_CAMPAIGN_CONFIG = {
  n_nv: 3,
  theta_cv: 50,
  theta_test: 40,
  alpha: 0.4,
  beta: 0.6,
  k: 1.5,
  r_max: 3,
  t_test_minutes: 45,
  sla_hr_business_days: 5,
  t_offer_days: 3,
} as const;

const WEIGHTS_MESSAGE = 'α + β phải bằng 1';

/**
 * Runs a cross-field check as long as the fields it reads are valid, even when other fields are
 * not, so the form shows every error at once (Zod skips object refinements after any issue).
 */
const whenValid = (fields: readonly string[]) => ({
  when: (payload: z.core.ParsePayload) => payload.issues.every((issue) => !fields.includes(String(issue.path?.[0]))),
});

function checkWeights(
  config: { alpha?: number | undefined; beta?: number | undefined },
  ctx: z.RefinementCtx,
): void {
  if (config.alpha === undefined || config.beta === undefined) return;
  if (toHundredths(config.alpha) + toHundredths(config.beta) !== 100) {
    ctx.addIssue({ code: 'custom', message: WEIGHTS_MESSAGE, path: ['beta'] });
  }
}

/** campaigns.config parameters; omitted keys take the PRD defaults. */
export const CampaignConfigSchema = z
  .object({
    n_nv: CONFIG_FIELDS.n_nv.default(DEFAULT_CAMPAIGN_CONFIG.n_nv),
    theta_cv: CONFIG_FIELDS.theta_cv.default(DEFAULT_CAMPAIGN_CONFIG.theta_cv),
    theta_test: CONFIG_FIELDS.theta_test.default(DEFAULT_CAMPAIGN_CONFIG.theta_test),
    alpha: CONFIG_FIELDS.alpha.default(DEFAULT_CAMPAIGN_CONFIG.alpha),
    beta: CONFIG_FIELDS.beta.default(DEFAULT_CAMPAIGN_CONFIG.beta),
    k: CONFIG_FIELDS.k.default(DEFAULT_CAMPAIGN_CONFIG.k),
    r_max: CONFIG_FIELDS.r_max.default(DEFAULT_CAMPAIGN_CONFIG.r_max),
    t_test_minutes: CONFIG_FIELDS.t_test_minutes.default(DEFAULT_CAMPAIGN_CONFIG.t_test_minutes),
    sla_hr_business_days: CONFIG_FIELDS.sla_hr_business_days.default(
      DEFAULT_CAMPAIGN_CONFIG.sla_hr_business_days,
    ),
    t_offer_days: CONFIG_FIELDS.t_offer_days.default(DEFAULT_CAMPAIGN_CONFIG.t_offer_days),
  })
  .superRefine(checkWeights, whenValid(['alpha', 'beta']));

export type CampaignConfig = z.output<typeof CampaignConfigSchema>;

/**
 * Changed parameters only. The API merges them into the stored config and parses the result with
 * CampaignConfigSchema, so α + β is always checked on the merged values.
 */
export const CampaignConfigPatchSchema = z
  .object(CONFIG_FIELDS)
  .partial()
  .superRefine(checkWeights, whenValid(['alpha', 'beta']));

export type CampaignConfigPatch = z.output<typeof CampaignConfigPatchSchema>;

// --- Target (khóa, ngành) ---------------------------------------------------------------------

const valueList = (empty: string, duplicate: string) =>
  z
    .array(
      z
        .string()
        .trim()
        .min(1, { error: 'Giá trị không được để trống' })
        .max(100, { error: 'Giá trị tối đa 100 ký tự' }),
    )
    .min(1, { error: empty })
    .max(50, { error: 'Tối đa 50 giá trị' })
    .refine((values) => new Set(values.map(normalizeAudienceValue)).size === values.length, {
      error: duplicate,
    });

/** Who the campaign is for (CONTEXT D27): stored in campaigns.config.target. */
export const CampaignTargetSchema = z.object({
  cohorts: valueList('Nhập ít nhất một khóa', 'Có khóa bị trùng'),
  majors: valueList('Nhập ít nhất một ngành', 'Có ngành bị trùng'),
});

export type CampaignTarget = z.output<typeof CampaignTargetSchema>;

/** Cohorts and majors match ignoring case and surrounding spaces ("cntt" = "CNTT"). */
export function normalizeAudienceValue(value: string): string {
  return value.trim().toLocaleLowerCase('vi');
}

// --- Phase deadlines --------------------------------------------------------------------------

const deadline = z.iso.datetime({ offset: true, error: 'Thời điểm không hợp lệ' });

function checkIncreasing(deadlines: Partial<Record<CampaignDeadlineKey, string | null>>, ctx: z.RefinementCtx) {
  let previous: { key: CampaignDeadlineKey; at: number } | undefined;
  for (const key of CAMPAIGN_DEADLINE_KEYS) {
    const value = deadlines[key];
    if (value == null) continue;
    const at = Date.parse(value);
    if (previous && at <= previous.at) {
      ctx.addIssue({ code: 'custom', message: 'Mốc này phải sau mốc của giai đoạn trước', path: [key] });
    }
    previous = { key, at };
  }
}

/**
 * Deadlines in a request. A key left out is not set (create) or unchanged (update); `null` clears
 * it while the campaign is a draft. Deadlines that are given must increase in phase order.
 */
export const PhaseDeadlinesInputSchema = z
  .object({
    intake_end: deadline.nullable().optional(),
    preference_end: deadline.nullable().optional(),
    testing_end: deadline.nullable().optional(),
  })
  .superRefine(checkIncreasing, whenValid(CAMPAIGN_DEADLINE_KEYS));

export type PhaseDeadlinesInput = z.output<typeof PhaseDeadlinesInputSchema>;

/** Deadlines as stored and returned. The API also parses merged deadlines with it before saving. */
export const PhaseDeadlinesSchema = z
  .object({
    intake_end: deadline.optional(),
    preference_end: deadline.optional(),
    testing_end: deadline.optional(),
  })
  .superRefine(checkIncreasing, whenValid(CAMPAIGN_DEADLINE_KEYS));

/** ISO 8601 instants; a draft may still miss some. */
export type CampaignDeadlines = z.output<typeof PhaseDeadlinesSchema>;

// --- Requests and responses -------------------------------------------------------------------

const CampaignNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Vui lòng nhập tên đợt' })
  .max(200, { error: 'Tên đợt tối đa 200 ký tự' });

const RowVersionSchema = z.number().int().min(0);

/** Body of `POST /api/campaigns`. Parameters left out take the PRD defaults (AC-1). */
export const CreateCampaignRequestSchema = z.object({
  name: CampaignNameSchema,
  target: CampaignTargetSchema,
  phaseDeadlines: PhaseDeadlinesInputSchema.prefault({}),
  config: CampaignConfigSchema.prefault({}),
});

export type CreateCampaignRequest = z.output<typeof CreateCampaignRequestSchema>;

/**
 * Body of `PATCH /api/campaigns/{id}`: only the sections and keys that change. After DRAFT only
 * deadlines may move, later only, with a `reason` (AC-4, CONTEXT D27).
 */
export const UpdateCampaignRequestSchema = z.object({
  rowVersion: RowVersionSchema,
  name: CampaignNameSchema.optional(),
  target: CampaignTargetSchema.optional(),
  phaseDeadlines: PhaseDeadlinesInputSchema.optional(),
  config: CampaignConfigPatchSchema.optional(),
  reason: z.string().trim().max(500, { error: 'Lý do tối đa 500 ký tự' }).optional(),
});

export type UpdateCampaignRequest = z.output<typeof UpdateCampaignRequestSchema>;

/** Message the API and the form show when a deadline is extended without a reason. */
export const DEADLINE_REASON_REQUIRED = 'Nhập lý do gia hạn';

/** Message the API returns when a deadline of a running campaign moves earlier or is cleared. */
export const DEADLINE_NOT_LATER = 'Chỉ được lùi mốc về sau';

/** The form used once the campaign has left DRAFT: the reason becomes required. */
export const ExtendDeadlinesRequestSchema = UpdateCampaignRequestSchema.extend({
  reason: z
    .string()
    .trim()
    .min(1, { error: DEADLINE_REASON_REQUIRED })
    .max(500, { error: 'Lý do tối đa 500 ký tự' }),
});

/** Body of `POST /api/campaigns/{id}/open`. */
export const OpenCampaignRequestSchema = z.object({ rowVersion: RowVersionSchema });

export type OpenCampaignRequest = z.output<typeof OpenCampaignRequestSchema>;

export const CampaignSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  status: z.enum(CAMPAIGN_STATES),
  target: CampaignTargetSchema,
  phaseDeadlines: PhaseDeadlinesSchema,
  config: CampaignConfigSchema,
  rowVersion: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Campaign = z.output<typeof CampaignSchema>;

export const CampaignListSchema = z.object({ items: z.array(CampaignSchema) });

export type CampaignList = z.output<typeof CampaignListSchema>;
