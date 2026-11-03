import { z } from 'zod';
import { type LanguageId, parseLanguageText } from './languages.js';
import { skillMatchKey } from './skills.js';

// Normalised requirements of a JD (PRD GĐ1 step 2, FR-9, US-2.3, CONTEXT D35). One definition for
// the LLM output of the JD Analyzer, the HR confirmation form and the API (AD-6). Enum values are
// English codes; the web shows them in Vietnamese. Error messages are Vietnamese because the HR
// form displays them; they do not reach the JSON Schema.

/** Required level of a skill: Cơ bản / Khá / Thành thạo (PRD GĐ1). */
export const SKILL_LEVELS = ['BASIC', 'INTERMEDIATE', 'ADVANCED'] as const;

export type SkillLevel = (typeof SKILL_LEVELS)[number];

/**
 * Evidence a CV needs to meet each level (PRD › Khung quy đổi mức bằng chứng, CONTEXT D44): BASIC
 * one project, experience or certificate using the skill; INTERMEDIATE this many projects or
 * experience entries; ADVANCED work or internship experience covering this many months. The Core
 * Backend's tier rules read these numbers and the HR form shows them, so the two never disagree.
 * A change of either number is a new `MATCHING_RULES_VERSION` (`apps/api` › `matching-rules.ts`).
 */
export const SKILL_LEVEL_EVIDENCE = {
  intermediateMinProjectOrExperience: 2,
  advancedMinExperienceMonths: 6,
} as const;

/** What each level asks of a CV, as the HR form shows it (US-3.6 AC-9). */
export const SKILL_LEVEL_HINTS: Readonly<Record<SkillLevel, string>> = {
  BASIC: 'Đã dùng trong ít nhất 1 dự án, kinh nghiệm hoặc chứng chỉ',
  INTERMEDIATE: `Đã dùng trong ít nhất ${SKILL_LEVEL_EVIDENCE.intermediateMinProjectOrExperience} dự án hoặc kinh nghiệm`,
  ADVANCED: `Ít nhất ${SKILL_LEVEL_EVIDENCE.advancedMinExperienceMonths} tháng kinh nghiệm làm việc hoặc thực tập dùng kỹ năng này`,
};

/** Position groups of PRD GĐ1; `OTHER` stands for the "…" at the end of the PRD list. */
export const POSITION_GROUPS = ['BACKEND', 'FRONTEND', 'MOBILE', 'DATA_AI', 'TESTER_QA', 'BA', 'DEVOPS', 'OTHER'] as const;

export type PositionGroup = (typeof POSITION_GROUPS)[number];

/** Weights are relative: S_cv takes the weighted average per group (PRD › S_cv), so the scale is arbitrary. */
export const SKILL_WEIGHT_MAX = 10;

/** Grade point average scale of the minimum GPA (Vietnamese universities report it out of 4). */
export const GPA_SCALE_MAX = 4;

export const MAX_SKILLS_PER_GROUP = 30;

/** Most entries of each foreign-language list. */
export const MAX_LANGUAGES_PER_LIST = 10;

export const SkillLevelSchema = z
  .enum(SKILL_LEVELS, { error: 'Chọn mức độ' })
  .meta({
    title: 'SkillLevel',
    // The evidence each level asks of a CV (CONTEXT D44); the JD Analyzer's prompt states the same.
    description:
      'BASIC = basic: used in at least 1 project, experience or certificate; ' +
      `INTERMEDIATE = working knowledge: used in at least ${SKILL_LEVEL_EVIDENCE.intermediateMinProjectOrExperience} projects or experience entries; ` +
      `ADVANCED = proficient: at least ${SKILL_LEVEL_EVIDENCE.advancedMinExperienceMonths} months of work or internship experience using it`,
  });

export const PositionGroupSchema = z
  .enum(POSITION_GROUPS, { error: 'Chọn nhóm vị trí' })
  .meta({ title: 'PositionGroup', description: 'Position group of a JD (PRD GĐ1)' });

const text = (empty: string, label: string, max: number) =>
  z
    .string({ error: empty })
    .trim()
    .min(1, { error: empty })
    .max(max, { error: `${label} tối đa ${max} ký tự` });

const languageList = () =>
  z
    .array(text('Ngoại ngữ không được để trống', 'Ngoại ngữ', 100))
    .max(MAX_LANGUAGES_PER_LIST, { error: `Tối đa ${MAX_LANGUAGES_PER_LIST} ngoại ngữ` });

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
    required_languages: languageList().describe(
      'Mandatory foreign languages with any stated level, e.g. "English (TOEIC 550)"',
    ),
  })
  .meta({ title: 'JdHardConditions', description: 'Eligibility conditions checked by code, not scored (US-3.1)' });

