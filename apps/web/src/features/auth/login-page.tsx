import { zodResolver } from '@hookform/resolvers/zod';
import {
  type AuthSession,
  AuthSessionSchema,
  type LoginRequest,
  LoginRequestSchema,
  portalForRole,
  portalOfPath,
  type Role,
} from '@srm/shared';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router';
import { FullPageSpinner } from '@/app/pages/full-page-spinner';
import { useSession, useSessionActions } from '@/app/session';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, unwrap } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/api/errors';

async function login(values: LoginRequest): Promise<AuthSession> {
  return AuthSessionSchema.parse(unwrap(await api.POST('/api/auth/login', { body: values })));
}

/** Back to the page the user opened before login, if it belongs to their portal (DESIGN.md §12). */
function destinationFor(role: Role, from: unknown): string {
  const portal = portalForRole(role);
  if (typeof from !== 'string') return portal;
  const pathname = from.split(/[?#]/)[0] ?? '';
  return portalOfPath(pathname) === portal ? from : portal;
}

/** US-1.3 AC-12: login form with submitting, field-error and login-error states. */
export function LoginPage() {
  const session = useSession();
  const { signIn } = useSessionActions();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  if (session.status === 'loading') return <FullPageSpinner />;
  // The only redirect after login: signIn() below flips the session and this branch takes over.
  if (session.status === 'authenticated') {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={destinationFor(session.user.role, from)} replace />;
  }

  async function onSubmit(values: LoginRequest) {
    setFormError(null);
    try {
      signIn(await login(values));
    } catch (error) {
      setFormError(apiErrorMessage(error));
    }
  }

  const submitting = form.formState.isSubmitting;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="font-heading text-xl font-semibold">Đăng nhập</h1>
          </CardTitle>
          <CardDescription>
            Smart Recruit Match — ghép sinh viên thực tập với doanh nghiệp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}>
            <FieldGroup>
              {formError && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>Không đăng nhập được</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="login-email">Email</FieldLabel>
                    <Input
                      {...field}
                      id="login-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoFocus
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="login-password">Mật khẩu</FieldLabel>
                    <Input
                      {...field}
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting && <Spinner data-icon="inline-start" />}
                {submitting ? 'Đang đăng nhập' : 'Đăng nhập'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
