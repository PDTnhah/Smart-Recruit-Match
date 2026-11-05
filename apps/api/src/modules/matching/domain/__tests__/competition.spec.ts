import { type CompetitionThresholds, DEFAULT_CAMPAIGN_CONFIG } from '@srm/shared';
import fc from 'fast-check';
import { competitionLevel, isLowPreferenceJd, jdCompetition } from '../competition.js';

const DEFAULT: CompetitionThresholds = DEFAULT_CAMPAIGN_CONFIG.competition_thresholds;

describe('GĐ4 competition level (FR-17, US-3.4 AC-1)', () => {
  it('GĐ4 competition level boundaries with integer comparison', () => {
    // Quota 4 with { 1, 3 }: LOW below 4 preferences, HIGH from 12.
    expect(competitionLevel(0, 4, DEFAULT)).toBe('LOW');
    expect(competitionLevel(3, 4, DEFAULT)).toBe('LOW');
    expect(competitionLevel(4, 4, DEFAULT)).toBe('MEDIUM');
    expect(competitionLevel(11, 4, DEFAULT)).toBe('MEDIUM');
    expect(competitionLevel(12, 4, DEFAULT)).toBe('HIGH');
    expect(competitionLevel(40, 4, DEFAULT)).toBe('HIGH');
  });

  it('GĐ4 a ratio equal to a threshold takes the higher level', () => {
    expect(competitionLevel(1, 1, DEFAULT)).toBe('MEDIUM');
    expect(competitionLevel(3, 1, DEFAULT)).toBe('HIGH');
  });

  it('GĐ4 decimal thresholds compare exactly, without floating-point drift', () => {
    const thresholds = { low_below: 1.5, high_from: 2.3 };
    // 3 / 2 = 1.5 exactly: MEDIUM; 2.3 × 10 = 23 exactly: HIGH, although 2.3 * 10 is 22.999… in floats.
    expect(competitionLevel(2, 2, thresholds)).toBe('LOW');
    expect(competitionLevel(3, 2, thresholds)).toBe('MEDIUM');
    expect(competitionLevel(22, 10, thresholds)).toBe('MEDIUM');
    expect(competitionLevel(23, 10, thresholds)).toBe('HIGH');
    expect(competitionLevel(7, 100, { low_below: 0.07, high_from: 0.5 })).toBe('MEDIUM');
  });

  it('GĐ4 a quota below 1, or counts that are not whole, are refused', () => {
    expect(() => competitionLevel(1, 0, DEFAULT)).toThrow(RangeError);
    expect(() => competitionLevel(1, 1.5, DEFAULT)).toThrow(RangeError);
    expect(() => competitionLevel(-1, 2, DEFAULT)).toThrow(RangeError);
    expect(() => isLowPreferenceJd(0, 0)).toThrow(RangeError);
  });

  it('GĐ4 jdCompetition carries the count, the quota and the level', () => {
    expect(jdCompetition(5, 2, DEFAULT)).toEqual({ nvCount: 5, quota: 2, level: 'MEDIUM' });
  });

  it('FR-17 a JD with fewer preferences than places is reported to the center', () => {
    expect(isLowPreferenceJd(0, 1)).toBe(true);
    expect(isLowPreferenceJd(2, 3)).toBe(true);
    expect(isLowPreferenceJd(3, 3)).toBe(false);
    expect(isLowPreferenceJd(9, 3)).toBe(false);
  });

  it('GĐ4 property: more preferences never lower the level, and the level matches the ratio', () => {
    const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
    const hundredths = fc.integer({ min: 1, max: 10_000 });
    const thresholds = fc
      .tuple(hundredths, hundredths)
      .filter(([a, b]) => a !== b)
      .map(([a, b]): CompetitionThresholds => ({ low_below: Math.min(a, b) / 100, high_from: Math.max(a, b) / 100 }));
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5_000 }), fc.integer({ min: 1, max: 500 }), thresholds, (nvCount, quota, t) => {
        const level = competitionLevel(nvCount, quota, t);
        expect(rank[competitionLevel(nvCount + 1, quota, t)]).toBeGreaterThanOrEqual(rank[level]);
        // Same answer as exact rational comparison: nvCount / quota against p / 100.
        const below = (p: number) => nvCount * 100 < Math.round(p * 100) * quota;
        const expected = below(t.low_below) ? 'LOW' : below(t.high_from) ? 'MEDIUM' : 'HIGH';
        expect(level).toBe(expected);
      }),
    );
  });
});
