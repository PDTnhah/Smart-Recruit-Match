import { CAMPAIGN_STATES, type CampaignStatus, JOB_DESCRIPTION_STATES, type JobDescriptionStatus } from '@srm/shared';
import {
  canConfirm,
  decideRequirementsEdit,
  editModeOf,
  REQUIREMENTS_REASON_CODES,
  type RequirementsEditor,
} from '../requirements-versioning.js';

const decide = (jdStatus: JobDescriptionStatus, campaignStatus: CampaignStatus, editor: RequirementsEditor) =>
  decideRequirementsEdit({ jdStatus, campaignStatus, editor });

const OPEN_CAMPAIGN_PHASES = CAMPAIGN_STATES.filter((status) => status !== 'CLOSED');

describe('BR-18: editing requirements after approval creates a new version (US-2.3 AC-11)', () => {
  it.each(OPEN_CAMPAIGN_PHASES.flatMap((phase) => [['APPROVED', phase] as const, ['RECRUITING', phase] as const]))(
    'BR-18 sửa sau khi mở test tạo phiên bản mới: JD %s, đợt %s',
    (jdStatus, campaignStatus) => {
      expect(decide(jdStatus, campaignStatus, 'HR')).toEqual({ kind: 'NEW_VERSION' });
      expect(decide(jdStatus, campaignStatus, 'CENTER')).toEqual({ kind: 'NEW_VERSION' });
    },
  );

  it('BR-18 sửa trước khi mở test không tăng phiên bản: HR, JD chờ xác nhận, đợt INTAKE', () => {
    expect(decide('PENDING_HR_CONFIRMATION', 'INTAKE', 'HR')).toEqual({ kind: 'IN_PLACE' });
  });

  it('BR-18 a closed campaign or JD is read only', () => {
    expect(decide('APPROVED', 'CLOSED', 'CENTER')).toEqual({ kind: 'FORBIDDEN', reasonCode: REQUIREMENTS_REASON_CODES.CLOSED });
    expect(decide('FILLED', 'ALLOCATION_REVIEW', 'HR')).toEqual({ kind: 'FORBIDDEN', reasonCode: REQUIREMENTS_REASON_CODES.CLOSED });
    expect(decide('CLOSED', 'SUPPLEMENTARY', 'HR')).toEqual({ kind: 'FORBIDDEN', reasonCode: REQUIREMENTS_REASON_CODES.CLOSED });
  });
});

describe('BR-02: HR confirms, the center reads (US-2.3 AC-8, AC-9)', () => {
  it('BR-02 the center cannot edit requirements awaiting HR confirmation', () => {
    expect(decide('PENDING_HR_CONFIRMATION', 'INTAKE', 'CENTER')).toEqual({
      kind: 'FORBIDDEN',
      reasonCode: REQUIREMENTS_REASON_CODES.CONFIRMED_BY_HR,
    });
  });

  it.each(CAMPAIGN_STATES.filter((status) => status !== 'INTAKE'))(
    'GĐ1 HR edits before confirmation only while the campaign takes JDs, not in %s',
    (campaignStatus) => {
      expect(decide('PENDING_HR_CONFIRMATION', campaignStatus, 'HR')).toEqual({
        kind: 'FORBIDDEN',
        reasonCode: REQUIREMENTS_REASON_CODES.CAMPAIGN_NOT_IN_INTAKE,
      });
    },
  );

  it('GĐ1 a draft has no requirements to edit yet', () => {
    expect(decide('DRAFT', 'INTAKE', 'HR')).toEqual({ kind: 'FORBIDDEN', reasonCode: REQUIREMENTS_REASON_CODES.NOT_SUBMITTED });
  });

  it('GĐ1 a JD awaiting approval is read only: there is no edge back to HR', () => {
    for (const editor of ['HR', 'CENTER'] as const) {
      expect(decide('PENDING_APPROVAL', 'INTAKE', editor)).toEqual({
        kind: 'FORBIDDEN',
        reasonCode: REQUIREMENTS_REASON_CODES.AWAITING_APPROVAL,
      });
    }
  });

  it('BR-18 every JD state has a decision for every campaign phase and editor', () => {
    for (const jdStatus of JOB_DESCRIPTION_STATES) {
      for (const campaignStatus of CAMPAIGN_STATES) {
        for (const editor of ['HR', 'CENTER'] as const) {
          expect(['IN_PLACE', 'NEW_VERSION', 'FORBIDDEN']).toContain(decide(jdStatus, campaignStatus, editor).kind);
        }
      }
    }
  });

  it('BR-02 only HR confirms, and only a JD awaiting confirmation', () => {
    expect(canConfirm(decide('PENDING_HR_CONFIRMATION', 'INTAKE', 'HR'), 'PENDING_HR_CONFIRMATION')).toBe(true);
    expect(canConfirm(decide('PENDING_HR_CONFIRMATION', 'INTAKE', 'CENTER'), 'PENDING_HR_CONFIRMATION')).toBe(false);
    expect(canConfirm(decide('APPROVED', 'TESTING', 'HR'), 'APPROVED')).toBe(false);
  });

  it('GĐ1 edit modes shown to the screen', () => {
    expect(editModeOf({ kind: 'IN_PLACE' })).toBe('IN_PLACE');
    expect(editModeOf({ kind: 'NEW_VERSION' })).toBe('NEW_VERSION');
    expect(editModeOf(decide('DRAFT', 'INTAKE', 'HR'))).toBe('READ_ONLY');
  });
});
