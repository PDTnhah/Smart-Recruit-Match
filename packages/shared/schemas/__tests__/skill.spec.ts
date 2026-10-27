import {
  AdminSkillListQuerySchema,
  ApproveSkillRequestSchema,
  MergeSkillRequestSchema,
  SkillSearchQuerySchema,
} from '../skill.js';

describe('FR-13: skill catalogue requests (US-2.5)', () => {
  it('approve trims the catalogue name and needs a group', () => {
    expect(ApproveSkillRequestSchema.parse({ rowVersion: 0, canonicalName: '  React Native ', group: 'FRAMEWORK' })).toEqual({
      rowVersion: 0,
      canonicalName: 'React Native',
      group: 'FRAMEWORK',
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
