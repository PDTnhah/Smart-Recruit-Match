/**
 * Free text compared ignoring case and extra spaces ("cntt" = " CNTT "), and however the accents
 * were typed: Unikey's composed and decomposed forms read alike (NFC). Campaign cohorts and majors,
 * major groups and the foreign-language reader all compare with it. Exported once, through
 * `schemas/campaign.ts`.
 */
export function normalizeAudienceValue(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}
