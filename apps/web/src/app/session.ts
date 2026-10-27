import { type AuthSession, type Me, MeSchema } from '@srm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '@/shared/api/client';
import { refreshSession } from '@/shared/api/refresh';
import { setAccessToken } from '@/shared/api/token';

// The signed-in account, kept in the TanStack Query cache under one key. On page load the session
// is restored with one refresh call (the access token is never persisted, CONTEXT D26).

export const SESSION_KEY = ['session'] as const;

export type Session =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: Me };

async function restoreSession(): Promise<Me | null> {
  const session = await refreshSession().catch(() => null);
  return session ? MeSchema.parse(session.user) : null;
}

export function useSession(): Session {
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: restoreSession,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  if (query.isPending) return { status: 'loading' };
  return query.data ? { status: 'authenticated', user: query.data } : { status: 'anonymous' };
}

/** The signed-in account inside a portal; RequirePortal guarantees there is one. */
export function useCurrentUser(): Me {
  const session = useSession();
  if (session.status !== 'authenticated') throw new Error('useCurrentUser outside RequirePortal');
  return session.user;
}

export function useSessionActions() {
  const queryClient = useQueryClient();

  const signIn = useCallback(
    (session: AuthSession) => {
      setAccessToken(session.accessToken);
      queryClient.setQueryData(SESSION_KEY, session.user);
    },
    [queryClient],
  );

  /** Drops local state without calling the API (refresh failed, US-1.3 AC-4). */
  const expire = useCallback(() => {
    setAccessToken(null);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_KEY[0] });
    queryClient.setQueryData(SESSION_KEY, null);
  }, [queryClient]);

  const signOut = useCallback(async () => {
    // Revokes the refresh token server-side; local state is cleared even if the call fails.
    await api.POST('/api/auth/logout').catch(() => undefined);
    expire();
  }, [expire]);

  return { signIn, signOut, expire };
}
