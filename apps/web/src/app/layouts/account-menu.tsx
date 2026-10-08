import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ROLE_LABELS } from '@/app/roles';
import { useCurrentUser, useSessionActions } from '@/app/session';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const last = words.at(-1) ?? '';
  const first = words.length > 1 ? (words[0] ?? '') : '';
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?';
}

/** Account button with name, role and sign-out (every portal header). */
export function AccountMenu() {
  const user = useCurrentUser();
  const { signOut } = useSessionActions();
  const navigate = useNavigate();
  const name = user.fullName ?? user.email;

  async function handleSignOut() {
    await signOut();
    await navigate('/login', { replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Tài khoản">
          <Avatar>
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="truncate">{name}</span>
          <span className="truncate font-normal text-muted-foreground">{user.email}</span>
          <span className="font-normal text-muted-foreground">{ROLE_LABELS[user.role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => void handleSignOut()}>
            <LogOut />
            Đăng xuất
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
