/**
 * `Content-Disposition: inline` for a download of `fileName` (RFC 6266): an ASCII fallback in
 * `filename`, and the original name (often Vietnamese) in `filename*` per RFC 5987, whose
 * attr-char set excludes `'()*`, so those are percent-encoded too.
 */
export function contentDisposition(fileName: string): string {
  const ascii =
    fileName
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/["\\]/g, '_')
      .trim() || 'file';
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
