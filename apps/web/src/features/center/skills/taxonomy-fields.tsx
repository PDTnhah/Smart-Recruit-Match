import {
  type CatalogSkill,
  FAMILY_ZONE,
  familiesOfZone,
  familyFitsGroup,
  MAX_IMPLIED_SKILLS,
  SKILL_ZONES,
  type SkillFamily,
  type SkillGroup,
  type SkillRef,
  type SkillZone,
} from '@srm/shared';
import { CircleAlert, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebounced } from '@/hooks/use-debounced';
import { useListboxActive } from '@/hooks/use-listbox-active';
import { cn } from '@/lib/utils';
import { apiErrorMessage } from '@/shared/api/errors';
import { useCatalogSkills } from './api';
import { SKILL_FAMILY_LABELS, SKILL_ZONE_LABELS } from './labels';

// The family and implied-skill fields of the approve dialog and the taxonomy sheet (US-2.7 AC-5,
// AC-6, CONTEXT D43). Both forms validate them with the shared schemas.

/** Radix Select takes no empty value, so "no family" is this one. */
const NO_FAMILY = 'NONE';
const SUGGESTION_LIMIT = 6;
const SEARCH_DELAY_MS = 250;

interface FieldProps<T> {
  id: string;
  value: T;
  onChange: (value: T) => void;
  onBlur: () => void;
  invalid: boolean;
  error: { message?: string } | undefined;
  disabled: boolean;
}

/** Families of `zone` that a skill of `group` may take; all of them while no group is chosen. */
function familiesFor(zone: SkillZone, group: SkillGroup | undefined): SkillFamily[] {
  return familiesOfZone(zone).filter((family) => group === undefined || familyFitsGroup(group, family));
}

