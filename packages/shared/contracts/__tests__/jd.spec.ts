import {
  JdAnalysisSchema,
  JdAnalyzeOutputSchema,
  JdRequirementsSchema,
  type JdRequirements,
  SaveJdRequirementsRequestSchema,
  skillKey,
} from '../../index.js';

const requirements = (): JdRequirements => ({
  must_have: [
    { skill: 'Java', level: 'INTERMEDIATE', weight: 3 },
    { skill: 'Spring Boot', level: 'BASIC', weight: 2 },
  ],
  nice_to_have: [{ skill: 'Docker', level: 'BASIC', weight: 1 }],
  hard_conditions: {
    majors: ['Công nghệ thông tin'],
    min_study_year: 3,
    min_gpa: 2.5,
    required_languages: ['Tiếng Anh (TOEIC 550)'],
  },
});

/** Paths of the issues a parse reports, as `a.0.b` strings. */
function issuePaths(input: unknown): string[] {
  const result = JdRequirementsSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('FR-9 JdRequirements: one schema for the LLM output, the HR form and the API (AD-6)', () => {
  it('GĐ1 nhận yêu cầu đầy đủ: kỹ năng có mức độ và trọng số, điều kiện cứng', () => {
    expect(JdRequirementsSchema.parse(requirements())).toEqual(requirements());
  });

  it('GĐ1 điều kiện cứng không nêu trong JD là null hoặc mảng rỗng', () => {
    const input = { ...requirements(), hard_conditions: { majors: [], min_study_year: null, min_gpa: null, required_languages: [] } };
    expect(JdRequirementsSchema.safeParse(input).success).toBe(true);
  });

  it('GĐ1 tên kỹ năng được trim', () => {
    const input = requirements();
    input.must_have[0]!.skill = '  Java  ';
    expect(JdRequirementsSchema.parse(input).must_have[0]!.skill).toBe('Java');
  });

  it.each([
    ['trọng số 0', { weight: 0 }, 'must_have.0.weight'],
    ['trọng số âm', { weight: -1 }, 'must_have.0.weight'],
    ['trọng số quá 10', { weight: 10.5 }, 'must_have.0.weight'],
    ['mức độ ngoài enum', { level: 'EXPERT' }, 'must_have.0.level'],
    ['mức độ chữ thường', { level: 'basic' }, 'must_have.0.level'],
    ['kỹ năng rỗng', { skill: '   ' }, 'must_have.0.skill'],
  ])('AC-3 từ chối %s', (_name, change, path) => {
    const input = requirements();
    Object.assign(input.must_have[0]!, change);
    expect(issuePaths(input)).toEqual([path]);
  });

  it('AC-3 trọng số đúng 10 được nhận', () => {
    const input = requirements();
    input.must_have[0]!.weight = 10;
    expect(JdRequirementsSchema.safeParse(input).success).toBe(true);
  });

  it('AC-7 cần ít nhất một kỹ năng bắt buộc', () => {
    expect(issuePaths({ ...requirements(), must_have: [] })).toEqual(['must_have']);
  });

  it.each([
    ['năm học 0', { min_study_year: 0 }, 'hard_conditions.min_study_year'],
    ['năm học 7', { min_study_year: 7 }, 'hard_conditions.min_study_year'],
    ['năm học lẻ', { min_study_year: 2.5 }, 'hard_conditions.min_study_year'],
    ['GPA quá thang 4', { min_gpa: 8 }, 'hard_conditions.min_gpa'],
    ['ngành rỗng', { majors: [''] }, 'hard_conditions.majors.0'],
  ])('AC-7 từ chối điều kiện cứng: %s', (_name, change, path) => {
    const input = requirements();
    Object.assign(input.hard_conditions, change);
    expect(issuePaths(input)).toEqual([path]);
  });

  it('AC-3 từ chối trường lạ (strict, giống Pydantic extra=forbid)', () => {
    expect(issuePaths({ ...requirements(), notes: 'x' })).toEqual(['']);
  });

  describe('một kỹ năng chỉ nằm ở một nhóm', () => {
    it('AC-7 từ chối kỹ năng trùng giữa bắt buộc và bổ trợ, không phân biệt hoa thường và khoảng trắng', () => {
      const input = requirements();
      input.nice_to_have.push({ skill: ' java ', level: 'ADVANCED', weight: 1 });
      expect(issuePaths(input)).toEqual(['nice_to_have.1.skill']);
    });

    it('AC-7 từ chối kỹ năng trùng trong cùng một nhóm', () => {
      const input = requirements();
      input.must_have.push({ skill: 'SPRING BOOT', level: 'BASIC', weight: 1 });
      expect(issuePaths(input)).toEqual(['must_have.2.skill']);
    });

    it('AC-7 vẫn báo trùng khi một trường khác cũng đang lỗi (LESSONS §10)', () => {
      const input = requirements();
      input.must_have[1]!.weight = 0;
      input.nice_to_have.push({ skill: 'Java', level: 'BASIC', weight: 1 });
      expect(issuePaths(input).sort()).toEqual(['must_have.1.weight', 'nice_to_have.1.skill']);
    });

    it('AC-7 kỹ năng rỗng không bị báo trùng, chỉ báo rỗng', () => {
      const input = requirements();
      input.must_have.push({ skill: '', level: 'BASIC', weight: 1 }, { skill: '', level: 'BASIC', weight: 1 });
      expect(issuePaths(input)).toEqual(['must_have.2.skill', 'must_have.3.skill']);
    });
  });

  it.each([undefined, null, 'x', {}, { must_have: 'x', nice_to_have: [{}] }])(
    'AC-3 malformed input %p is reported, never thrown',
    (input) => {
      expect(JdRequirementsSchema.safeParse(input).success).toBe(false);
    },
  );

  it('AC-3 an output without requirements is reported, never thrown', () => {
    expect(JdAnalyzeOutputSchema.safeParse({ prompt_version: 'jd_analyzer/v1', model: 'm' }).success).toBe(false);
  });

  it('skillKey so khớp không phân biệt hoa thường, giữ dấu tiếng Việt', () => {
    expect(skillKey('  Kiểm Thử ')).toBe('kiểm thử');
    expect(skillKey('Kiểm thử')).not.toBe(skillKey('Kiem thu'));
  });
});

describe('FR-9 JdAnalysis and JdAnalyzeOutput (AC-3)', () => {
  it('AC-3 đầu ra LLM gồm requirements và nhóm vị trí', () => {
    expect(JdAnalysisSchema.safeParse({ requirements: requirements(), position_group: 'BACKEND' }).success).toBe(true);
    expect(JdAnalysisSchema.safeParse({ requirements: requirements(), position_group: 'Backend' }).success).toBe(false);
  });

  it('AC-3 kết quả JD_ANALYZE có jd_id, jd_version, requirements, nhóm vị trí, cờ chữ ẩn, prompt_version, model', () => {
    const output = {
      prompt_version: 'jd_analyzer/v1',
      model: 'gemini-3.8-flash',
      jd_id: 12,
      jd_version: 1,
      requirements: requirements(),
      position_group: 'DATA_AI',
      hidden_text_detected: true,
    };
    expect(JdAnalyzeOutputSchema.parse(output)).toEqual(output);
    const missing: Partial<typeof output> = { ...output };
    delete missing.hidden_text_detected;
    expect(JdAnalyzeOutputSchema.safeParse(missing).success).toBe(false);
  });
});

describe('FR-10 SaveJdRequirementsRequest', () => {
  it('AC-8 body lưu và xác nhận gồm rowVersion, requirements, positionGroup', () => {
    const body = { rowVersion: 3, requirements: requirements(), positionGroup: 'FRONTEND' };
    expect(SaveJdRequirementsRequestSchema.parse(body)).toEqual(body);
    expect(SaveJdRequirementsRequestSchema.safeParse({ ...body, positionGroup: null }).success).toBe(false);
  });
});
