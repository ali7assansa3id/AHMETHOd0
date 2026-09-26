/* ============================================================
   AHMETHOD — js/utils.js
   Small shared helpers used ONLY by the multi-tenant layer
   (auth.js / companies.js / users.js). Nothing here duplicates
   or overrides anything from js/app.js (the accounting engine),
   which keeps its own uid()/fmt()/todayStr() untouched.
   ============================================================ */

const SUBSCRIPTION_PLANS = {
  trial: { label: 'تجريبي — 14 يوم', days: 14 },
  basic: { label: 'أساسي — 30 يوم', days: 30 },
  pro:   { label: 'احترافي — 365 يوم', days: 365 },
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

function daysLeft(endDateStr) {
  const end = new Date(endDateStr + 'T00:00:00');
  const now = new Date(todayISO() + 'T00:00:00');
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

function genPlatformId(prefix) {
  return (prefix || 'id') + '_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
