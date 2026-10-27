import { Injectable } from '@nestjs/common';
import type { FileOwnerType } from '@srm/shared';
import type { AuthUser } from '../auth/index.js';
import { EntityNotFoundError } from '../errors/index.js';
import type { Bucket } from './storage.config.js';

/** Where a record's original file lives. */
export interface StoredFile {
  bucket: Bucket;
  key: string;
  fileName: string;
}

/**
 * Returns the caller's file of record `ownerId`, applying the record-level access of the owning
 * module. Throws EntityNotFoundError (404) when the record is missing, out of scope or has no file.
 */
export type FileResolver = (user: AuthUser, ownerId: number) => Promise<StoredFile>;

/**
 * Maps a file id (`jd:12`, `cv:457`) to its object, CONTEXT D28. Each module registers the owner
 * type it holds (company → `jd`, US-1.6 → `cv`) at startup, so `common/storage` never imports a
 * business module (AGENTS › Invariant 13).
 */
@Injectable()
export class FileAccessRegistry {
  private readonly resolvers = new Map<FileOwnerType, FileResolver>();

  register(owner: FileOwnerType, resolver: FileResolver): void {
    if (this.resolvers.has(owner)) throw new Error(`file owner type ${owner} is already registered`);
    this.resolvers.set(owner, resolver);
  }

  resolve(user: AuthUser, owner: FileOwnerType, ownerId: number): Promise<StoredFile> {
    const resolver = this.resolvers.get(owner);
    if (!resolver) return Promise.reject(new EntityNotFoundError('file', ownerId));
    return resolver(user, ownerId);
  }
}
