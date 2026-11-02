import { z } from 'zod';
import {
  MAX_IMPLIED_SKILLS,
  SKILL_FAMILIES,
  SKILL_GROUPS,
  SKILL_ZONES,
  familyFitsGroup,
  skillMatchKey,
  type SkillFamily,
  type SkillGroup,
} from '../contracts/skills.js';
import { SKILL_STATES } from '../states/skill.js';
import { RowVersionSchema, whenValid } from './common.js';

// Skill catalogue API (FR-13, US-2.5, CONTEXT D39): every signed-in user looks up approved
// skills; ADMIN reviews the new skills the AI found and keeps their family and implied skills
// (FR-39, US-2.7, CONTEXT D43). The web forms validate with these schemas.

export const SKILL_NAME_MAX = 100;

const skillName = () =>
  z
    .string({ error: 'Vui lòng nhập tên kỹ năng' })
    .trim()
    // No `abort`: an aborted issue skips the cross-field check of the family too (LESSONS §10).
    .min(1, { error: 'Vui lòng nhập tên kỹ năng' })
    .max(SKILL_NAME_MAX, { error: `Tên kỹ năng tối đa ${SKILL_NAME_MAX} ký tự` })
    // A name of separators only has no match key (core.skills.name_key must not be empty).
    .refine((name) => name === '' || skillMatchKey(name) !== '', { error: 'Tên kỹ năng phải có chữ hoặc số' });

/** Query of `GET /api/skills`: approved skills whose name or alias contains `query`. */
export const SkillSearchQuerySchema = z.object({
  query: z.string().trim().max(SKILL_NAME_MAX).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SkillSearchQuery = z.output<typeof SkillSearchQuerySchema>;

/** An approved skill of the catalogue. */
export const CatalogSkillSchema = z.object({
  id: z.number().int(),
  canonicalName: z.string(),
  group: z.enum(SKILL_GROUPS),
  aliases: z.array(z.string()),
});

export type CatalogSkill = z.infer<typeof CatalogSkillSchema>;

export const CatalogSkillListSchema = z.object({ items: z.array(CatalogSkillSchema) });

export type CatalogSkillList = z.infer<typeof CatalogSkillListSchema>;

/** Query of `GET /api/admin/skills`; the review screen lists the skills awaiting review. */
export const AdminSkillListQuerySchema = z.object({
  status: z.enum(SKILL_STATES).default('PENDING'),
  /** Only skills whose family is in this zone. */
  zone: z.enum(SKILL_ZONES).optional(),
});

export type AdminSkillListQuery = z.output<typeof AdminSkillListQuerySchema>;

/** What the skill normalizer suggested (AC-6): advice for ADMIN, never applied by itself (AD-2). */
export const SkillSuggestionViewSchema = z.object({
  canonicalName: z.string(),
  group: z.enum(SKILL_GROUPS),
  /** Catalogue skills that may be the same skill, by catalogue name. */
  similarSkills: z.array(z.string()),
  model: z.string(),
  promptVersion: z.string(),
});

export type SkillSuggestionView = z.infer<typeof SkillSuggestionViewSchema>;

/** Another catalogue skill, by id and name. */
export const SkillRefSchema = z.object({ id: z.number().int(), canonicalName: z.string() });

export type SkillRef = z.infer<typeof SkillRefSchema>;

export const AdminSkillSchema = z.object({
  id: z.number().int(),
  /** The catalogue name once approved; while pending, the name as the CV or JD wrote it. */
  canonicalName: z.string(),
  aliases: z.array(z.string()),
  group: z.enum(SKILL_GROUPS).nullable(),
  /** Skills of one family can stand in for each other (FR-39). */
  family: z.enum(SKILL_FAMILIES).nullable(),
  /** The zone of `family`. */
  zone: z.enum(SKILL_ZONES).nullable(),
  /** Skills this one implies directly, by name. */
  implies: z.array(SkillRefSchema),
  status: z.enum(SKILL_STATES),
  /** The skill a MERGED skill became an alias of. */
  mergedInto: SkillRefSchema.nullable(),
  suggestion: SkillSuggestionViewSchema.nullable(),
  rowVersion: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type AdminSkill = z.infer<typeof AdminSkillSchema>;

export const AdminSkillListSchema = z.object({ items: z.array(AdminSkillSchema) });

export type AdminSkillList = z.infer<typeof AdminSkillListSchema>;

/** Error of `family` for a skill of `group`, or null: soft skills take soft-skill families only. */
export function familyGroupError(group: SkillGroup, family: SkillFamily | null): string | null {
  if (family === null || familyFitsGroup(group, family)) return null;
  return group === 'SOFT_SKILL'
    ? 'Kỹ năng mềm phải thuộc một năng lực mềm'
    : 'Năng lực mềm chỉ dành cho nhóm Kỹ năng mềm';
}

const familySchema = () => z.enum(SKILL_FAMILIES, { error: 'Chọn họ kỹ năng' }).nullable();

/** Skills a skill implies directly: approved skills, each once, at most MAX_IMPLIED_SKILLS. */
const impliesSkillIdsSchema = () =>
  z
    .array(z.number().int().positive())
    .max(MAX_IMPLIED_SKILLS, { error: `Chọn tối đa ${MAX_IMPLIED_SKILLS} kỹ năng kéo theo` })
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Mỗi kỹ năng kéo theo chỉ chọn một lần' });

/**
 * Body of `POST /api/admin/skills/{id}/approve` (US-2.5 AC-7, US-2.7 AC-5). A new name that
 * differs from the one the CV or JD wrote keeps that one as an alias.
 */
export const ApproveSkillRequestSchema = z
  .object({
    rowVersion: RowVersionSchema,
    canonicalName: skillName(),
    group: z.enum(SKILL_GROUPS, { error: 'Chọn nhóm kỹ năng' }),
    family: familySchema().default(null),
    impliesSkillIds: impliesSkillIdsSchema().default([]),
  })
  .superRefine(({ group, family }, ctx) => {
    const error = familyGroupError(group, family);
    if (error !== null) ctx.addIssue({ code: 'custom', path: ['family'], message: error });
  }, whenValid(['group', 'family']));

export type ApproveSkillRequest = z.output<typeof ApproveSkillRequestSchema>;

/** Body of `POST /api/admin/skills/{id}/merge`: the name becomes an alias of an approved skill. */
export const MergeSkillRequestSchema = z.object({
  rowVersion: RowVersionSchema,
  targetId: z
    .number({ error: 'Chọn kỹ năng để gộp vào' })
    .int()
    .positive({ error: 'Chọn kỹ năng để gộp vào' }),
});

export type MergeSkillRequest = z.output<typeof MergeSkillRequestSchema>;

/**
 * Body of `PATCH /api/admin/skills/{id}/taxonomy` (US-2.7 AC-6): the family and the implied
 * skills of an approved skill. The API checks the family against the stored group. Both fields
 * are required: the patch replaces both, so one left out would be cleared.
 */
export const UpdateSkillTaxonomyRequestSchema = z.object({
  rowVersion: RowVersionSchema,
  family: familySchema(),
  impliesSkillIds: impliesSkillIdsSchema(),
});

export type UpdateSkillTaxonomyRequest = z.output<typeof UpdateSkillTaxonomyRequestSchema>;

/** Body of `POST /api/admin/skills/{id}/reject`. */
export const RejectSkillRequestSchema = z.object({ rowVersion: RowVersionSchema });

export type RejectSkillRequest = z.output<typeof RejectSkillRequestSchema>;
