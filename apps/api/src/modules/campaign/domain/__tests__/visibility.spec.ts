import type { CampaignStatus } from '@srm/shared';
import { canSeeCampaign, type CampaignViewer } from '../visibility.js';

const target = { cohorts: ['K66', 'K67'], majors: ['CNTT'] };
const campaign = (status: CampaignStatus) => ({ status, target });
const student = (cohort: string | null, major: string | null): CampaignViewer => ({
  role: 'STUDENT',
  audience: { cohort, major },
});

describe('FR-2: campaign read scope (CONTEXT D27)', () => {
  it('FR-2: CENTER and ADMIN see every campaign, drafts included', () => {
    expect(canSeeCampaign({ role: 'CENTER' }, campaign('DRAFT'))).toBe(true);
    expect(canSeeCampaign({ role: 'ADMIN' }, campaign('DRAFT'))).toBe(true);
  });

  it('FR-2: HR sees every campaign that has left DRAFT', () => {
    expect(canSeeCampaign({ role: 'HR' }, campaign('DRAFT'))).toBe(false);
    expect(canSeeCampaign({ role: 'HR' }, campaign('INTAKE'))).toBe(true);
    expect(canSeeCampaign({ role: 'HR' }, campaign('CLOSED'))).toBe(true);
  });

  it('FR-2: a student sees an open campaign whose target lists both their cohort and major', () => {
    expect(canSeeCampaign(student('K67', 'CNTT'), campaign('INTAKE'))).toBe(true);
    expect(canSeeCampaign(student(' k67 ', 'cntt'), campaign('INTAKE'))).toBe(true);
  });

  it('FR-2: a student does not see drafts or campaigns for another cohort or major', () => {
    expect(canSeeCampaign(student('K67', 'CNTT'), campaign('DRAFT'))).toBe(false);
    expect(canSeeCampaign(student('K65', 'CNTT'), campaign('INTAKE'))).toBe(false);
    expect(canSeeCampaign(student('K67', 'Kinh tế'), campaign('INTAKE'))).toBe(false);
  });

  it('FR-2: a student without cohort, major or student record sees nothing', () => {
    expect(canSeeCampaign(student(null, 'CNTT'), campaign('INTAKE'))).toBe(false);
    expect(canSeeCampaign(student('K67', null), campaign('INTAKE'))).toBe(false);
    expect(canSeeCampaign({ role: 'STUDENT', audience: null }, campaign('INTAKE'))).toBe(false);
  });
});
