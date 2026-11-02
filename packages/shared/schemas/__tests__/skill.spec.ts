import { MAX_IMPLIED_SKILLS } from '../../contracts/skills.js';
import {
  AdminSkillListQuerySchema,
  ApproveSkillRequestSchema,
  MergeSkillRequestSchema,
  SkillSearchQuerySchema,
  UpdateSkillTaxonomyRequestSchema,
} from '../skill.js';

describe('FR-13: skill catalogue requests (US-2.5)', () => {
  it('approve trims the catalogue name and needs a group', () => {
    expect(ApproveSkillRequestSchema.parse({ rowVersion: 0, canonicalName: '  React Native ', group: 'FRAMEWORK' })).toEqual({
      rowVersion: 0,
      canonicalName: 'React Native',
      group: 'FRAMEWORK',
      family: null,
      impliesSkillIds: [],
    });
    const noGroup = ApproveSkillRequestSchema.safeParse({ rowVersion: 0, canonicalName: 'Go' });
    expect(noGroup.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['group', 'Chọn nhóm kỹ năng'],
    ]);
  });

  it.each([
    ['', 'Vui lòng nhập tên kỹ năng'],
    [' .-/ ', 'Tên kỹ năng phải có chữ hoặc số'],
    ['x'.repeat(101), 'Tên kỹ năng tối đa 100 ký tự'],
  ])('approve rejects the name %j', (canonicalName, message) => {
    const result = ApproveSkillRequestSchema.safeParse({ rowVersion: 0, canonicalName, group: 'OTHER' });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([message]);
  });

  it('merge needs a target id', () => {
    expect(MergeSkillRequestSchema.safeParse({ rowVersion: 1 }).error?.issues[0]?.message).toBe('Chọn kỹ năng để gộp vào');
  });

  it('lists pending skills by default; search limit within 1..50, 20 by default', () => {
    expect(AdminSkillListQuerySchema.parse({})).toEqual({ status: 'PENDING' });
    expect(SkillSearchQuerySchema.parse({ query: ' react ' })).toEqual({ query: 'react', limit: 20 });
    expect(SkillSearchQuerySchema.parse({ limit: '5' }).limit).toBe(5);
    expect(SkillSearchQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });
});

const issuesOf = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map((issue) => [issue.path.join('.'), issue.message]);

describe('FR-39: skill taxonomy requests (US-2.7)', () => {
  it('AC-5 approve takes a family and implied skills', () => {
    const body = { rowVersion: 2, canonicalName: 'Next.js', group: 'FRAMEWORK', family: 'META_FRAMEWORK', impliesSkillIds: [7] };
    expect(ApproveSkillRequestSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['DATABASE', 'TEAMWORK', 'Năng lực mềm chỉ dành cho nhóm Kỹ năng mềm'],
    ['SOFT_SKILL', 'RELATIONAL_DB', 'Kỹ năng mềm phải thuộc một năng lực mềm'],
  ])('AC-5 a %s skill cannot take family %s, shown even when the name is invalid', (group, family, message) => {
    const result = ApproveSkillRequestSchema.safeParse({ rowVersion: 0, canonicalName: '', group, family });
    expect(issuesOf(result)).toEqual([
      ['canonicalName', 'Vui lòng nhập tên kỹ năng'],
      ['family', message],
    ]);
  });

  it('AC-5 implied skills: positive ids, each once, at most MAX_IMPLIED_SKILLS', () => {
    const approve = (impliesSkillIds: number[]) =>
      ApproveSkillRequestSchema.safeParse({ rowVersion: 0, canonicalName: 'Go', group: 'LANGUAGE', impliesSkillIds });
    expect(issuesOf(approve([3, 3]))).toEqual([['impliesSkillIds', 'Mỗi kỹ năng kéo theo chỉ chọn một lần']]);
    const tooMany = Array.from({ length: MAX_IMPLIED_SKILLS + 1 }, (_, i) => i + 1);
    expect(issuesOf(approve(tooMany))).toEqual([['impliesSkillIds', `Chọn tối đa ${MAX_IMPLIED_SKILLS} kỹ năng kéo theo`]]);
    expect(approve([0]).success).toBe(false);
  });

  it('AC-6 the taxonomy patch requires both the family and the implied skills, since it replaces both', () => {
    const cleared = { rowVersion: 4, family: null, impliesSkillIds: [] };
    expect(UpdateSkillTaxonomyRequestSchema.parse(cleared)).toEqual(cleared);
    expect(UpdateSkillTaxonomyRequestSchema.safeParse({ rowVersion: 4 }).success).toBe(false);
    expect(UpdateSkillTaxonomyRequestSchema.safeParse({ rowVersion: 4, family: null }).success).toBe(false);
    expect(UpdateSkillTaxonomyRequestSchema.safeParse({ rowVersion: 4, impliesSkillIds: [] }).success).toBe(false);
    expect(UpdateSkillTaxonomyRequestSchema.safeParse({ ...cleared, family: 'NOT_A_FAMILY' }).success).toBe(false);
  });

  it('AC-10 the admin list filters by zone', () => {
    expect(AdminSkillListQuerySchema.parse({ status: 'APPROVED', zone: 'DATABASE' })).toEqual({ status: 'APPROVED', zone: 'DATABASE' });
    expect(AdminSkillListQuerySchema.safeParse({ zone: 'BACK_END' }).success).toBe(false);
  });
});
