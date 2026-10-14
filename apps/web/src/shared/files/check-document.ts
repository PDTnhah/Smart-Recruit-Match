import { MAX_UPLOAD_BYTES } from '@srm/shared';

/** 5, for "tối đa 5 MB". */
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

/**
 * Early feedback before an upload of a PDF/DOCX (JD, CV): name and size only. The API decides by
 * the file's content (415) and refuses anything over 5 MB (413), whatever the browser let through.
 */
export function checkDocumentFile(file: File): string | null {
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension !== 'pdf' && extension !== 'docx') return 'Chỉ nhận file PDF hoặc DOCX.';
  if (file.size > MAX_UPLOAD_BYTES) return `File lớn hơn ${MAX_UPLOAD_MB} MB. Chọn file nhỏ hơn.`;
  return null;
}
