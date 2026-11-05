import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// US-3.4 AC-6, AGENTS › Invariant 2: the competition level is counting, never the LLM. Every
// `competition*` source file of the matching module is checked, whatever layer it sits in; tests
// next to them are not code that runs.

const MODULE = join(__dirname, '..', '..');
const LAYERS = ['api', 'application', 'domain', 'infrastructure'];

const sources = LAYERS.flatMap((layer) =>
  readdirSync(join(MODULE, layer))
    .filter((file) => file.startsWith('competition') && file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .map((file) => ({ file: `${layer}/${file}`, text: readFileSync(join(MODULE, layer, file), 'utf8') })),
);

describe('GĐ4 competition level without LLM (US-3.4 AC-6, Invariant 2)', () => {
  it('GĐ4 the competition files exist where the story puts them', () => {
    expect(sources.map(({ file }) => file).sort()).toEqual([
      'application/competition.service.ts',
      'domain/competition.ts',
      'infrastructure/competition-counter.ts',
    ]);
  });

  it('GĐ4 no competition file imports the AI gateway or names an AI message', () => {
    const offenders = sources
      .filter(({ text }) => /aigateway|AiGateway|['"`]ai\.(?:match|results|jobs)/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
