import type { ReactNode } from 'react';

/**
 * Minimal shell of the exam room (US-4.3 AC-13, ARCHITECTURE › Frontend): no portal navigation, a
 * sticky header for the clock and the save indicator, one column of max-w-3xl (DESIGN.md §4, §5).
 */
export function ExamLayout({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-3xl min-w-0 items-center gap-3 px-4 md:px-6">
          {header ?? <span className="font-heading font-semibold">Bài test</span>}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col gap-6 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6">
        {children}
      </main>
    </div>
  );
}
