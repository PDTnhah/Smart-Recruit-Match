import {
  CampaignConfigPatchSchema,
  CampaignConfigSchema,
  CampaignTargetSchema,
  CreateCampaignRequestSchema,
  DEFAULT_CAMPAIGN_CONFIG,
  ExtendDeadlinesRequestSchema,
  PHASE_END_DEADLINE,
  PhaseDeadlinesInputSchema,
  toHundredths,
} from '../campaign.js';

const target = { cohorts: ['K66'], majors: ['CNTT'] };

interface Issue {
  path: PropertyKey[];
  message: string;
}

function issues(result: { success: boolean; error?: { issues: Issue[] } }): string[] {
  return result.error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) ?? [];
}

describe('GĐ0: campaign config schema', () => {
  it('GĐ0: omitted parameters take the PRD defaults', () => {
    expect(CampaignConfigSchema.parse({})).toEqual({
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
    });
    expect(CampaignConfigSchema.parse({})).toEqual(DEFAULT_CAMPAIGN_CONFIG);
  });

  it('GĐ0: create request fills config and deadlines when they are left out', () => {
    const parsed = CreateCampaignRequestSchema.parse({ name: ' Đợt HK1 ', target });
    expect(parsed).toEqual({ name: 'Đợt HK1', target, phaseDeadlines: {}, config: DEFAULT_CAMPAIGN_CONFIG });
    expect(CreateCampaignRequestSchema.parse({ name: 'Đợt', target, config: { n_nv: 5 } }).config).toEqual({
      ...DEFAULT_CAMPAIGN_CONFIG,
      n_nv: 5,
    });
  });

  it('GĐ0: rejects alpha + beta != 1', () => {
    expect(issues(CampaignConfigSchema.safeParse({ alpha: 0.5, beta: 0.6 }))).toEqual(['beta: α + β phải bằng 1']);
    expect(issues(CampaignConfigSchema.safeParse({ alpha: 0.5 }))).toEqual(['beta: α + β phải bằng 1']);
  });

  it('GĐ0: reports alpha + beta together with errors of other fields', () => {
    expect(issues(CampaignConfigSchema.safeParse({ alpha: 0.5, beta: 0.6, k: 0 }))).toEqual([
      'k: k phải từ 1 trở lên',
      'beta: α + β phải bằng 1',
    ]);
  });

  it('GĐ0: compares alpha + beta as integers ×100, not floats', () => {
    // 0.1 + 0.2 !== 0.3 and 0.7 + 0.3 is fine only after rounding to hundredths.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(CampaignConfigSchema.safeParse({ alpha: 0.3, beta: 0.7 }).success).toBe(true);
    expect(CampaignConfigSchema.safeParse({ alpha: 0.07, beta: 0.93 }).success).toBe(true);
    expect(CampaignConfigSchema.safeParse({ alpha: 1, beta: 0 }).success).toBe(true);
    expect(toHundredths(0.29 + 0.01)).toBe(30);
  });

  it('GĐ0: rejects alpha or beta outside 0..1 or with more than two decimals', () => {
    expect(issues(CampaignConfigSchema.safeParse({ alpha: -0.1, beta: 1.1 }))).toEqual([
      'alpha: α phải từ 0 đến 1',
      'beta: β phải từ 0 đến 1',
    ]);
    expect(issues(CampaignConfigSchema.safeParse({ alpha: 0.333, beta: 0.667 }))).toEqual([
      'alpha: α có tối đa hai chữ số thập phân',
      'beta: β có tối đa hai chữ số thập phân',
    ]);
  });

  it('GĐ0: rejects thresholds outside 0..100', () => {
    expect(issues(CampaignConfigSchema.safeParse({ theta_cv: -1, theta_test: 100.5 }))).toEqual([
      'theta_cv: θ_cv phải từ 0 đến 100',
      'theta_test: θ_test phải từ 0 đến 100',
    ]);
    expect(CampaignConfigSchema.safeParse({ theta_cv: 0, theta_test: 100 }).success).toBe(true);
  });

  it('GĐ0: N_NV and R_max must be positive integers', () => {
    expect(issues(CampaignConfigSchema.safeParse({ n_nv: 0, r_max: 2.5 }))).toEqual([
      'n_nv: N_NV phải lớn hơn 0',
      'r_max: R_max phải là số nguyên',
    ]);
  });

  it('GĐ0: rejects k < 1 and T_test <= 0', () => {
    expect(issues(CampaignConfigSchema.safeParse({ k: 0.9, t_test_minutes: 0 }))).toEqual([
      'k: k phải từ 1 trở lên',
      't_test_minutes: T_test phải lớn hơn 0',
    ]);
    expect(CampaignConfigSchema.safeParse({ k: 1 }).success).toBe(true);
  });

  it('rejects a parameter that is not a number (empty form field)', () => {
    expect(issues(CampaignConfigSchema.safeParse({ n_nv: Number.NaN }))).toEqual(['n_nv: N_NV phải là một số']);
  });

  it('patch schema has no defaults and checks the weights only when both are given', () => {
    expect(CampaignConfigPatchSchema.parse({})).toEqual({});
    expect(CampaignConfigPatchSchema.parse({ alpha: 0.5 })).toEqual({ alpha: 0.5 });
    expect(issues(CampaignConfigPatchSchema.safeParse({ alpha: 0.5, beta: 0.6 }))).toEqual([
      'beta: α + β phải bằng 1',
    ]);
  });
});

