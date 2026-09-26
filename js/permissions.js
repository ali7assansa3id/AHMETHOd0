/* ============================================================
   AHMETHOD — js/permissions.js
   Role constants for the multi-tenant layer.

   The actual granular permission ENGINE (view/add/edit/delete
   per module) lives in js/app.js:
     - DB.users[].isAdmin        -> this user is the company's admin
     - DB.users[].perms[module]  -> {view,add,edit,delete} booleans
     - requirePerm(moduleId, action) -> enforcement, used everywhere
     - renderNav() hides admin-only sections from non-admins
   This file only defines the three platform-wide roles and how
   they map onto it:
     super_admin    -> platform owner, manages companies/subscriptions
                       (not part of any single company's DB.users)
     company_admin  -> a company's DB.users entry with isAdmin:true
                       (created automatically at registration)
     employee       -> a company's DB.users entry with isAdmin:false
                       and a specific perms{} object, created/edited
                       by the company_admin from the "المستخدمون
                       والصلاحيات" screen (renderUsers() in app.js)
   ============================================================ */

const PLATFORM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  COMPANY_ADMIN: 'company_admin',
  EMPLOYEE: 'employee',
};

function isCompanyAdminUser(u) { return !!(u && u.isAdmin); }