/** "Họ": optional, the families of each zone under its name, only those that fit `group`. */
export function FamilyField({
  id,
  group,
  value,
  onChange,
  onBlur,
  invalid,
  error,
  disabled,
}: FieldProps<SkillFamily | null> & { group: SkillGroup | undefined }) {
  const substitutes = 'Kỹ năng cùng họ thay được cho nhau khi so CV với JD.';
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>Họ</FieldLabel>
      <Select
        value={value ?? NO_FAMILY}
        onValueChange={(next) => onChange(next === NO_FAMILY ? null : (next as SkillFamily))}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid} onBlur={onBlur}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={NO_FAMILY}>Không có họ</SelectItem>
          </SelectGroup>
          {SKILL_ZONES.map((zone) => {
            const families = familiesFor(zone, group);
            return (
              families.length > 0 && (
                <SelectGroup key={zone}>
                  <SelectLabel>{SKILL_ZONE_LABELS[zone]}</SelectLabel>
                  {families.map((family) => (
                    <SelectItem key={family} value={family}>
                      {SKILL_FAMILY_LABELS[family]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )
            );
          })}
        </SelectContent>
      </Select>
      {invalid ? (
        <FieldError errors={[error]} />
      ) : (
        <FieldDescription>
          {value === null ? `Không bắt buộc. ${substitutes}` : `Vùng ${SKILL_ZONE_LABELS[FAMILY_ZONE[value]]}. ${substitutes}`}
        </FieldDescription>
      )}
    </Field>
  );
}

/**
 * "Kéo theo": the approved skills this one implies directly, at most MAX_IMPLIED_SKILLS. Typing
 * searches the catalogue (`GET /api/skills`) in a list right under the input, as `SkillInput`
 * does; the chosen skills are listed above it, each with a button to drop it.
 */
export function ImpliedSkillsField({
  id,
  skillId,
  initial,
  value,
  onChange,
  onBlur,
  invalid,
  error,
  disabled,
}: FieldProps<number[]> & {
  /** The skill being edited: it never implies itself. */
  skillId: number;
  /** The skills implied when the form opened, for their names. */
  initial: readonly SkillRef[];
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState(() => new Map(initial.map((skill) => [skill.id, skill.canonicalName])));
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const typed = search.trim();
  const query = useDebounced(typed, SEARCH_DELAY_MS);
  // A few more than shown, since the skill itself and the chosen ones are left out.
  const results = useCatalogSkills(query, SUGGESTION_LIMIT + MAX_IMPLIED_SKILLS + 1, { enabled: query !== '' });
  const full = value.length >= MAX_IMPLIED_SKILLS;
  const searching = open && !full && typed !== '';
  const suggestions =
    query === ''
      ? []
      : (results.data ?? [])
          .filter((skill) => skill.id !== skillId && !value.includes(skill.id))
          .slice(0, SUGGESTION_LIMIT);
  const shown = searching && suggestions.length > 0;
  const { active, move, reset } = useListboxActive(suggestions.map((skill) => skill.id));
  // Only once the results are for what is typed: the query trails the input by SEARCH_DELAY_MS.
  const settled = query === typed && !results.isFetching;

  function pick(skill: CatalogSkill) {
    setNames((current) => new Map(current).set(skill.id, skill.canonicalName));
    onChange([...value, skill.id]);
    setSearch('');
    reset();
  }

  function drop(droppedId: number) {
    onChange(value.filter((impliedId) => impliedId !== droppedId));
    // The button is gone: focus goes back to the search.
    inputRef.current?.focus();
  }

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>Kéo theo</FieldLabel>
      {value.length > 0 && (
        <ul aria-label="Kỹ năng kéo theo đã chọn" className="flex flex-col gap-1">
          {value.map((impliedId) => {
            const name = names.get(impliedId) ?? `Kỹ năng #${impliedId}`;
            return (
              <li key={impliedId} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border pl-3">
                <span className="truncate text-sm">{name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Bỏ “${name}”`}
                  disabled={disabled}
                  onClick={() => drop(impliedId)}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        autoComplete="off"
        placeholder={full ? `Đã chọn đủ ${MAX_IMPLIED_SKILLS} kỹ năng` : 'Tìm kỹ năng đã duyệt'}
        value={search}
        readOnly={full}
        disabled={disabled}
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
          reset();
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlur();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            // Enter picks a skill; it submits the form only from an empty search.
            if (typed === '') return;
            event.preventDefault();
            // None highlighted: the first suggestion, once the list is for what is typed.
            const skill = active >= 0 ? suggestions[active] : settled ? suggestions[0] : undefined;
            if (shown && skill) pick(skill);
          } else if (shown && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            move(event.key === 'ArrowDown' ? 1 : -1);
          } else if (event.key === 'Escape' && shown) {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />
      {shown && (
        <ul id={listId} role="listbox" aria-label="Kỹ năng đã duyệt" className="flex flex-col rounded-lg border p-1">
          {suggestions.map((skill, index) => (
            <li
              key={skill.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Keeps focus in the input, so the list stays open until the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(skill)}
              className={cn(
                'flex min-w-0 cursor-pointer items-center rounded-md px-2 py-1.5 text-sm pointer-coarse:min-h-11',
                index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent',
              )}
            >
              <span className="truncate">{skill.canonicalName}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Not tied to focus: pressing "Thử lại" blurs the input. */}
      {!full && typed !== '' && results.isError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tìm được trong danh mục</AlertTitle>
          <AlertDescription>{apiErrorMessage(results.error)}</AlertDescription>
          <AlertAction>
            <Button type="button" variant="outline" size="sm" onClick={() => void results.refetch()}>
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      )}
      {searching && settled && results.isSuccess && suggestions.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {/* Matches can all be left out: chosen already, or the skill itself. */}
          {results.data.length === 0
            ? `Không có kỹ năng đã duyệt nào khớp “${typed}”.`
            : `Các kỹ năng khớp “${typed}” đã được chọn hoặc là chính kỹ năng này.`}
        </p>
      )}
      {invalid ? (
        <FieldError errors={[error]} />
      ) : (
        <FieldDescription>
          Đã dùng kỹ năng này thì chắc chắn đã dùng các kỹ năng kéo theo, như Spring Boot ⇒ Java. Tối đa{' '}
          {MAX_IMPLIED_SKILLS} kỹ năng.
        </FieldDescription>
      )}
    </Field>
  );
}
