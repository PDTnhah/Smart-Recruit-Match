import { z } from 'zod';
import { SKILL_GROUPS, skillMatchKey } from '../contracts/skills.js';
import { SKILL_STATES } from '../states/skill.js';
import { RowVersionSchema } from './common.js';

// Skill catalogue API (FR-13, US-2.5, CONTEXT D39): every signed-in user looks up approved
// skills; ADMIN reviews the new skills the AI found. The web forms validate with these schemas.

export const SKILL_NAME_MAX = 100;

const skillName = () =>
  z
    .string({ error: 'Vui lòng nhập tên kỹ năng' })
    .trim()
    .min(1, { error: 'Vui lòng nhập tên kỹ năng', abort: true })
    .max(SKILL_NAME_MAX, { error: `Tên kỹ năng tối đa ${SKILL_NAME_MAX} ký tự` })
    // A name of separators only has no match key (core.skills.name_key must not be empty).
    .refine((name) => skillMatchKey(name) !== '', { error: 'Tên kỹ năng phải có chữ hoặc số' });

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

export const AdminSkillSchema = z.object({
  id: z.number().int(),
  /** The catalogue name once approved; while pending, the name as the CV or JD wrote it. */
  canonicalName: z.string(),
  aliases: z.array(z.string()),
  group: z.enum(SKILL_GROUPS).nullable(),
  status: z.enum(SKILL_STATES),
  /** The skill a MERGED skill became an alias of. */
  mergedInto: z.object({ id: z.number().int(), canonicalName: z.string() }).nullable(),
  suggestion: SkillSuggestionViewSchema.nullable(),
  rowVersion: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type AdminSkill = z.infer<typeof AdminSkillSchema>;

export const AdminSkillListSchema = z.object({ items: z.array(AdminSkillSchema) });

export type AdminSkillList = z.infer<typeof AdminSkillListSchema>;

/**
 * Body of `POST /api/admin/skills/{id}/approve` (AC-7). A new name that differs from the one the
 * CV or JD wrote keeps that one as an alias.
 */
export const ApproveSkillRequestSchema = z.object({
  rowVersion: RowVersionSchema,
  canonicalName: skillName(),
  group: z.enum(SKILL_GROUPS, { error: 'Chọn nhóm kỹ năng' }),
});

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

/** Body of `POST /api/admin/skills/{id}/reject`. */
export const RejectSkillRequestSchema = z.object({ rowVersion: RowVersionSchema });

export type RejectSkillRequest = z.output<typeof RejectSkillRequestSchema>;
