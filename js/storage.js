/* ============================================================
   AHMETHOD — js/storage.js
   Namespaced localStorage access for PLATFORM-level data:
   companies, the super-admin account, and the platform-wide
   username index. These are now ALSO synced to Firebase
   (path: ERP_PLATFORM) so registering a company, or the super
   admin account, is visible from any device/browser — not just
   the one that created it. localStorage stays as the instant
   local copy (works even if the network request hasn't landed
   yet), exactly the same pattern app.js already uses for each
   company's own accounting data.

   The current login session (NS.session) is NOT synced to the
   cloud — a session is meant to be per-device/per-browser, like
   any normal login.

   Company accounting data itself is NOT stored here — it keeps
   using the key from js/app.js ('acc_system_data_v1__<companyId>'
   locally, 'ERP_COMPANIES/<companyId>' on Firebase). See
   migrateLegacyDataIfNeeded() in js/auth.js for how data from
   the original single-tenant version (before this multi-tenant
   layer existed) gets picked up automatically.
   ============================================================ */

const NS = {
  companies: 'ahmethod_companies',
  platformUsers: 'ahmethod_platform_users', // the super_admin account
  userIndex: 'ahmethod_user_index',         // { username: {companyId, role} } — login router
  session: 'ahmethod_session',              // persisted current login (local only, not synced)
  legacyMigrated: 'ahmethod_legacy_migrated_v1',
};

function psGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function psSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---------------- Firebase sync for platform-level data ---------------- */
function fbPlatformRef() {
  return firebase.database().ref('ERP_PLATFORM');
}

function pushPlatformToCloud() {
  try {
    fbPlatformRef().set({
      companies: getCompanies(),
      platformUsers: getPlatformUsers(),
      userIndex: getUserIndex(),
    }).catch(err => {
      console.error('فشلت مزامنة بيانات المنصة (الشركات/المستخدمين) مع Firebase', err);
    });
  } catch (e) {
    // Firebase قد لا يكون جاهزًا بعد لحظة أول استدعاء — يتجاهل بأمان
  }
}

// يُستدعى مرة واحدة عند فتح الصفحة، قبل أي شيء آخر، عشان نضمن إن أي
// شركة أو مستخدم اتسجل من جهاز تاني يظهر هنا كمان.
function loadPlatformFromCloud(onReady) {
  try {
    fbPlatformRef().once('value').then(snap => {
      const remote = snap.val();
      if (remote) {
        if (remote.companies) psSet(NS.companies, remote.companies);
        if (remote.platformUsers) psSet(NS.platformUsers, remote.platformUsers);
        if (remote.userIndex) psSet(NS.userIndex, remote.userIndex);
      }
      if (onReady) onReady();
    }).catch(err => {
      console.error('تعذر تحميل بيانات المنصة من Firebase — سيتم استخدام آخر نسخة محلية', err);
      if (onReady) onReady();
    });
  } catch (e) {
    if (onReady) onReady();
  }
}

function getCompanies() { return psGet(NS.companies, []); }
function saveCompanies(list) { psSet(NS.companies, list); pushPlatformToCloud(); }
function getCompanyById(id) { return getCompanies().find(c => c.id === id) || null; }

function getPlatformUsers() { return psGet(NS.platformUsers, []); }
function savePlatformUsers(list) { psSet(NS.platformUsers, list); pushPlatformToCloud(); }

function getUserIndex() { return psGet(NS.userIndex, {}); }
function saveUserIndex(idx) { psSet(NS.userIndex, idx); pushPlatformToCloud(); }

function getSession() { return psGet(NS.session, null); }
function saveSession(s) { psSet(NS.session, s); }
function clearSessionStorage() { localStorage.removeItem(NS.session); }
