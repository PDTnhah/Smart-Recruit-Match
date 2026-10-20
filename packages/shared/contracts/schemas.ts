import { z } from 'zod';
import {
  AiJobErrorSchema,
  AiResultMessageSchema,
  AiResultStatusSchema,
  CvParseOutputSchema,
  CvParseResultSchema,
  JdAnalyzeOutputSchema,
  JdAnalyzeResultSchema,
} from './envelope.js';
import { CvParseJobSchema, JdAnalyzeJobSchema } from './jobs.js';

/**
 * Every contract exported to JSON Schema, keyed by file name. The id becomes
 * `json-schema/<id>.json` and the Python module `ai-service/app/contracts/<id>.py`; the class name
 * comes from the schema title. A schema used inside another one is emitted as a `$ref`.
 */
const CONTRACTS: ReadonlyArray<[z.ZodType, string]> = [
  [CvParseJobSchema, 'cv_parse_job'],
  [JdAnalyzeJobSchema, 'jd_analyze_job'],
  [AiResultStatusSchema, 'ai_result_status'],
  [AiJobErrorSchema, 'ai_job_error'],
  [CvParseOutputSchema, 'cv_parse_output'],
  [JdAnalyzeOutputSchema, 'jd_analyze_output'],
  [CvParseResultSchema, 'cv_parse_result'],
  [JdAnalyzeResultSchema, 'jd_analyze_result'],
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
