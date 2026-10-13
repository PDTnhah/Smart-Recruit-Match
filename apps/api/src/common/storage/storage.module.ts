import { Global, Module } from '@nestjs/common';
import { loadEnv } from '../config/env.js';
import { FileAccessRegistry } from './file-access.registry.js';
import { FilesController } from './files.controller.js';
import { STORAGE_CONFIG, storageConfigFromEnv } from './storage.config.js';
import { StorageService } from './storage.service.js';

/** Global so the company (JD) and student (CV) modules can store files and register resolvers. */
@Global()
@Module({
  controllers: [FilesController],
  providers: [
    { provide: STORAGE_CONFIG, useFactory: () => storageConfigFromEnv(loadEnv()) },
    StorageService,
    FileAccessRegistry,
  ],
  exports: [StorageService, FileAccessRegistry],
})
export class StorageModule {}
