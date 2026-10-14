import {
  CreateJdRequestSchema,
  JdListQuerySchema,
  UpdateJdRequestSchema,
  UploadJdFileFieldsSchema,
} from '../job-description.js';

interface Issue {
  path: PropertyKey[];
  message: string;
}

function issuePaths(result: { success: boolean; error?: { issues: Issue[] } }): string[] {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

const validJd = {
  campaignId: 1,
  title: 'Thực tập sinh Backend',
  quota: 3,
  location: 'Hà Nội',
  workMode: 'HYBRID',
  internshipPeriod: '01/2027 – 04/2027',
};

describe('GĐ1: JD form schema (FR-4)', () => {
  it('GĐ1: accepts the FR-4 fields with allowance and description left out', () => {
    expect(CreateJdRequestSchema.parse(validJd)).toEqual(validJd);
  });

  it('GĐ1: trims text fields', () => {
    const parsed = CreateJdRequestSchema.parse({ ...validJd, title: '  Backend  ', allowance: ' 3 triệu ' });
    expect(parsed.title).toBe('Backend');
    expect(parsed.allowance).toBe('3 triệu');
  });

  it.each([0, -1, 1.5, 1001])('GĐ1: quota %p is rejected (positive integer up to 1000)', (quota) => {
    expect(issuePaths(CreateJdRequestSchema.safeParse({ ...validJd, quota }))).toEqual(['quota']);
  });

  it('GĐ1: work mode must be ONSITE, HYBRID or REMOTE', () => {
    expect(issuePaths(CreateJdRequestSchema.safeParse({ ...validJd, workMode: 'ANYWHERE' }))).toEqual(['workMode']);
  });

  it('GĐ1: every required field is reported at once', () => {
    const result = CreateJdRequestSchema.safeParse({ campaignId: 1, title: ' ' });
    expect(issuePaths(result).sort()).toEqual(['internshipPeriod', 'location', 'quota', 'title', 'workMode']);
  });

  it('GĐ1: the body carries no company; an extra companyId is dropped', () => {
    const parsed = CreateJdRequestSchema.parse({ ...validJd, companyId: 99 });
    expect(parsed).not.toHaveProperty('companyId');
  });

  it('GĐ1: a patch needs rowVersion and accepts any subset of fields', () => {
    expect(issuePaths(UpdateJdRequestSchema.safeParse({ title: 'X' }))).toEqual(['rowVersion']);
    expect(UpdateJdRequestSchema.parse({ rowVersion: 2, quota: 5, description: null })).toEqual({
      rowVersion: 2,
      quota: 5,
      description: null,
    });
  });

  it('GĐ1: multipart rowVersion arrives as text and is coerced', () => {
    expect(UploadJdFileFieldsSchema.parse({ rowVersion: '3' })).toEqual({ rowVersion: 3 });
    expect(UploadJdFileFieldsSchema.safeParse({ rowVersion: 'abc' }).success).toBe(false);
    // An empty field must not pass as row_version 0 (a fresh record).
    expect(UploadJdFileFieldsSchema.safeParse({ rowVersion: '' }).success).toBe(false);
    expect(UploadJdFileFieldsSchema.safeParse({ rowVersion: '-1' }).success).toBe(false);
    expect(UploadJdFileFieldsSchema.safeParse({}).success).toBe(false);
  });

  it('GĐ1: list query coerces campaignId and checks status', () => {
    expect(JdListQuerySchema.parse({ campaignId: '7', status: 'PENDING_APPROVAL' })).toEqual({
      campaignId: 7,
      status: 'PENDING_APPROVAL',
    });
    expect(JdListQuerySchema.safeParse({ status: 'WAITING' }).success).toBe(false);
  });
});
