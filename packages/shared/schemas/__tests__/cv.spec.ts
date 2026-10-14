import { AcceptConsentRequestSchema } from '../consent.js';
import { CvListQuerySchema, SubmitCvFieldsSchema } from '../cv.js';

describe('GĐ2: CV submission fields (FR-6)', () => {
  it('GĐ2: campaignId arrives as a multipart text field and becomes a number', () => {
    expect(SubmitCvFieldsSchema.parse({ campaignId: ' 42 ' })).toEqual({ campaignId: 42 });
  });

  it.each(['', '0', '-1', '1.5', 'abc', '12345678901'])('GĐ2: campaignId %p is rejected', (campaignId) => {
    expect(SubmitCvFieldsSchema.safeParse({ campaignId }).success).toBe(false);
  });

  it('GĐ2: a missing campaignId is rejected', () => {
    expect(SubmitCvFieldsSchema.safeParse({}).success).toBe(false);
  });

  it('GĐ2: the list query filters by campaign or not at all', () => {
    expect(CvListQuerySchema.parse({})).toEqual({});
    expect(CvListQuerySchema.parse({ campaignId: '7' })).toEqual({ campaignId: 7 });
    expect(CvListQuerySchema.safeParse({ campaignId: '0' }).success).toBe(false);
  });
});

describe('NFR-2: consent request', () => {
  it('NFR-2: names the campaign and the terms version read', () => {
    expect(AcceptConsentRequestSchema.parse({ campaignId: 3, termsVersion: 1 })).toEqual({
      campaignId: 3,
      termsVersion: 1,
    });
  });

  it.each([
    { campaignId: 0, termsVersion: 1 },
    { campaignId: 3, termsVersion: 0 },
    { campaignId: 3 },
    { termsVersion: 1 },
  ])('NFR-2: %p is rejected', (body) => {
    expect(AcceptConsentRequestSchema.safeParse(body).success).toBe(false);
  });
});
