import { zodResolver } from '@hookform/resolvers/zod';
import { type HrAccount, type HrInvitation, type InviteHrRequest, InviteHrRequestSchema } from '@srm/shared';
import { CircleAlert, Copy, Link2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { useHrAccounts, useInviteHr } from './api';

const INVITE_FIELDS = ['email', 'fullName'];

/** The link shown once after an invitation; the token is never stored, so it cannot be shown later. */
function InvitationLink({ invitation }: { invitation: HrInvitation }) {
  const link = `${window.location.origin}${invitation.invitationPath}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Đã sao chép đường dẫn mời');
    } catch {
      toast.error('Không sao chép tự động được. Chọn đường dẫn trong ô rồi sao chép thủ công.');
    }
  }

  return (
    <Alert>
      <Link2 />
      <AlertTitle>Đường dẫn mời cho {invitation.account.email}</AlertTitle>
      <AlertDescription>
        <p>
          Gửi đường dẫn này cho HR để đặt mật khẩu. Đường dẫn dùng được một lần, hết hạn lúc{' '}
          {formatDateTime(invitation.expiresAt)}.
        </p>
        <Input
          readOnly
          value={link}
          aria-label="Đường dẫn mời"
          onFocus={(event) => event.currentTarget.select()}
          className="mt-2"
        />
      </AlertDescription>
      <AlertAction>
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          <Copy data-icon="inline-start" />
          Sao chép
        </Button>
      </AlertAction>
    </Alert>
  );
}

function InviteForm({ companyId, onInvited }: { companyId: number; onInvited: (invitation: HrInvitation) => void }) {
  const invite = useInviteHr(companyId);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<InviteHrRequest>({
    resolver: zodResolver(InviteHrRequestSchema),
    defaultValues: { email: '', fullName: '' },
    mode: 'onTouched',
  });

  async function onSubmit(values: InviteHrRequest) {
    setFormError(null);
    try {
      onInvited(await invite.mutateAsync(values));
      form.reset();
      toast.success('Đã tạo lời mời');
    } catch (error) {
      applyServerFieldErrors(error, form.setError, INVITE_FIELDS);
      setFormError(apiErrorMessage(error));
    }
  }

  const submitting = form.formState.isSubmitting;

  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}>
      <FieldGroup>
        {formError && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Chưa mời được HR</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Controller
            name="fullName"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="invite-name">Họ tên HR</FieldLabel>
                <Input {...field} id="invite-name" autoComplete="off" aria-invalid={fieldState.invalid} />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="invite-email">Email HR</FieldLabel>
                <Input
                  {...field}
                  id="invite-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>
        <FieldDescription>
          Hệ thống tạo tài khoản HR chưa có mật khẩu và một đường dẫn mời hạn 7 ngày. Mời lại email chưa kích hoạt thì
          nhận đường dẫn mới.
        </FieldDescription>
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting ? <Spinner data-icon="inline-start" /> : <UserPlus data-icon="inline-start" />}
            {submitting ? 'Đang mời' : 'Mời HR'}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function AccountStatus({ account }: { account: HrAccount }) {
  return account.status === 'ACTIVE' ? (
    <Badge>Đang hoạt động</Badge>
  ) : (
    <Badge variant="outline">Chưa kích hoạt</Badge>
  );
}

function AccountsTable({
  accounts,
  companyId,
  onInvited,
}: {
  accounts: HrAccount[];
  companyId: number;
  onInvited: (invitation: HrInvitation) => void;
}) {
  const invite = useInviteHr(companyId);
  const [reinviting, setReinviting] = useState<number | null>(null);

  async function reinvite(account: HrAccount) {
    setReinviting(account.id);
    try {
      onInvited(await invite.mutateAsync({ email: account.email, fullName: account.fullName ?? account.email }));
      toast.success('Đã tạo đường dẫn mời mới');
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setReinviting(null);
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Họ tên</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>
            <span className="sr-only">Thao tác</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <TableRow key={account.id}>
            <TableCell className="font-medium">{account.fullName ?? '—'}</TableCell>
            <TableCell className="max-w-64 truncate" title={account.email}>
              {account.email}
            </TableCell>
            <TableCell>
              <AccountStatus account={account} />
            </TableCell>
            <TableCell>
              {account.status === 'PENDING' && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reinviting !== null}
                    onClick={() => void reinvite(account)}
                  >
                    {reinviting === account.id && <Spinner data-icon="inline-start" />}
                    Tạo lại link mời
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** HR accounts of a company and the invitation form (US-1.5 AC-2, AC-10). */
export function HrAccountsCard({ companyId }: { companyId: number }) {
  const accounts = useHrAccounts(companyId);
  const [invitation, setInvitation] = useState<HrInvitation | null>(null);

  let list;
  if (accounts.isPending) {
    list = (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  } else if (accounts.isError) {
    list = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được danh sách HR</AlertTitle>
        <AlertDescription>{apiErrorMessage(accounts.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void accounts.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (accounts.data.length === 0) {
    list = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>Chưa có tài khoản HR</EmptyTitle>
          <EmptyDescription>Mời HR bằng form dưới đây. HR đặt mật khẩu qua đường dẫn mời rồi đăng JD.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    list = <AccountsTable accounts={accounts.data} companyId={companyId} onInvited={setInvitation} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tài khoản HR</CardTitle>
        <CardDescription>
          Khi chưa có email tự động, sao chép đường dẫn mời và gửi cho HR qua kênh liên lạc của Trung tâm.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {invitation && <InvitationLink invitation={invitation} />}
        {list}
        <Separator />
        <InviteForm companyId={companyId} onInvited={setInvitation} />
      </CardContent>
    </Card>
  );
}
