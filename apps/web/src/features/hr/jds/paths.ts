/** Routes of the JD screens in the HR portal (router.tsx). */
export const HR_JDS_PATH = '/hr/job-descriptions';

export const hrJdPath = (id: number) => `${HR_JDS_PATH}/${id}`;

/** The "Đề cử" tab of a JD (US-5.3), optionally with one nomination open. */
export const hrJdNominationsPath = (id: number, nominationId?: number) =>
  `${hrJdPath(id)}?tab=nominations${nominationId === undefined ? '' : `&nomination=${nominationId}`}`;

/** The "Phỏng vấn" tab of a JD (US-5.4): interviews, results and offers. */
export const hrJdInterviewsPath = (id: number) => `${hrJdPath(id)}?tab=interviews`;
