// Who may use the instructor page.
// The same rule is enforced on the server in firestore.rules. This copy only
// decides which screen to show, so a person who is not allowed gets a clear
// message instead of errors.

import { INSTRUCTOR_DOMAIN, OWNER_UIDS } from './config.js';

export function canInstruct(user, domain = INSTRUCTOR_DOMAIN, owners = OWNER_UIDS) {
  if (!user || user.isAnonymous) return false;
  if (owners.includes(user.uid)) return true;
  const email = String(user.email || '').toLowerCase();
  return user.emailVerified === true && email.endsWith('@' + domain);
}
