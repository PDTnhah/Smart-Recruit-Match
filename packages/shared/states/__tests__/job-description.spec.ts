import { JOB_DESCRIPTION_STATES, jobDescriptionMachine } from '../job-description.js';
import { mismatchedPairs } from './pairs.js';

// PRD › Vòng đời trạng thái › JD; "Đủ chỉ tiêu | Đóng" are the two exits of RECRUITING.
const PRD_EDGES = [
  ['DRAFT', 'PENDING_HR_CONFIRMATION'],
  ['PENDING_HR_CONFIRMATION', 'PENDING_APPROVAL'],
  ['PENDING_APPROVAL', 'APPROVED'],
  ['APPROVED', 'RECRUITING'],
  ['RECRUITING', 'FILLED'],
  ['RECRUITING', 'CLOSED'],
] as const;

describe('GĐ1: JD machine allows only PRD transitions', () => {
  it('accepts exactly the PRD edges among all state pairs', () => {
    expect(JOB_DESCRIPTION_STATES).toHaveLength(7);
    expect(mismatchedPairs(jobDescriptionMachine, PRD_EDGES)).toEqual([]);
  });

  it('starts in DRAFT; FILLED and CLOSED are terminal', () => {
    expect(jobDescriptionMachine.initial).toBe('DRAFT');
    expect(jobDescriptionMachine.transitions.FILLED).toEqual([]);
    expect(jobDescriptionMachine.transitions.CLOSED).toEqual([]);
  });
});
