import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type FileOwnerType, FileIdParamSchema, type FileUrl, FileUrlSchema } from '@srm/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Roles } from '../auth/index.js';
import { FileAccessRegistry } from './file-access.registry.js';
import { StorageService } from './storage.service.js';

class FileIdParamDto extends createZodDto(FileIdParamSchema) {}
class FileUrlDto extends createZodDto(FileUrlSchema) {}

/**
 * `GET /api/files/{id}/url` (ARCHITECTURE › API architecture): a presigned URL valid for 5
 * minutes, for files the caller may see. `{id}` is `<owner>:<record id>` (CONTEXT D28). The owning
 * module's resolver applies record-level access: a student reaches only their own CV versions
 * (US-1.6, CONTEXT D30).
 */
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(
    private readonly registry: FileAccessRegistry,
    private readonly storage: StorageService,
  ) {}

  @Roles('HR', 'CENTER', 'STUDENT')
  @Get(':id/url')
  @Header('Cache-Control', 'no-store')
  @ZodResponse({ status: 200, type: FileUrlDto })
  async url(@CurrentUser() user: AuthUser, @Param() { id }: FileIdParamDto): Promise<FileUrl> {
    // FileIdSchema guarantees `<owner>:<positive integer>`.
    const [owner, ownerId] = id.split(':') as [FileOwnerType, string];
    const file = await this.registry.resolve(user, owner, Number(ownerId));
    const signed = await this.storage.presignGet(file.bucket, file.key, { fileName: file.fileName });
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }
}
