import type { ExamBlueprint } from '@srm/shared';
import type { DrawableBank } from '../domain/drawable-bank.js';
import { DrawableBankCache } from './drawable-bank-cache.js';
import type { QuestionBankService } from './question-bank.service.js';

// US-4.3 performance budget (NFR-9, CONTEXT D51): students starting together read a bank once.

const blueprint = { duration_minutes: 45 } as unknown as ExamBlueprint;

function bankAt(version: number): DrawableBank {
  return {
    bankId: 3,
    version,
    blueprint,
    questions: [
      { id: 11, type: 'MCQ', skill: 'SQL', difficulty: 'EASY', content: { options: ['a', 'b', 'c', 'd'] } },
      { id: 12, type: 'ESSAY', skill: 'SQL', difficulty: 'HARD', content: {} },
    ] as unknown as DrawableBank['questions'],
  };
}

function setup(load: () => Promise<DrawableBank>) {
  const getDrawableQuestions = jest.fn(load);
  const cache = new DrawableBankCache({ getDrawableQuestions } as unknown as QuestionBankService);
  return { cache, getDrawableQuestions };
}

describe('NFR-9 drawable bank cache (US-4.3)', () => {
  it('NFR-9 concurrent starts share one read; the result carries no content', async () => {
    let release!: (bank: DrawableBank) => void;
    const { cache, getDrawableQuestions } = setup(() => new Promise((resolve) => (release = resolve)));
    const reads = Array.from({ length: 200 }, () => cache.get(3, 2));
    release(bankAt(2));
    const banks = await Promise.all(reads);
    expect(getDrawableQuestions).toHaveBeenCalledTimes(1);
    expect(new Set(banks).size).toBe(1);
    expect(banks[0]).toEqual({
      bankId: 3,
      version: 2,
      blueprint,
      candidates: [
        { id: 11, type: 'MCQ', skill: 'SQL', difficulty: 'EASY', optionCount: 4 },
        { id: 12, type: 'ESSAY', skill: 'SQL', difficulty: 'HARD', optionCount: 0 },
      ],
    });
    await cache.get(3, 2);
    expect(getDrawableQuestions).toHaveBeenCalledTimes(1);
  });

  it('NFR-9 a bank that moved on is kept under the version read', async () => {
    const { cache, getDrawableQuestions } = setup(() => Promise.resolve(bankAt(3)));
    expect((await cache.get(3, 2)).version).toBe(3);
    expect((await cache.get(3, 3)).version).toBe(3);
    expect(getDrawableQuestions).toHaveBeenCalledTimes(1);
    // The stale version is not kept: asked again, it reads the bank again.
    await cache.get(3, 2);
    expect(getDrawableQuestions).toHaveBeenCalledTimes(2);
  });

  it('NFR-9 a failed read is not kept', async () => {
    const { cache, getDrawableQuestions } = setup(() => Promise.reject(new Error('BANK_NOT_LOCKED')));
    await expect(cache.get(3, 2)).rejects.toThrow('BANK_NOT_LOCKED');
    getDrawableQuestions.mockResolvedValueOnce(bankAt(2));
    expect((await cache.get(3, 2)).version).toBe(2);
    expect(getDrawableQuestions).toHaveBeenCalledTimes(2);
  });
});
