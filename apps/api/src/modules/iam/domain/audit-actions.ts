/** Audit actions written by the iam module (entity `user`). */
export const IAM_AUDIT_ACTIONS = {
  /** A new HR account without a password, bound to a company. */
  HR_INVITED: 'HR_INVITED',
  /** A fresh link for an HR account that has not accepted yet. */
  HR_REINVITED: 'HR_REINVITED',
  /** The invited HR set a password. */
  HR_INVITATION_ACCEPTED: 'HR_INVITATION_ACCEPTED',
} as const;

/** Audit entity of `users` rows. */
export const USER_ENTITY = 'user';
