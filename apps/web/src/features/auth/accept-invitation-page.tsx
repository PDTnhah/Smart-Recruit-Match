import { zodResolver } from '@hookform/resolvers/zod';
import { type AuthSession, AuthSessionSchema, NewPasswordSchema, portalForRole } from '@srm/shared';
import { CircleAlert } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { useSessionActions } from '@/app/session';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, unwrap } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/api/errors';

const FormSchema = z
  .object({
    password: NewPasswordSchema,
    confirm: z.string().min(1, { error: 'Nhập lại mật khẩu' }),
  })
  .refine((values) => values.password === values.confirm, {
    error: 'Mật khẩu nhập lại không khớp',
    path: ['confirm'],
  });

type FormValues = z.infer<typeof FormSchema>;

async function acceptInvitation(token: string, password: string): Promise<AuthSession> {
  return AuthSessionSchema.parse(
    unwrap(await api.POST('/api/auth/accept-invitation', { body: { token, password } })),
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="font-heading text-xl font-semibold">Nhận lời mời</h1>
          </CardTitle>
          <CardDescription>Đặt mật khẩu cho tài khoản HR của doanh nghiệp trên Smart Recruit Match.</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}

/**
 * `/accept-invitation#<token>` (US-1.5 AC-3, AC-10): an invited HR sets a password and is signed in.
 * The token sits in the URL fragment, which browsers never send to the server (CONTEXT D28).
 */
export function AcceptInvitationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn } = useSessionActions();
  const token = location.hash.replace(/^#/, '');
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { password: '', confirm: '' },
    mode: 'onTouched',
  });

  if (!token) {
    return (
      <Shell>
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Thiếu mã lời mời</AlertTitle>
          <AlertDescription>
            Mở đúng đường dẫn mời Trung tâm đã gửi, hoặc liên hệ Trung tâm để nhận đường dẫn mới.
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const session = await acceptInvitation(token, values.password);
      signIn(session);
      toast.success('Đã đặt mật khẩu. Chào mừng đến cổng doanh nghiệp.');
      // Replace the entry, so the used link does not stay in the history.
      void navigate(portalForRole(session.user.role), { replace: true });
    } catch (error) {
      setFormError(apiErrorMessage(error));
    }
  }

  const submitting = form.formState.isSubmitting;

  return (
    <Shell>
      <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}>
        <FieldGroup>
          {formError && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa đặt được mật khẩu</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="invite-password">Mật khẩu mới</FieldLabel>
                <Input
                  {...field}
                  id="invite-password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>Ít nhất 8 ký tự.</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="confirm"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="invite-confirm">Nhập lại mật khẩu</FieldLabel>
                <Input
                  {...field}
                  id="invite-confirm"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? 'Đang lưu' : 'Đặt mật khẩu và đăng nhập'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Đã có mật khẩu?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Đăng nhập
            </Link>
          </p>
        </FieldGroup>
      </form>
    </Shell>
  );
}