describe('GĐ0: campaign target schema', () => {
  it('requires at least one cohort and one major', () => {
    expect(issues(CampaignTargetSchema.safeParse({ cohorts: [], majors: [] }))).toEqual([
      'cohorts: Nhập ít nhất một khóa',
      'majors: Nhập ít nhất một ngành',
    ]);
  });

  it('trims values and rejects duplicates that differ only in case', () => {
    expect(CampaignTargetSchema.parse({ cohorts: [' K66 '], majors: ['CNTT'] })).toEqual(target);
    expect(issues(CampaignTargetSchema.safeParse({ cohorts: ['K66'], majors: ['CNTT', 'cntt'] }))).toEqual([
      'majors: Có ngành bị trùng',
    ]);
  });
});

describe('GĐ0: phase deadlines schema', () => {
  const intake = '2026-11-01T10:00:00.000Z';
  const preference = '2026-11-08T10:00:00+07:00';
  const testing = '2026-11-15T10:00:00.000Z';

  it('accepts increasing deadlines with or without an offset', () => {
    const deadlines = { intake_end: intake, preference_end: preference, testing_end: testing };
    expect(PhaseDeadlinesInputSchema.parse(deadlines)).toEqual(deadlines);
  });

  it('GĐ0: rejects non-increasing deadlines', () => {
    expect(
      issues(PhaseDeadlinesInputSchema.safeParse({ intake_end: testing, preference_end: preference, testing_end: intake })),
    ).toEqual([
      'preference_end: Mốc này phải sau mốc của giai đoạn trước',
      'testing_end: Mốc này phải sau mốc của giai đoạn trước',
    ]);
    expect(issues(PhaseDeadlinesInputSchema.safeParse({ intake_end: intake, preference_end: intake }))).toEqual([
      'preference_end: Mốc này phải sau mốc của giai đoạn trước',
    ]);
  });

  it('compares only the deadlines that are set, so a draft may miss some', () => {
    expect(PhaseDeadlinesInputSchema.safeParse({ intake_end: intake, testing_end: testing }).success).toBe(true);
    expect(PhaseDeadlinesInputSchema.safeParse({ intake_end: null, preference_end: preference }).success).toBe(true);
    expect(issues(PhaseDeadlinesInputSchema.safeParse({ intake_end: testing, testing_end: intake }))).toEqual([
      'testing_end: Mốc này phải sau mốc của giai đoạn trước',
    ]);
  });

  it('rejects a date without a time or an offset', () => {
    expect(issues(PhaseDeadlinesInputSchema.safeParse({ intake_end: '2026-11-01' }))).toEqual([
      'intake_end: Thời điểm không hợp lệ',
    ]);
  });

  it('names the deadline that ends each automatically advanced phase', () => {
    expect(PHASE_END_DEADLINE).toEqual({
      INTAKE: 'intake_end',
      PREFERENCE_SELECTION: 'preference_end',
      TESTING: 'testing_end',
    });
  });
});

describe('FR-2: extend-deadlines form schema', () => {
  it('requires a reason', () => {
    expect(issues(ExtendDeadlinesRequestSchema.safeParse({ rowVersion: 1, reason: '  ' }))).toEqual([
      'reason: Nhập lý do gia hạn',
    ]);
    expect(ExtendDeadlinesRequestSchema.safeParse({ rowVersion: 1, reason: 'Gia hạn nộp CV' }).success).toBe(true);
  });
});
