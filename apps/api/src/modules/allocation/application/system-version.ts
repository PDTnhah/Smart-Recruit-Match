import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The release of the Core Backend, from apps/api/package.json (kept equal to VERSION by the release
 * gate), stored in every round's `config_snapshot` (BR-17, US-5.2 AC-3). The path is the same from
 * `src/` and from `dist/`.
 */
export const SYSTEM_VERSION: string = (
  JSON.parse(readFileSync(path.resolve(__dirname, '../../../../package.json'), 'utf8')) as { version: string }
).version;
