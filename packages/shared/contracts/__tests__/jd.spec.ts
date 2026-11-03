import {
  HrJdRequirementsSchema,
  JdAnalysisSchema,
  JdAnalyzeOutputSchema,
  JdRequirementsSchema,
  type JdRequirements,
  SaveJdRequirementsRequestSchema,
  SKILL_LEVEL_EVIDENCE,
  SKILL_LEVEL_HINTS,
  skillKey,
  withoutOverlappingPreferred,
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
  preferred_languages: ['Tiếng Nhật (JLPT N3)'],
});

/** Paths of the issues a parse reports, as `a.0.b` strings. */
function issuePaths(input: unknown, schema: typeof JdRequirementsSchema = JdRequirementsSchema): string[] {
  const result = schema.safeParse(input);
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

    it('AC-7 hai cách viết của một kỹ năng trong danh mục là trùng (US-2.5, CONTEXT D39)', () => {
      const input = requirements();
      input.nice_to_have.push({ skill: 'Spring-Boot', level: 'BASIC', weight: 1 });
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

  it('skillKey là khóa của danh mục kỹ năng: bỏ hoa thường, khoảng trắng, dấu chấm; giữ dấu tiếng Việt (CONTEXT D39)', () => {
    expect(skillKey('  Kiểm Thử ')).toBe('kiểmthử');
    expect(skillKey('React.js')).toBe(skillKey('reactjs'));
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
      new_skills: ['Airflow'],
      hidden_text_detected: true,
    };
    expect(JdAnalyzeOutputSchema.parse(output)).toEqual(output);
    const missing: Partial<typeof output> = { ...output };
    delete missing.hidden_text_detected;
    expect(JdAnalyzeOutputSchema.safeParse(missing).success).toBe(false);
  });
});

describe('GĐ1 FR-9 preferred languages (US-3.6 AC-4, CONTEXT D45)', () => {
  const withLanguages = (required: string[], preferred: unknown[]) => ({
    ...requirements(),
    hard_conditions: { ...requirements().hard_conditions, required_languages: required },
    preferred_languages: preferred,
  });

  it('AC-4 at most 10 entries of at most 100 characters, none blank; the list is required', () => {
    expect(issuePaths(withLanguages([], Array.from({ length: 10 }, (_, i) => `Tiếng ${i}`)))).toEqual([]);
    expect(issuePaths(withLanguages([], Array.from({ length: 11 }, (_, i) => `Tiếng ${i}`)))).toEqual([
      'preferred_languages',
    ]);
    expect(issuePaths(withLanguages([], ['  ', 'x'.repeat(101)]))).toEqual([
      'preferred_languages.0',
      'preferred_languages.1',
    ]);
    const missing: Partial<JdRequirements> = requirements();
    delete missing.preferred_languages;
    expect(issuePaths(missing)).toEqual(['preferred_languages']);
  });

  it('AC-4 a language is required or preferred, never both: compared by language, not by text', () => {
    const input = withLanguages(['Tiếng Anh (TOEIC 550)'], ['IELTS 7.0', 'Tiếng Nhật N3', 'English']);
    const result = HrJdRequirementsSchema.safeParse(input);
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['preferred_languages.0', 'Ngoại ngữ này đã có ở mục bắt buộc'],
      ['preferred_languages.2', 'Ngoại ngữ này đã có ở mục bắt buộc'],
    ]);
    // Alternatives and parts joined by "và" name every language they mention.
    expect(issuePaths(withLanguages(['Tiếng Anh hoặc tiếng Nhật'], ['JLPT N2']), HrJdRequirementsSchema)).toEqual([
      'preferred_languages.0',
    ]);
    expect(issuePaths(withLanguages(['TOEIC 550 và JLPT N3'], ['Tiếng Hàn']), HrJdRequirementsSchema)).toEqual([]);
  });

  it('AC-4 entries that name no language never clash', () => {
    expect(issuePaths(withLanguages(['Ngoại ngữ thứ hai'], ['Ngoại ngữ thứ hai']), HrJdRequirementsSchema)).toEqual([]);
    expect(issuePaths(withLanguages(['Tiếng Anh'], ['B2']), HrJdRequirementsSchema)).toEqual([]);
  });

  it('AC-4 the clash still shows while another field is invalid (LESSONS §10)', () => {
    const input = withLanguages(['Tiếng Anh'], ['TOEIC 700', '']);
    input.must_have[0]!.weight = 0;
    expect(issuePaths(input, HrJdRequirementsSchema).sort()).toEqual([
      'must_have.0.weight',
      'preferred_languages.0',
      'preferred_languages.1',
    ]);
  });

  it.each([undefined, null, 'x', {}, { hard_conditions: 5, preferred_languages: 'x' }, withLanguages([1 as never], [2])])(
    'AC-4 malformed input %p is reported, never thrown',
    (input) => {
      expect(HrJdRequirementsSchema.safeParse(input).success).toBe(false);
    },
  );

  it('AC-4 the AI proposal is not held to it on the queue; the backend drops the repeated entries', () => {
    const proposal = JdRequirementsSchema.parse(withLanguages(['Tiếng Anh (TOEIC 550)'], ['IELTS 7.0', 'Tiếng Nhật N3']));
    const cleaned = withoutOverlappingPreferred(proposal);
    expect(cleaned).toEqual({
      requirements: { ...proposal, preferred_languages: ['Tiếng Nhật N3'] },
      dropped: ['IELTS 7.0'],
    });
    expect(HrJdRequirementsSchema.safeParse(cleaned.requirements).success).toBe(true);
    const clean = requirements();
    expect(withoutOverlappingPreferred(clean).requirements).toBe(clean);
  });

  it('AC-4 the API reports the clash under requirements', () => {
    const body = { rowVersion: 1, requirements: withLanguages(['Tiếng Anh'], ['IELTS 6.5']), positionGroup: 'BACKEND' };
    const result = SaveJdRequirementsRequestSchema.safeParse(body);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['requirements.preferred_languages.0']);
  });
});

describe('GĐ1 FR-9 skill level hints for HR (US-3.6 AC-9, CONTEXT D44)', () => {
  it('AC-9 the hints quote the thresholds the tier rules use', () => {
    expect(SKILL_LEVEL_HINTS.INTERMEDIATE).toContain(`${SKILL_LEVEL_EVIDENCE.intermediateMinProjectOrExperience} dự án`);
    expect(SKILL_LEVEL_HINTS.ADVANCED).toContain(`${SKILL_LEVEL_EVIDENCE.advancedMinExperienceMonths} tháng`);
    expect(SKILL_LEVEL_HINTS.BASIC).toContain('1 dự án');
  });
});

describe('FR-10 SaveJdRequirementsRequest', () => {
  it('AC-8 body lưu và xác nhận gồm rowVersion, requirements, positionGroup', () => {
    const body = { rowVersion: 3, requirements: requirements(), positionGroup: 'FRONTEND' };
    expect(SaveJdRequirementsRequestSchema.parse(body)).toEqual(body);
    expect(SaveJdRequirementsRequestSchema.safeParse({ ...body, positionGroup: null }).success).toBe(false);
  });
});
