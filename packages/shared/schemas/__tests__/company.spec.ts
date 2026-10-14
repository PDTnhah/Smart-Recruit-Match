import {
  CreateCompanyRequestSchema,
  invitationPath,
  InviteHrRequestSchema,
  UpdateCompanyRequestSchema,
} from '../company.js';
import { FileIdSchema, fileId } from '../files.js';

describe('FR-3: company and invitation schemas', () => {
  it('FR-3: a company needs a name; other fields are optional', () => {
    expect(CreateCompanyRequestSchema.parse({ name: ' Công ty A ' })).toEqual({ name: 'Công ty A' });
    expect(CreateCompanyRequestSchema.safeParse({ name: '  ' }).success).toBe(false);
  });

  it('FR-3: contact email may be empty but must be valid when given', () => {
    expect(CreateCompanyRequestSchema.safeParse({ name: 'A', contact: { email: '' } }).success).toBe(true);
    expect(CreateCompanyRequestSchema.safeParse({ name: 'A', contact: { email: 'not-an-email' } }).success).toBe(false);
    expect(CreateCompanyRequestSchema.parse({ name: 'A', contact: { email: ' HR@Example.COM ' } }).contact).toEqual({
      email: 'hr@example.com',
    });
  });

  it('FR-3: a company patch accepts null to clear a field', () => {
    expect(UpdateCompanyRequestSchema.parse({ address: null })).toEqual({ address: null });
  });

  it('FR-3: an invitation needs a valid email and a name; the email is lower-cased', () => {
    expect(InviteHrRequestSchema.parse({ email: 'HR@A.vn', fullName: 'Nguyễn Văn B' })).toEqual({
      email: 'hr@a.vn',
      fullName: 'Nguyễn Văn B',
    });
    expect(InviteHrRequestSchema.safeParse({ email: 'hr@a.vn', fullName: '' }).success).toBe(false);
  });

  it('FR-3: the invitation token goes in the URL fragment', () => {
    expect(invitationPath('abc.def.ghi')).toBe('/accept-invitation#abc.def.ghi');
  });
});

describe('GĐ1: file ids', () => {
  it.each(['jd:1', 'jd:12', 'cv:457'])('GĐ1: %p is a valid file id', (id) => {
    expect(FileIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(['jd:0', 'jd:-1', 'jd:01', 'report:1', 'jd:', 'jd:1:2', '12'])('GĐ1: %p is rejected', (id) => {
    expect(FileIdSchema.safeParse(id).success).toBe(false);
  });

  it('GĐ1: fileId builds the same format', () => {
    expect(fileId('jd', 12)).toBe('jd:12');
  });
});
