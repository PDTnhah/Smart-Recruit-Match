import { AcceptConsentRequestSchema } from '../consent.js';
import { CenterCvListQuerySchema, CvListQuerySchema, SubmitCvFieldsSchema } from '../cv.js';

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

describe('GĐ2: center CV list query (US-2.4 AC-11)', () => {
  it('GĐ2: filters by campaign and attention, pages with defaults', () => {
    expect(CenterCvListQuerySchema.parse({})).toEqual({ limit: 100, offset: 0 });
    expect(CenterCvListQuerySchema.parse({ campaignId: '3', attention: 'true', limit: '20', offset: '40' })).toEqual({
      campaignId: 3,
      attention: 'true',
      limit: 20,
      offset: 40,
    });
  });

  it.each([{ attention: 'yes' }, { attention: '1' }, { limit: '0' }, { limit: '501' }, { offset: '-1' }])(
    'GĐ2: %p is rejected',
    (query) => {
      expect(CenterCvListQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});
