import { z } from 'zod';
import {
  CvCertificateSchema,
  CvEducationSchema,
  CvExperienceSchema,
  CvExtractedProfileSchema,
  CvExtractedSkillSchema,
  CvExtractionSchema,
  CvLanguageSchema,
  CvPiiSchema,
  CvProfileSchema,
  CvProjectSchema,
  CvSkillSchema,
  CvSourceSchema,
} from './cv.js';
import {
  AiJobErrorSchema,
  AiResultMessageSchema,
  AiResultStatusSchema,
  CvParseOutputSchema,
  CvParseResultSchema,
  JdAnalyzeOutputSchema,
  JdAnalyzeResultSchema,
  SkillNormalizeOutputSchema,
  SkillNormalizeResultSchema,
} from './envelope.js';
import {
  JdAnalysisSchema,
  JdHardConditionsSchema,
  JdRequirementsSchema,
  JdSkillRequirementSchema,
  PositionGroupSchema,
  SkillLevelSchema,
} from './jd.js';
import { CvParseJobSchema, JdAnalyzeJobSchema, SkillNormalizeJobSchema } from './jobs.js';
import {
  MajorMatchSchema,
  MatchCriteriaSchema,
  MatchEducationSchema,
  MatchLanguageVerdictSchema,
  MatchProjectRelevanceSchema,
  MatchSkillVerdictSchema,
  MatchVerdictSchema,
} from './matching.js';
import { SkillGroupSchema, SkillMatchSchema, SkillSuggestionSchema, SkillSuggestionsSchema } from './skills.js';

/**
 * Every contract exported to JSON Schema, keyed by file name. The id becomes
 * `json-schema/<id>.json` and the Python module `ai-service/app/contracts/<id>.py`; the class name
 * comes from the schema title. A schema used inside another one is emitted as a `$ref`.
 */
const CONTRACTS: ReadonlyArray<[z.ZodType, string]> = [
  [CvParseJobSchema, 'cv_parse_job'],
  [JdAnalyzeJobSchema, 'jd_analyze_job'],
  [SkillNormalizeJobSchema, 'skill_normalize_job'],
  [AiResultStatusSchema, 'ai_result_status'],
  [AiJobErrorSchema, 'ai_job_error'],
  [SkillLevelSchema, 'skill_level'],
  [PositionGroupSchema, 'position_group'],
  [JdSkillRequirementSchema, 'jd_skill_requirement'],
  [JdHardConditionsSchema, 'jd_hard_conditions'],
  [JdRequirementsSchema, 'jd_requirements'],
  [JdAnalysisSchema, 'jd_analysis'],
  [MatchVerdictSchema, 'match_verdict'],
  [MajorMatchSchema, 'major_match'],
  [MatchSkillVerdictSchema, 'match_skill_verdict'],
  [MatchProjectRelevanceSchema, 'match_project_relevance'],
  [MatchEducationSchema, 'match_education'],
  [MatchLanguageVerdictSchema, 'match_language_verdict'],
  [MatchCriteriaSchema, 'match_criteria'],
  [CvSourceSchema, 'cv_source'],
  [CvEducationSchema, 'cv_education'],
  [SkillGroupSchema, 'skill_group'],
  [SkillMatchSchema, 'skill_match'],
  [CvExtractedSkillSchema, 'cv_extracted_skill'],
  [CvSkillSchema, 'cv_skill'],
  [CvProjectSchema, 'cv_project'],
  [CvExperienceSchema, 'cv_experience'],
  [CvLanguageSchema, 'cv_language'],
  [CvCertificateSchema, 'cv_certificate'],
  [CvExtractedProfileSchema, 'cv_extracted_profile'],
  [CvProfileSchema, 'cv_profile'],
  [CvPiiSchema, 'cv_pii'],
  [CvExtractionSchema, 'cv_extraction'],
  [CvParseOutputSchema, 'cv_parse_output'],
  [JdAnalyzeOutputSchema, 'jd_analyze_output'],
  [SkillSuggestionSchema, 'skill_suggestion'],
  [SkillSuggestionsSchema, 'skill_suggestions'],
  [SkillNormalizeOutputSchema, 'skill_normalize_output'],
  [CvParseResultSchema, 'cv_parse_result'],
  [JdAnalyzeResultSchema, 'jd_analyze_result'],
  [SkillNormalizeResultSchema, 'skill_normalize_result'],
  [AiResultMessageSchema, 'ai_result_message'],
];

export type ContractJsonSchemas = Record<string, Record<string, unknown>>;

/**
 * JSON Schema of every contract (AD-6). Pure: `scripts/gen-contracts.mjs` writes the files, and a
 * unit test compares them with the committed copies.
 */
export function buildContractSchemas(): ContractJsonSchemas {
  // Built per call so importing the package (the web app does) has no registry side effect.
  const contracts = z.registry<{ id: string }>();
  for (const [schema, id] of CONTRACTS) contracts.add(schema, { id });
  const { schemas } = z.toJSONSchema(contracts, {
    target: 'draft-2020-12',
    unrepresentable: 'throw',
    uri: (id) => `./${id}.json`,
    override: ({ jsonSchema }) => {
      // `format: uuid` alone maps to UUID in Pydantic; Zod's long regex adds nothing for Python.
      if (jsonSchema.format === 'uuid') delete jsonSchema.pattern;
    },
  });
  return schemas;
}
