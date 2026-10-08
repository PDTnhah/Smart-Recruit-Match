import {
  AuthSessionSchema,
  CreateUserRequestSchema,
  ListUsersQuerySchema,
  LoginRequestSchema,
  MeSchema,
  UserListSchema,
  UserSummarySchema,
} from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6): the global pipe validates requests with them,
// @ZodResponse serializes responses, and @nestjs/swagger documents both.

export class LoginRequestDto extends createZodDto(LoginRequestSchema) {}
export class AuthSessionDto extends createZodDto(AuthSessionSchema) {}
export class MeDto extends createZodDto(MeSchema) {}
export class CreateUserRequestDto extends createZodDto(CreateUserRequestSchema) {}
export class UserSummaryDto extends createZodDto(UserSummarySchema) {}
export class ListUsersQueryDto extends createZodDto(ListUsersQuerySchema) {}
export class UserListDto extends createZodDto(UserListSchema) {}