export type JdHardConditions = z.output<typeof JdHardConditionsSchema>;

/**
 * Key two skill names are compared by: the catalogue's match key (US-2.5, CONTEXT D39), so "React"
 * and "React.js" are one skill here as they are to the skill normalizer.
 */
export const skillKey = (skill: string): string => skillMatchKey(skill);

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
      if (typeof item?.skill !== 'string') return;
      const key = skillKey(item.skill);
      if (key === '') return;
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
    // Not a hard condition: it only raises the language criterion of S_cv (US-3.6 AC-4).
    preferred_languages: languageList().describe(
      'Foreign languages the JD prefers but does not require, with any stated level; a language is either required or preferred, never both',
    ),
  })
  .superRefine(checkDistinctSkills, whenSkillListsParsed)
  .meta({ title: 'JdRequirements', description: 'Normalised requirements of a JD (FR-9)' });

export type JdRequirements = z.output<typeof JdRequirementsSchema>;

/** The text entries of a list that may still be malformed; anything else stands as null. */
const textsOf = (list: unknown): (string | null)[] =>
  Array.isArray(list) ? list.map((item: unknown) => (typeof item === 'string' ? item : null)) : [];

const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/**
 * A language is either required or preferred (US-3.6 AC-4, CONTEXT D45): the positions of the
 * preferred entries that name a language a required entry names ("IELTS 7.0" next to "Tiếng Anh
 * (TOEIC 550)"). Entries that name no language ("Ngoại ngữ thứ hai") never clash. Reads the input
 * defensively, since a refinement also sees requirements with other fields invalid (LESSONS §10).
 */
export function overlappingPreferredLanguages(requirements: unknown): number[] {
  const languagesOf = (text: string | null): LanguageId[] => (text === null ? [] : parseLanguageText(text).languages);
  const required = new Set(
    textsOf(fieldOf(fieldOf(requirements, 'hard_conditions'), 'required_languages')).flatMap(languagesOf),
  );
  return textsOf(fieldOf(requirements, 'preferred_languages')).flatMap((text, index) =>
    languagesOf(text).some((language) => required.has(language)) ? [index] : [],
  );
}

/**
 * The requirements without the preferred entries that repeat a required language, and those
 * entries. The JD Analyzer's proposal is cleaned with it before it is stored: one repeated
 * language should not fail the whole analysis, and HR cannot fix a proposal before it is stored.
 */
export function withoutOverlappingPreferred(requirements: JdRequirements): {
  requirements: JdRequirements;
  dropped: string[];
} {
  const overlapping = new Set(overlappingPreferredLanguages(requirements));
  if (overlapping.size === 0) return { requirements, dropped: [] };
  const keep = (_: string, index: number) => !overlapping.has(index);
  return {
    requirements: { ...requirements, preferred_languages: requirements.preferred_languages.filter(keep) },
    dropped: requirements.preferred_languages.filter((text, index) => !keep(text, index)),
  };
}

function checkDistinctLanguages(requirements: unknown, ctx: z.RefinementCtx): void {
  for (const index of overlappingPreferredLanguages(requirements)) {
    ctx.addIssue({ code: 'custom', path: ['preferred_languages', index], message: 'Ngoại ngữ này đã có ở mục bắt buộc' });
  }
}

// Runs while other fields are invalid too (LESSONS §10): it only waits for the object itself and
// reads the two lists defensively.
const whenRequirementsObjectParsed = {
  when: (payload: z.core.ParsePayload) => payload.issues.every((issue) => (issue.path ?? []).length > 0),
};

/**
 * The requirements as HR saves them, on the form and through the API: a language is also in one
 * list only. The JD Analyzer's result is not held to it on the queue, where one repeated language
 * would reject the whole message; the Core Backend drops the repeated entries instead
 * (`withoutOverlappingPreferred`, CONTEXT D45).
 */
export const HrJdRequirementsSchema = JdRequirementsSchema.superRefine(
  checkDistinctLanguages,
  whenRequirementsObjectParsed,
);

/** What the JD Analyzer asks the LLM for: the requirements and the position group (US-2.3). */
export const JdAnalysisSchema = z
  .strictObject({
    requirements: JdRequirementsSchema,
    position_group: PositionGroupSchema,
  })
  .meta({ title: 'JdAnalysis', description: 'Structured output of the JD Analyzer' });

export type JdAnalysis = z.output<typeof JdAnalysisSchema>;
