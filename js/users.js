/* ============================================================
   AHMETHOD — js/users.js
   The login screen only asks for a username + password (no company
   field). To route a login to the right company (or to the super
   admin) we keep one small platform-wide index:
   { username -> {companyId, role} } — synced via js/storage.js.

   This file keeps that index in sync. It never touches DB.users
   itself (that stays exactly as managed in js/app.js) — it only
   mirrors it.
   ============================================================ */

function isUsernameTakenGlobally(username, excludeCompanyId) {
  const idx = getUserIndex();
  const entry = idx[username];
  if (!entry) return false;
  if (excludeCompanyId && entry.companyId === excludeCompanyId) return false; // same company editing its own user
  return true;
}

/* Called from js/app.js's saveDB(), once a company is the "active" one
   (ACTIVE_COMPANY_ID set by js/auth.js). Re-scans the current company's
   DB.users and updates the index: adds new usernames, removes ones that
   no longer exist, leaves everyone else untouched. */
function syncUserIndexForCurrentCompany() {
  if (!window.ACTIVE_COMPANY_ID || typeof DB === 'undefined' || !DB || !Array.isArray(DB.users)) return;
  const companyId = window.ACTIVE_COMPANY_ID;
  const idx = getUserIndex();

  const currentUsernames = new Set(DB.users.map(u => u.username));
  Object.keys(idx).forEach(uname => {
    if (idx[uname].companyId === companyId && !currentUsernames.has(uname)) {
      delete idx[uname];
    }
  });

  DB.users.forEach(u => {
    idx[u.username] = {
      companyId,
      role: u.isAdmin ? PLATFORM_ROLES.COMPANY_ADMIN : PLATFORM_ROLES.EMPLOYEE,
    };
  });

  saveUserIndex(idx);
}

/* Registers a brand-new company_admin username in the index (used once,
   right after a new company + its DB are created during registration). */
function registerCompanyAdminInIndex(username, companyId) {
  const idx = getUserIndex();
  idx[username] = { companyId, role: PLATFORM_ROLES.COMPANY_ADMIN };
  saveUserIndex(idx);
}

/* Removes every index entry that points at a given company (used when a
   super admin permanently deletes a company). */
function removeCompanyFromIndex(companyId) {
  const idx = getUserIndex();
  Object.keys(idx).forEach(uname => {
    if (idx[uname].companyId === companyId) delete idx[uname];
  });
  saveUserIndex(idx);
}
