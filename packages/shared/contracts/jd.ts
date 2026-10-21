import { z } from 'zod';

// Normalised requirements of a JD (PRD GĐ1 step 2, FR-9, US-2.3, CONTEXT D35). One definition for
// the LLM output of the JD Analyzer, the HR confirmation form and the API (AD-6). Enum values are
// English codes; the web shows them in Vietnamese. Error messages are Vietnamese because the HR
// form displays them; they do not reach the JSON Schema.

/** Required level of a skill: Cơ bản / Khá / Thành thạo (PRD GĐ1). */
export const SKILL_LEVELS = ['BASIC', 'INTERMEDIATE', 'ADVANCED'] as const;

export type SkillLevel = (typeof SKILL_LEVELS)[number];

/** Position groups of PRD GĐ1; `OTHER` stands for the "…" at the end of the PRD list. */
export const POSITION_GROUPS = ['BACKEND', 'FRONTEND', 'MOBILE', 'DATA_AI', 'TESTER_QA', 'BA', 'DEVOPS', 'OTHER'] as const;

export type PositionGroup = (typeof POSITION_GROUPS)[number];

/** Weights are relative: S_cv takes the weighted average per group (PRD › S_cv), so the scale is arbitrary. */
export const SKILL_WEIGHT_MAX = 10;

/** Grade point average scale of the minimum GPA (Vietnamese universities report it out of 4). */
export const GPA_SCALE_MAX = 4;

export const MAX_SKILLS_PER_GROUP = 30;

export const SkillLevelSchema = z
  .enum(SKILL_LEVELS, { error: 'Chọn mức độ' })
  .meta({ title: 'SkillLevel', description: 'BASIC = basic, INTERMEDIATE = working knowledge, ADVANCED = proficient' });

export const PositionGroupSchema = z
  .enum(POSITION_GROUPS, { error: 'Chọn nhóm vị trí' })
  .meta({ title: 'PositionGroup', description: 'Position group of a JD (PRD GĐ1)' });

const text = (empty: string, label: string, max: number) =>
  z
    .string({ error: empty })
    .trim()
    .min(1, { error: empty })
    .max(max, { error: `${label} tối đa ${max} ký tự` });

export const JdSkillRequirementSchema = z
  .strictObject({
    skill: text('Vui lòng nhập kỹ năng', 'Kỹ năng', 100).describe('Skill name as written in the JD'),
    level: SkillLevelSchema,
    weight: z
      .number({ error: 'Trọng số phải là một số' })
      .positive({ error: 'Trọng số phải lớn hơn 0' })
      .max(SKILL_WEIGHT_MAX, { error: `Trọng số tối đa ${SKILL_WEIGHT_MAX}` })
      .describe(`Relative importance within its group, greater than 0 and at most ${SKILL_WEIGHT_MAX}`),
  })
  .meta({ title: 'JdSkillRequirement', description: 'One required skill with its level and weight' });

export type JdSkillRequirement = z.output<typeof JdSkillRequirementSchema>;

export const JdHardConditionsSchema = z
  .strictObject({
    majors: z
      .array(text('Ngành không được để trống', 'Ngành', 100))
      .max(20, { error: 'Tối đa 20 ngành' })
      .describe('Accepted majors; empty when the JD accepts any major'),
    min_study_year: z
      .int({ error: 'Năm học phải là số nguyên' })
      .min(1, { error: 'Năm học từ 1 đến 6' })
      .max(6, { error: 'Năm học từ 1 đến 6' })
      .nullable()
      .describe('Lowest year of study accepted (1 = first year); null when the JD states none'),
    min_gpa: z
      .number({ error: 'GPA phải là một số' })
      .min(0, { error: `GPA từ 0 đến ${GPA_SCALE_MAX}` })
      .max(GPA_SCALE_MAX, { error: `GPA từ 0 đến ${GPA_SCALE_MAX}` })
      .nullable()
      .describe(`Minimum GPA on a ${GPA_SCALE_MAX}-point scale; null when the JD states none`),
    required_languages: z
      .array(text('Ngoại ngữ không được để trống', 'Ngoại ngữ', 100))
      .max(10, { error: 'Tối đa 10 ngoại ngữ' })
      .describe('Mandatory foreign languages with any stated level, e.g. "English (TOEIC 550)"'),
  })
  .meta({ title: 'JdHardConditions', description: 'Eligibility conditions checked by code, not scored (US-3.1)' });

export type JdHardConditions = z.output<typeof JdHardConditionsSchema>;

/** Key two skill names are compared by: trimmed, case-insensitive. */
export const skillKey = (skill: string): string => skill.trim().toLocaleLowerCase('vi');

const SKILL_GROUPS = ['must_have', 'nice_to_have'] as const;

/**
 * A skill appears once across both groups; the later copy is the one reported. Items whose name is
 * still invalid are skipped: their own field error shows instead.
 */
function checkDistinctSkills(
  requirements: Record<(typeof SKILL_GROUPS)[number], readonly { skill: unknown }[]>,
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const group of SKILL_GROUPS) {
    const items: unknown = requirements[group];
    if (!Array.isArray(items)) continue;
    (items as readonly { skill?: unknown }[]).forEach((item, index) => {
      if (typeof item?.skill !== 'string' || item.skill.trim() === '') return;
      const key = skillKey(item.skill);
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: [group, index, 'skill'], message: `Kỹ năng "${item.skill.trim()}" bị trùng` });
      }
      seen.add(key);
    });
  }
}

// The duplicate check also runs while other fields are invalid (LESSONS §10); it only waits for the
// object itself, the two lists and their items to be well formed.
const whenSkillListsParsed = {
  when: (payload: z.core.ParsePayload) =>
    payload.issues.every((issue) => {
      const path = issue.path ?? [];
      if (path.length === 0) return false;
      return !(SKILL_GROUPS as readonly PropertyKey[]).includes(path[0] ?? '') || path.length > 2;
    }),
};

export const JdRequirementsSchema = z
  .strictObject({
    must_have: z
      .array(JdSkillRequirementSchema)
      .min(1, { error: 'Cần ít nhất một kỹ năng bắt buộc' })
      .max(MAX_SKILLS_PER_GROUP, { error: `Tối đa ${MAX_SKILLS_PER_GROUP} kỹ năng mỗi nhóm` })
      .describe('Must-have skills'),
    nice_to_have: z
      .array(JdSkillRequirementSchema)
      .max(MAX_SKILLS_PER_GROUP, { error: `Tối đa ${MAX_SKILLS_PER_GROUP} kỹ năng mỗi nhóm` })
      .describe('Nice-to-have skills; never repeats a must-have skill'),
    hard_conditions: JdHardConditionsSchema,
  })
  .superRefine(checkDistinctSkills, whenSkillListsParsed)
  .meta({ title: 'JdRequirements', description: 'Normalised requirements of a JD (FR-9)' });

export type JdRequirements = z.output<typeof JdRequirementsSchema>;

/** What the JD Analyzer asks the LLM for: the requirements and the position group (US-2.3). */
export const JdAnalysisSchema = z
  .strictObject({
    requirements: JdRequirementsSchema,
    position_group: PositionGroupSchema,
  })
  .meta({ title: 'JdAnalysis', description: 'Structured output of the JD Analyzer' });

export type JdAnalysis = z.output<typeof JdAnalysisSchema>;
