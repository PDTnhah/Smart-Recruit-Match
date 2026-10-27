import { zodResolver } from '@hookform/resolvers/zod';
import { type AdminSkill, type CatalogSkill, type MergeSkillRequest, MergeSkillRequestSchema } from '@srm/shared';
import { CircleAlert, Merge, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, type DefaultValues, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/shared/api/errors';
import { useCatalogSkills, useMergeSkill } from './api';
import { SKILL_GROUP_LABELS, skillReviewErrorMessage } from './labels';

type FormInput = z.input<typeof MergeSkillRequestSchema>;

/** Few enough options to fit the dialog without scrolling; typing narrows them. */
const PICKER_LIMIT = 6;
const SEARCH_DELAY_MS = 250;

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** No target yet: the schema asks for one. */
function defaultsOf(skill: AdminSkill): DefaultValues<FormInput> {
  return { rowVersion: skill.rowVersion };
}

function TargetOption({ skillId, option }: { skillId: number; option: CatalogSkill }) {
  const id = `merge-${skillId}-${option.id}`;
  const aliases = option.aliases.length > 0 ? ` · ${option.aliases.join(', ')}` : '';
  return (
    <FieldLabel htmlFor={id}>
      <Field orientation="horizontal">
        <FieldContent className="min-w-0">
          <FieldTitle>{option.canonicalName}</FieldTitle>
          <FieldDescription className="truncate">
            {SKILL_GROUP_LABELS[option.group]}
            {aliases}
          </FieldDescription>
        </FieldContent>
        <RadioGroupItem value={String(option.id)} id={id} />
      </Field>
    </FieldLabel>
  );
}

/**
 * "Gộp" a new skill into an approved one (US-2.5 AC-7): the new name becomes an alias of the
 * target, so later CVs and JDs with that name get the target (AC-10). The picker searches the
 * approved catalogue (`GET /api/skills`), starting from the AI's first similar skill.
 */
export function MergeSkillDialog({ skill }: { skill: AdminSkill }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState(skill.suggestion?.similarSkills[0] ?? '');
  const [selected, setSelected] = useState<CatalogSkill | null>(null);
  const query = useDebounced(search.trim(), SEARCH_DELAY_MS);
  const results = useCatalogSkills(query, PICKER_LIMIT, { enabled: open });
  const merge = useMergeSkill(skill.id);
  const form = useForm<FormInput, unknown, MergeSkillRequest>({
    resolver: zodResolver(MergeSkillRequestSchema),
    defaultValues: defaultsOf(skill),
  });
  const pending = form.formState.isSubmitting;

  // The chosen target stays on screen while another search runs.
  const found = results.data ?? [];
  const options = selected && !found.some((option) => option.id === selected.id) ? [selected, ...found] : found;

  async function onSubmit(values: MergeSkillRequest) {
    setError(null);
    try {
      const merged = await merge.mutateAsync(values);
      setOpen(false);
      toast.success(`Đã gộp “${skill.canonicalName}” vào “${merged.mergedInto?.canonicalName ?? selected?.canonicalName}”`);
    } catch (caught) {
      setError(caught);
    }
  }

  const picker = (
    <Controller
      name="targetId"
      control={form.control}
      render={({ field, fieldState }) => {
        let choices;
        if (results.isPending) {
          choices = (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          );
        } else if (results.isError) {
          choices = (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Không tải được danh mục kỹ năng</AlertTitle>
              <AlertDescription>{apiErrorMessage(results.error)}</AlertDescription>
              <AlertAction>
                <Button type="button" variant="outline" size="sm" onClick={() => void results.refetch()}>
                  Thử lại
                </Button>
              </AlertAction>
            </Alert>
          );
        } else if (options.length === 0) {
          choices = (
            <Empty className="border p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>Không có kỹ năng nào khớp “{query}”</EmptyTitle>
                <EmptyDescription>Thử tên ngắn hơn hoặc tên gọi khác của kỹ năng.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          );
        } else {
          choices = (
            <RadioGroup
              value={field.value ? String(field.value) : ''}
              onValueChange={(value) => {
                field.onChange(Number(value));
                setSelected(options.find((option) => String(option.id) === value) ?? null);
              }}
              disabled={pending}
              aria-invalid={fieldState.invalid}
            >
              {options.map((option) => (
                <TargetOption key={option.id} skillId={skill.id} option={option} />
              ))}
            </RadioGroup>
          );
        }
        return (
          <FieldSet data-invalid={fieldState.invalid}>
            <FieldLegend variant="label">Kỹ năng đích</FieldLegend>
            {choices}
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </FieldSet>
        );
      }}
    />
  );

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          // The suggestion may have arrived since the row was first drawn.
          setSearch(skill.suggestion?.similarSkills[0] ?? '');
          setSelected(null);
          form.reset(defaultsOf(skill));
          setError(null);
        }
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Merge data-icon="inline-start" />
          Gộp
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="flex flex-col gap-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Gộp “{skill.canonicalName}” vào kỹ năng có sẵn</AlertDialogTitle>
            <AlertDialogDescription>
              “{skill.canonicalName}” trở thành tên gọi khác của kỹ năng được chọn. Thao tác này không hoàn tác được.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error !== null && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa gộp được kỹ năng</AlertTitle>
              <AlertDescription>{skillReviewErrorMessage(error)}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`merge-${skill.id}-search`}>Tìm trong danh mục</FieldLabel>
              <Input
                id={`merge-${skill.id}-search`}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="React, PostgreSQL…"
                autoComplete="off"
                autoFocus
                disabled={pending}
              />
            </Field>
            {picker}
          </FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              Hủy
            </AlertDialogCancel>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? 'Đang gộp' : 'Gộp kỹ năng'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
