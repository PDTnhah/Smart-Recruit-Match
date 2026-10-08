import { z } from 'zod';
import { ROLES } from './roles.js';

// Login, session and account schemas (FR-1, CONTEXT D25). The web form and the API
// validate with the same schema, so messages are user-facing Vietnamese strings.

/** Access token lifetime: 15 minutes (ARCHITECTURE › Security architecture). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Trimmed and lower-cased before the format check; `users.email` has a lowercase CHECK. */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: 'Vui lòng nhập email', abort: true })
  .max(254, { error: 'Email quá dài' })
  .email({ error: 'Email không hợp lệ' });

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z
    .string()
    .min(1, { error: 'Vui lòng nhập mật khẩu' })
    .max(128, { error: 'Mật khẩu quá dài' }),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** The signed-in account, as returned by `GET /api/me` and inside every session response. */
export const MeSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  fullName: z.string().nullable(),
  role: z.enum(ROLES),
  companyId: z.number().int().nullable(),
  studentId: z.number().int().nullable(),
});

export type Me = z.infer<typeof MeSchema>;

/** Body of `POST /api/auth/login` and `POST /api/auth/refresh`; the refresh token travels only in a cookie. */
export const AuthSessionSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  user: MeSchema,
});

export type AuthSession = z.infer<typeof AuthSessionSchema>;

/** Initial password an ADMIN types when creating an account (CONTEXT D25). */
export const NewPasswordSchema = z
  .string()
  .min(8, { error: 'Mật khẩu cần ít nhất 8 ký tự' })
  .max(128, { error: 'Mật khẩu tối đa 128 ký tự' });

export const StudentProfileInputSchema = z.object({
  studentCode: z.string().trim().min(1, { error: 'Vui lòng nhập mã sinh viên' }).max(32),
  major: z.string().trim().min(1, { error: 'Vui lòng nhập ngành' }).max(200),
  cohort: z.string().trim().min(1, { error: 'Vui lòng nhập khóa' }).max(32),
  gpa: z
    .number()
    .min(0, { error: 'GPA phải từ 0 đến 10' })
    .max(10, { error: 'GPA phải từ 0 đến 10' })
    .multipleOf(0.01, { error: 'GPA có tối đa hai chữ số thập phân' }),
});

export type StudentProfileInput = z.infer<typeof StudentProfileInputSchema>;

/**
 * Body of `POST /api/admin/users`. A flat object rather than a union: HR must reach the
 * service and get 422 ROLE_NOT_ALLOWED (HR joins only by invitation, US-1.5), not a 400.
 */
export const CreateUserRequestSchema = z
  .object({
    role: z.enum(ROLES),
    email: EmailSchema,
    password: NewPasswordSchema,
    fullName: z.string().trim().min(1, { error: 'Vui lòng nhập họ tên' }).max(200),
    student: StudentProfileInputSchema.optional(),
  })
  .refine((body) => (body.role === 'STUDENT') === (body.student !== undefined), {
    error: 'Thông tin sinh viên chỉ đi kèm và bắt buộc với vai trò STUDENT',
    path: ['student'],
  });

export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UserSummarySchema = z.object({
  id: z.number().int(),
  email: z.string(),
  fullName: z.string().nullable(),
  role: z.enum(ROLES),
  companyId: z.number().int().nullable(),
  studentId: z.number().int().nullable(),
  isActive: z.boolean(),
});

export type UserSummary = z.infer<typeof UserSummarySchema>;

export const ListUsersQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export const UserListSchema = z.object({ items: z.array(UserSummarySchema) });

export type UserList = z.infer<typeof UserListSchema>;
