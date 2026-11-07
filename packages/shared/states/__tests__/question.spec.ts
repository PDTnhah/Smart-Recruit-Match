import { QUESTION_BANK_STATES, questionBankMachine } from '../question-bank.js';
import { QUESTION_STATES, questionMachine } from '../question.js';
import { mismatchedPairs } from './pairs.js';

// PRD GĐ5 bước 2–4, US-4.2 AC-5, AC-6, CONTEXT D50: the Validator's verdict moves a draft once; a
// validated question may be retired later; CENTER locks the bank once and for good.
const QUESTION_EDGES = [
  ['DRAFT', 'VALIDATED'],
  ['DRAFT', 'REJECTED'],
  ['VALIDATED', 'RETIRED'],
] as const;

describe('GĐ5: question machine allows only listed transitions', () => {
  it('GĐ5 accepts exactly the listed edges among all state pairs', () => {
    expect(QUESTION_STATES).toHaveLength(4);
    expect(mismatchedPairs(questionMachine, QUESTION_EDGES)).toEqual([]);
  });

  it('GĐ5 a question starts DRAFT; rejected and retired questions never come back', () => {
    expect(questionMachine.initial).toBe('DRAFT');
    expect(questionMachine.transitions.REJECTED).toEqual([]);
    expect(questionMachine.transitions.RETIRED).toEqual([]);
  });
});

describe('GĐ5: question bank machine locks once', () => {
  it('GĐ5 OPEN -> LOCKED is the only transition', () => {
    expect(QUESTION_BANK_STATES).toEqual(['OPEN', 'LOCKED']);
    expect(mismatchedPairs(questionBankMachine, [['OPEN', 'LOCKED']])).toEqual([]);
    expect(questionBankMachine.initial).toBe('OPEN');
  });

  it('GĐ5 the machine name is the audit entity of the bank', () => {
    expect(questionBankMachine.name).toBe('question_bank');
  });
});
