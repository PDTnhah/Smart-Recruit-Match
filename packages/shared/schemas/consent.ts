import { z } from 'zod';

// Student consent to the data-processing terms (NFR-2, PRD GĐ2 step 1, US-1.6, CONTEXT D30).
// Consent is per campaign and per terms version; the student always comes from the access token.

/** Body of `POST /api/me/consents`: the campaign and the terms version the student read. */
export const AcceptConsentRequestSchema = z.object({
  campaignId: z.number({ error: 'Chọn đợt thực tập' }).int().positive({ error: 'Chọn đợt thực tập' }),
  termsVersion: z.number().int().positive(),
});

export type AcceptConsentRequest = z.output<typeof AcceptConsentRequestSchema>;

export const ConsentSchema = z.object({
  campaignId: z.number().int(),
  termsVersion: z.number().int(),
  acceptedAt: z.iso.datetime(),
});

export type Consent = z.output<typeof ConsentSchema>;

/** Body of `GET /api/me/consents`: every consent of the caller, and the version now required. */
export const ConsentListSchema = z.object({
  currentTermsVersion: z.number().int(),
  items: z.array(ConsentSchema),
});

export type ConsentList = z.output<typeof ConsentListSchema>;
