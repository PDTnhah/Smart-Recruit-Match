import { zodResolver } from '@hookform/resolvers/zod';
import { type AdminSkill, type UpdateSkillTaxonomyRequest, UpdateSkillTaxonomyRequestSchema } from '@srm/shared';
import { CircleAlert, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Controller, type DefaultValues, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { keepOpenOnListboxEscape } from '@/hooks/use-listbox-active';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { useUpdateSkillTaxonomy } from './api';
import { skillReviewErrorMessage } from './labels';
import { FamilyField, ImpliedSkillsField } from './taxonomy-fields';

type FormInput = z.input<typeof UpdateSkillTaxonomyRequestSchema>;

const FIELDS = ['family', 'impliesSkillIds'];

/**
 * The skill as the sheet opened: the row_version sent is the one the form was filled from, not
 * that of a later refetch of the list (LESSONS §25).
 */
function defaultsOf(skill: AdminSkill): DefaultValues<FormInput> {
  return {
    rowVersion: skill.rowVersion,
    family: skill.family,
    impliesSkillIds: skill.implies.map((implied) => implied.id),
  };
}

/**
 * "Sửa họ, kéo theo" of an approved skill (US-2.7 AC-6): a side sheet from `md` up, a bottom sheet
 * on phones (DESIGN.md §5 item 7). Saving replaces both the family and the implied skills, so the
 * form always sends both. The API rejects implied skills that close a cycle (422, with its path).
 * `isMobile` comes from the table, which has one sheet per row.
 */
export function EditTaxonomySheet({ skill, isMobile }: { skill: AdminSkill; isMobile: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const update = useUpdateSkillTaxonomy(skill.id);
  const form = useForm<FormInput, unknown, UpdateSkillTaxonomyRequest>({
    resolver: zodResolver(UpdateSkillTaxonomyRequestSchema),
    defaultValues: defaultsOf(skill),
    mode: 'onTouched',
  });
  const pending = form.formState.isSubmitting;

  async function onSubmit(values: UpdateSkillTaxonomyRequest) {
    setError(null);
    try {
      await update.mutateAsync(values);
      setOpen(false);
      toast.success(`Đã lưu họ và kéo theo của “${skill.canonicalName}”`);
    } catch (caught) {
      applyServerFieldErrors(caught, form.setError, FIELDS);
      setError(caught);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          form.reset(defaultsOf(skill));
          setError(null);
        }
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil data-icon="inline-start" />
          Sửa họ, kéo theo
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'max-h-[85svh]' : undefined}
        onEscapeKeyDown={keepOpenOnListboxEscape}
      >
        <form
          noValidate
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Room for the close button in the corner. */}
          <SheetHeader className="pr-12">
            <SheetTitle>Họ và kéo theo của “{skill.canonicalName}”</SheetTitle>
            <SheetDescription>Hệ thống dùng hai thông tin này khi so kỹ năng của CV với JD.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4">
            {error !== null && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Chưa lưu được</AlertTitle>
                <AlertDescription>{skillReviewErrorMessage(error)}</AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <Controller
                name="family"
                control={form.control}
                render={({ field, fieldState }) => (
                  <FamilyField
                    id={`taxonomy-${skill.id}-family`}
                    group={skill.group ?? undefined}
                    value={field.value ?? null}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={fieldState.invalid}
                    error={fieldState.error}
                    disabled={pending}
                  />
                )}
              />
              <Controller
                name="impliesSkillIds"
                control={form.control}
                render={({ field, fieldState }) => (
                  <ImpliedSkillsField
                    id={`taxonomy-${skill.id}-implies`}
                    skillId={skill.id}
                    initial={skill.implies}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={fieldState.invalid}
                    error={fieldState.error}
                    disabled={pending}
                  />
                )}
              />
            </FieldGroup>
          </div>
          <SheetFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? 'Đang lưu' : 'Lưu'}
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Hủy
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
