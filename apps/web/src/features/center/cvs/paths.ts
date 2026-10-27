/** Route of "CV cần xử lý" in the center portal (router.tsx); `?campaign=<id>` preselects a campaign. */
export const CENTER_CVS_PATH = '/admin/cvs';

export const centerCvsPath = (campaignId?: number) =>
  campaignId === undefined ? CENTER_CVS_PATH : `${CENTER_CVS_PATH}?campaign=${campaignId}`;
