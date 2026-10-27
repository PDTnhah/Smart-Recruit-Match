export { StorageModule } from './storage.module.js';
export { type PresignedUrl, StorageService } from './storage.service.js';
export { FileAccessRegistry, type FileResolver, type StoredFile } from './file-access.registry.js';
export {
  type Bucket,
  BUCKETS,
  createS3Client,
  STORAGE_CONFIG,
  type StorageConfig,
  storageConfigFromEnv,
} from './storage.config.js';
export {
  type DetectedDocument,
  detectDocument,
  displayFileName,
  type DocumentExtension,
  DOCUMENT_TYPES,
  requireFile,
  SingleFileUpload,
  type UploadedFileLike,
} from './upload-validation.js';
