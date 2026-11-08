// Routes of the exam screens (US-4.3). The room lives under /sv so that, after a login in the
// middle of a test, the student comes back to it (DESIGN.md §12), but outside StudentLayout.

/** "Bài test": the tests of the student's preferences. */
export const EXAMS_PATH = '/sv/exams';

/** The exam room of a session. */
export function examRoomPath(sessionId: number): string {
  return `/sv/exam/${sessionId}`;
}
