import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { useSessionActions } from '@/app/session';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setSessionExpiredHandler } from '@/shared/api/client';

/** When a refresh fails mid-session, drop the session; the route guards then go to /login. */
function SessionExpiryBridge() {
  const { expire } = useSessionActions();
  useEffect(() => {
    setSessionExpiredHandler(expire);
    return () => setSessionExpiredHandler(() => undefined);
  }, [expire]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // 401 is retried once by the API client; other errors are shown, not retried silently.
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionExpiryBridge />
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
