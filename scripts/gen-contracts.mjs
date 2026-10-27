// Contract generation (AD-6, CONTEXT D33): Zod in packages/shared/contracts → JSON Schema →
// Pydantic in ai-service/app/contracts. Run through `pnpm contracts:gen`, which builds
// @srm/shared first. CI runs it again and fails when the committed files differ.
//
// Python: $AI_SERVICE_PYTHON, else ai-service/.venv (Windows or POSIX layout), else python3/python
// on PATH. It needs `pip install -e "ai-service[dev]"` for datamodel-code-generator.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jsonSchemaDir = join(root, 'packages/shared/contracts/json-schema');
const pythonDir = join(root, 'ai-service/app/contracts');

const contracts = createRequire(import.meta.url)(join(root, 'packages/shared/dist/contracts/index.js'));

const toJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

// Start from empty directories so a removed contract leaves no stale file behind.
rmSync(jsonSchemaDir, { recursive: true, force: true });
mkdirSync(jsonSchemaDir, { recursive: true });
for (const [id, schema] of Object.entries(contracts.buildContractSchemas())) {
  writeFileSync(join(jsonSchemaDir, `${id}.json`), toJson(schema));
}

mkdirSync(pythonDir, { recursive: true });
for (const name of readdirSync(pythonDir)) {
  if (name.endsWith('.py')) rmSync(join(pythonDir, name));
}
writeFileSync(join(pythonDir, 'queues.json'), toJson(contracts.aiQueueManifest()));

const python = findPython();
// Options live in ai-service/pyproject.toml [tool.datamodel-codegen], read from the working directory.
const generated = spawnSync(python, ['-m', 'datamodel_code_generator'], {
  cwd: join(root, 'ai-service'),
  stdio: 'inherit',
});
if (generated.error) throw generated.error;
if (generated.status !== 0) process.exit(generated.status ?? 1);

// Python writes CRLF on Windows; keep the committed files identical on every OS.
for (const name of readdirSync(pythonDir)) {
  if (!name.endsWith('.py')) continue;
  const file = join(pythonDir, name);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
}
console.log(`contracts:gen: wrote ${jsonSchemaDir} and ${pythonDir}`);

function findPython() {
  if (process.env.AI_SERVICE_PYTHON) return process.env.AI_SERVICE_PYTHON;
  const venv = ['ai-service/.venv/Scripts/python.exe', 'ai-service/.venv/bin/python']
    .map((p) => join(root, p))
    .find((p) => existsSync(p));
  if (venv) return venv;
  const onPath = ['python3', 'python'].find((cmd) => spawnSync(cmd, ['--version']).status === 0);
  if (!onPath) throw new Error('contracts:gen: no Python found; create ai-service/.venv (docs/SETUP.md)');
  return onPath;
}
