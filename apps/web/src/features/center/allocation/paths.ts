/** Route of "Phân bổ" in the center portal (router.tsx); the campaign is in `?campaign=`. */
export const ALLOCATION_PATH = '/admin/allocation';

export const allocationPath = (campaignId: number) => `${ALLOCATION_PATH}?campaign=${campaignId}`;
