import { type CatalogSkill, type CvSkill, skillMatchKey } from '@srm/shared';
import { useEffect, useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useCatalogSkills } from '@/features/center/skills/api';
import { cn } from '@/lib/utils';

/** Suggestions under the input; enough to pick from on a phone without scrolling. */
const SUGGESTION_LIMIT = 6;
const DEBOUNCE_MS = 250;

/** A skill entry as the form holds it: optional texts may still be blank. */
export interface SkillValue {
  name: string;
  canonical_name: string | null;
  match: CvSkill['match'];
}

/** The catalogue skill whose name or alias has the key of `name`: the API will map to it. */
function catalogueMatch(skills: readonly CatalogSkill[], name: string): CatalogSkill | undefined {
  const key = skillMatchKey(name.trim());
  if (key === '') return undefined;
  return skills.find((skill) => [skill.canonicalName, ...skill.aliases].some((spelling) => skillMatchKey(spelling) === key));
}

interface SkillInputProps {
  id: string;
  value: SkillValue;
  onChange: (value: SkillValue) => void;
  onBlur: () => void;
  invalid: boolean;
}

/**
 * One skill of the profile (US-2.6 AC-3): typing suggests approved skills of the catalogue
 * (US-2.5) in a list right under the input, so it works with a phone keyboard open. Picking one
 * maps the skill to it; a name left as typed is a new skill, marked so. The API maps every name
 * again on save, so what the badge says is advice, not the stored mapping.
 */
export function SkillInput({ id, value, onChange, onBlur, invalid }: SkillInputProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState(value.name.trim());
  useEffect(() => {
    const timer = setTimeout(() => setQuery(value.name.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value.name]);
  const catalogue = useCatalogSkills(query, SUGGESTION_LIMIT, { enabled: query !== '' });
  const suggestions = query === '' ? [] : (catalogue.data ?? []);
  const shown = open && suggestions.length > 0;
  const matched = value.match === 'NEW' ? catalogueMatch(suggestions, value.name) : undefined;
  // Only once the suggestions are for what is typed: the query trails the input by DEBOUNCE_MS.
  const settled = query === value.name.trim() && !catalogue.isFetching;
  const isNew = value.match === 'NEW' && value.name.trim() !== '' && !matched && settled;
  const mappedTo = value.match === 'NEW' ? matched?.canonicalName : value.canonical_name;

  function pick(skill: CatalogSkill) {
    onChange({ name: skill.canonicalName, canonical_name: skill.canonicalName, match: 'ALIAS' });
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Input
        id={id}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        autoComplete="off"
        placeholder="VD: Java, React, SQL"
        value={value.name}
        onChange={(event) => {
          onChange({ name: event.target.value, canonical_name: null, match: 'NEW' });
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlur();
        }}
        onKeyDown={(event) => {
          if (!shown) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((current) => (current + step + suggestions.length) % suggestions.length);
          } else if (event.key === 'Enter' && active >= 0) {
            event.preventDefault();
            pick(suggestions[active]!);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {shown && (
        <ul id={listId} role="listbox" aria-label="Kỹ năng trong danh mục" className="flex flex-col rounded-lg border p-1">
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
      {isNew && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">Kỹ năng mới</Badge>
          <span>Chưa có trong danh mục; Trung tâm sẽ xem xét sau khi hồ sơ được xác nhận.</span>
        </div>
      )}
      {mappedTo && skillMatchKey(mappedTo) !== skillMatchKey(value.name) && (
        <p className="text-sm text-muted-foreground">Tính là: {mappedTo}</p>
      )}
    </div>
  );
}
