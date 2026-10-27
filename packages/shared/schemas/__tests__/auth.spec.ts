import { CreateUserRequestSchema, LoginRequestSchema } from '../auth.js';

const student = { studentCode: 'SV001', major: 'CNTT', cohort: 'K66', gpa: 3.45 };

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('FR-1: login schema', () => {
  it('FR-1: login schema rejects malformed email', () => {
    expect(messages(LoginRequestSchema.safeParse({ email: 'abc', password: 'x' }))).toEqual([
      'Email không hợp lệ',
    ]);
    expect(messages(LoginRequestSchema.safeParse({ email: '  ', password: 'x' }))).toEqual([
      'Vui lòng nhập email',
    ]);
  });

  it('trims and lower-cases the email before checking it', () => {
    expect(LoginRequestSchema.parse({ email: ' A@B.com ', password: 'secret' })).toEqual({
      email: 'a@b.com',
      password: 'secret',
    });
  });

  it('requires a password', () => {
    expect(messages(LoginRequestSchema.safeParse({ email: 'a@b.com', password: '' }))).toEqual([
      'Vui lòng nhập mật khẩu',
    ]);
  });
});

describe('FR-1: admin create-user schema', () => {
  const base = { email: 'new@srm.local', password: 'Password1!', fullName: 'Nguyễn Văn A' };

  it('requires student fields exactly for STUDENT', () => {
    expect(CreateUserRequestSchema.safeParse({ ...base, role: 'STUDENT', student }).success).toBe(true);
    expect(CreateUserRequestSchema.safeParse({ ...base, role: 'CENTER' }).success).toBe(true);
    expect(CreateUserRequestSchema.safeParse({ ...base, role: 'STUDENT' }).success).toBe(false);
    expect(CreateUserRequestSchema.safeParse({ ...base, role: 'ADMIN', student }).success).toBe(false);
  });

  it('lets HR through validation so the service can answer 422', () => {
    expect(CreateUserRequestSchema.safeParse({ ...base, role: 'HR' }).success).toBe(true);
  });

  it('bounds the initial password and the GPA', () => {
    expect(CreateUserRequestSchema.safeParse({ ...base, role: 'CENTER', password: 'short' }).success).toBe(
      false,
    );
    const gpa = (value: number) =>
      CreateUserRequestSchema.safeParse({ ...base, role: 'STUDENT', student: { ...student, gpa: value } })
        .success;
    expect([gpa(0), gpa(10), gpa(3.45), gpa(10.01), gpa(-1), gpa(3.456)]).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});
