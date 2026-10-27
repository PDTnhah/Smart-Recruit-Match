import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiRequestError } from '@/shared/api/errors';

interface Issue {
  path: string;
  message: string;
}

function issuesOf(error: unknown): Issue[] {
  if (!(error instanceof ApiRequestError) || error.body?.code !== 'VALIDATION_FAILED') return [];
  const issues = error.body.details?.issues;
  if (!Array.isArray(issues)) return [];
  return issues.filter(
    (issue): issue is Issue =>
      typeof (issue as Issue).path === 'string' && typeof (issue as Issue).message === 'string',
  );
}

/**
 * Puts the field errors of a 400 VALIDATION_FAILED answer on the matching form fields
 * (DESIGN.md §8). Forms name their fields like the request body, so `config.beta` lands on the
 * β field; an index at the end (`target.cohorts.0`) goes to the list itself. Returns false when
 * no issue matched a field, so the caller shows the form-level alert instead.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): boolean {
  let applied = false;
  for (const issue of issuesOf(error)) {
    const path = issue.path.replace(/\.\d+$/, '');
    if (!fields.includes(path)) continue;
    setError(path as Path<T>, { type: 'server', message: issue.message });
    applied = true;
  }
  return applied;
}

/**
 * Like `applyServerFieldErrors`, for a form that edits one object of the request body, lists
 * included: `profile.skills.3.name` lands on `skills.3.name` when `prefix` is `profile`. The first
 * field gets focus. Returns false when no issue was under `prefix`.
 */
export function applyNestedServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  prefix: string,
): boolean {
  let applied = false;
  for (const issue of issuesOf(error)) {
    if (!issue.path.startsWith(`${prefix}.`)) continue;
    const path = issue.path.slice(prefix.length + 1) as Path<T>;
    setError(path, { type: 'server', message: issue.message }, { shouldFocus: !applied });
    applied = true;
  }
  return applied;
}
