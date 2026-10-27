import { zodResolver } from '@hookform/resolvers/zod';
import { type AdminSkill, type ApproveSkillRequest, ApproveSkillRequestSchema, SKILL_GROUPS } from '@srm/shared';
import { CircleAlert, CircleCheck, Merge } from 'lucide-react';
import { useState } from 'react';
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { useApproveSkill, useMergeSkill } from './api';
import { type NameOwner, nameOwnerOf, SKILL_GROUP_LABELS, skillReviewErrorMessage } from './labels';

type FormInput = z.input<typeof ApproveSkillRequestSchema>;

const FIELDS = ['canonicalName', 'group'];

/** The AI's suggestion fills the form; ADMIN decides (AD-2). Without one, the schema asks for a group. */
function defaultsOf(skill: AdminSkill): DefaultValues<FormInput> {
  return {
    rowVersion: skill.rowVersion,
    canonicalName: skill.suggestion?.canonicalName ?? skill.canonicalName,
    group: skill.suggestion?.group ?? skill.group ?? undefined,
  };
}

/**
 * "Duyệt" a new skill into the catalogue (US-2.5 AC-7), with the catalogue name and group. A new
 * name keeps the one the CV or JD wrote as an alias. When the name is taken by an approved skill
 * (409 SKILL_NAME_TAKEN), the dialog offers to merge into that skill instead.
 */
export function ApproveSkillDialog({ skill }: { skill: AdminSkill }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const approve = useApproveSkill(skill.id);
  const merge = useMergeSkill(skill.id);
  const form = useForm<FormInput, unknown, ApproveSkillRequest>({
    resolver: zodResolver(ApproveSkillRequestSchema),
    defaultValues: defaultsOf(skill),
    mode: 'onTouched',
  });
  const pending = form.formState.isSubmitting || merge.isPending;
  const owner: NameOwner | null = nameOwnerOf(error);

  async function onSubmit(values: ApproveSkillRequest) {
    setError(null);
    try {
      const approved = await approve.mutateAsync(values);
      setOpen(false);
      toast.success(`Đã duyệt kỹ năng “${approved.canonicalName}”`);
    } catch (caught) {
      applyServerFieldErrors(caught, form.setError, FIELDS);
      setError(caught);
    }
  }

  async function mergeInto(target: NameOwner) {
    setError(null);
    try {
      await merge.mutateAsync({ rowVersion: skill.rowVersion, targetId: target.skillId });
      setOpen(false);
      toast.success(`Đã gộp “${skill.canonicalName}” vào “${target.canonicalName}”`);
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          // The suggestion may have arrived since the row was first drawn.
          form.reset(defaultsOf(skill));
          setError(null);
        }
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button size="sm">
          <CircleCheck data-icon="inline-start" />
          Duyệt
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="flex flex-col gap-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Duyệt kỹ năng “{skill.canonicalName}”</AlertDialogTitle>
            <AlertDialogDescription>
              Kỹ năng được thêm vào danh mục; CV và JD sau này có tên này được gán ngay. Đổi tên thì “
              {skill.canonicalName}” được giữ làm tên gọi khác. Thao tác này không hoàn tác được.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error !== null && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa duyệt được kỹ năng</AlertTitle>
              <AlertDescription>{skillReviewErrorMessage(error)}</AlertDescription>
              {owner?.status === 'APPROVED' && (
                <AlertAction>
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => void mergeInto(owner)}>
                    {merge.isPending ? <Spinner data-icon="inline-start" /> : <Merge data-icon="inline-start" />}
                    Gộp vào “{owner.canonicalName}”
                  </Button>
                </AlertAction>
              )}
            </Alert>
          )}
          <FieldGroup>
            <Controller
              name="canonicalName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`skill-${skill.id}-name`}>Tên chuẩn</FieldLabel>
                  <Input
                    {...field}
                    id={`skill-${skill.id}-name`}
                    autoComplete="off"
                    autoFocus
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Tên hiển thị trong hồ sơ năng lực và yêu cầu JD.</FieldDescription>
                  )}
                </Field>
              )}
            />
            <Controller
              name="group"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`skill-${skill.id}-group`}>Nhóm</FieldLabel>
                  <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={pending}>
                    <SelectTrigger
                      id={`skill-${skill.id}-group`}
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                      onBlur={field.onBlur}
                    >
                      <SelectValue placeholder="Chọn nhóm" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {SKILL_GROUPS.map((group) => (
                          <SelectItem key={group} value={group}>
                            {SKILL_GROUP_LABELS[group]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              Hủy
            </AlertDialogCancel>
            <Button type="submit" disabled={pending}>
              {form.formState.isSubmitting && <Spinner data-icon="inline-start" />}
              {form.formState.isSubmitting ? 'Đang duyệt' : 'Duyệt kỹ năng'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
