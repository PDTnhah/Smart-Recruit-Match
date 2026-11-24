import { readFileSync } from 'node:fs';

export const loadSnapshot = (path: string): string => readFileSync(path, 'utf8');
