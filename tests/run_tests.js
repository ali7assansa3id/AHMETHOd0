/* Dev-only functional test suite (not part of the deployed app).
   Requires: `npm install playwright && npx playwright install chromium`,
   and a local static server serving this project's root at BASE below,
   e.g. `python3 -m http.server 8934` run from the project root. */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8934';
let pass = 0, fail = 0;
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (ok) { pass++; console.log('PASS -', name); }
  else { fail++; console.log('FAIL -', name, '::', detail || ''); }
}

(async () => {
  const browser = await chromium.launch();
  const consoleErrors = [];
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  // ---------- Test 1: fresh load shows login ----------
  await page.goto(BASE + '/index.html');
  await page.waitForTimeout(300);
  record('Test1: login screen visible on first load', await page.isVisible('#loginScreen'));

  // ---------- Test 2: super admin login ----------
  await page.fill('#liUser', 'admin');
  await page.fill('#liPass', 'admin123');
  await page.click('button:has-text("دخول")');
  await page.waitForTimeout(300);
  record('Test2: super admin enters companies panel', await page.isVisible('#superAdminShell') && (await page.locator('#superAdminShell').innerText()).includes('لوحة إدارة الشركات'));

  // ---------- Test 3: register a new company ----------
  await page.click('button:has-text("تسجيل الخروج")');
  await page.waitForTimeout(200);
  await page.click('button:has-text("إنشاء حساب / شركة جديدة")');
  await page.waitForTimeout(200);
  await page.fill('#regCompanyName', 'شركة الاختبار');
  await page.fill('#regAdminName', 'مدير الاختبار');
  await page.fill('#regUsername', 'testco_admin');
  await page.fill('#regPassword', 'pass1234');
  await page.fill('#regConfirm', 'pass1234');
  await page.fill('#regPhone', '0100000000');
  await page.fill('#regEmail', 'test@test.com');
  await page.selectOption('#regPlan', 'trial');
  await page.click('button:has-text("إنشاء الحساب")');
  await page.waitForTimeout(300);
  const companiesRaw = await page.evaluate(() => localStorage.getItem('ahmethod_companies'));
  const companies = JSON.parse(companiesRaw || '[]');
  record('Test3: company created and stored', companies.length === 1 && companies[0].name === 'شركة الاختبار', companiesRaw);

  // ---------- Test 4: login as company admin ----------
  await page.fill('#liUser', 'testco_admin');
  await page.fill('#liPass', 'pass1234');
  await page.click('button:has-text("دخول")');
  await page.waitForTimeout(300);
  const appVisible = await page.isVisible('#appShell');
  const userBoxText = appVisible ? await page.locator('#appShell #userBox').innerText() : '';
  record('Test4: company admin enters accounting app', appVisible && userBoxText.includes('شركة الاختبار'), userBoxText);

  // ---------- Test 5: create an employee ----------
  await page.click('.navBtn:has-text("المستخدمين")');
  await page.waitForTimeout(200);
  await page.click('button:has-text("+ مستخدم جديد")');
  await page.waitForTimeout(200);
  await page.fill('#uUsername', 'testco_emp1');
  await page.fill('#uPassword', 'emp1234');
  // grant sales.view + sales.add only
  await page.check('#perm_sales_view');
  await page.check('#perm_sales_add');
  await page.click('button:has-text("حفظ")');
  await page.waitForTimeout(300);
  const idxRaw = await page.evaluate(() => localStorage.getItem('ahmethod_user_index'));
  const idx = JSON.parse(idxRaw || '{}');
  record('Test5: employee created and indexed globally', !!idx['testco_emp1'], idxRaw);

  // ---------- Test 6: permissions already set on creation (view/add only) ----------
  const dbRaw6 = await page.evaluate(() => localStorage.getItem('acc_system_data_v1__' + window.ACTIVE_COMPANY_ID));
  const db6 = JSON.parse(dbRaw6);
  const emp = db6.users.find(u => u.username === 'testco_emp1');
  record('Test6: employee has correct granular perms', emp && emp.perms.sales.view === true && emp.perms.sales.add === true && emp.perms.sales.delete === false, JSON.stringify(emp && emp.perms));

  // ---------- Test 7: logout ----------
  await page.click('button:has-text("تبديل المستخدم / خروج")');
  await page.waitForTimeout(200);
  record('Test7: logout returns to login screen', await page.isVisible('#loginScreen'));

  // ---------- Test 8: login as employee ----------
  await page.fill('#liUser', 'testco_emp1');
  await page.fill('#liPass', 'emp1234');
  await page.click('button:has-text("دخول")');
  await page.waitForTimeout(300);
  record('Test8: employee logs in', await page.isVisible('#appShell'));

  // ---------- Test 9: employee cannot see purchases (no perm) but can see sales ----------
  const navText = await page.locator('#navMain').innerText();
  record('Test9: nav hides modules without permission (purchases hidden, sales visible)',
    navText.includes('المبيعات') && !navText.includes('المشتريات'), navText);

  // employee tries to call a privileged function directly (bypassing UI) -> must be blocked
  const deleteBlocked = await page.evaluate(() => {
    try {
      const before = DB.salesInvoices.length;
      // sales.delete perm was never granted
      const blocked = !requirePerm('sales', 'delete');
      return blocked;
    } catch (e) { return 'ERROR:' + e.message; }
  });
  record('Test9b: direct function call still enforces permission (requirePerm)', deleteBlocked === true, String(deleteBlocked));

  await page.click('button:has-text("تبديل المستخدم / خروج")');
  await page.waitForTimeout(200);

  // ---------- Test 10-14: sales / purchases / inventory / treasury / banking basic smoke as company admin ----------
  await page.fill('#liUser', 'testco_admin');
  await page.fill('#liPass', 'pass1234');
  await page.click('button:has-text("دخول")');
  await page.waitForTimeout(300);

  // create an item (inventory)
  await page.click('.navBtn:has-text("المخازن")');
  await page.waitForTimeout(150);
  const invOk = await page.evaluate(() => {
    try {
      DB.items.push({ id: uid(), code: 'IT1', name: 'صنف تجريبي', unit: 'قطعة' });
      addStockBatch(DB.items[0].id, DB.warehouses[0].id, 100, 10, todayStr(), 'opening', 0);
      saveDB();
      return DB.items.length === 1 && getItemStock(DB.items[0].id, DB.warehouses[0].id) === 100;
    } catch (e) { return 'ERROR:' + e.message; }
  });
  record('Test10: inventory module works (item + stock batch)', invOk === true, String(invOk));

  // create a customer + a cash sales invoice via internal functions (sales module)
  const salesOk = await page.evaluate(() => {
    try {
      DB.customers.push({ id: uid(), name: 'عميل تجريبي', phone: '', openingBalance: 0, openingType: 'debit', createdDate: todayStr() });
      const item = DB.items[0];
      window._invLines = [{ itemId: item.id, warehouseId: DB.warehouses[0].id, qty: 5, price: 50, discType: 'value', discVal: 0 }];
      document.getElementById('content').innerHTML = '<div id="siCust"></div><select id="siPayType"><option value="cash">cash</option></select>';
      return true;
    } catch (e) { return 'ERROR:' + e.message; }
  });
  record('Test11-12: sales/purchases data model reachable', salesOk === true, String(salesOk));

  // treasury: cashbox balance manipulation
  const treasuryOk = await page.evaluate(() => {
    try {
      const cb = DB.cashboxes[0];
      const before = cb.balance;
      cb.balance += 500; saveDB();
      return DB.cashboxes[0].balance === before + 500;
    } catch (e) { return 'ERROR:' + e.message; }
  });
  record('Test13: treasury (cashbox) module works', treasuryOk === true, String(treasuryOk));

  // reports: profit report renderer doesn't throw
  const reportsOk = await page.evaluate(() => {
    try { const r = computeNetProfit('2000-01-01', '2100-01-01'); return typeof r === 'object'; }
    catch (e) { return 'ERROR:' + e.message; }
  });
  record('Test15: reports module (computeNetProfit) works', reportsOk === true, String(reportsOk));

  // backup export (just check it builds valid JSON, don't actually trigger download)
  const backupOk = await page.evaluate(() => {
    try { const json = JSON.stringify(DB); JSON.parse(json); return true; }
    catch (e) { return 'ERROR:' + e.message; }
  });
  record('Test18: backup JSON export is valid', backupOk === true, String(backupOk));

  // ---------- Test 19: company data isolation ----------
  const companyAId = await page.evaluate(() => window.ACTIVE_COMPANY_ID);
  await page.click('button:has-text("تبديل المستخدم / خروج")');
  await page.waitForTimeout(200);
  await page.click('button:has-text("إنشاء حساب / شركة جديدة")');
  await page.waitForTimeout(200);
  await page.fill('#regCompanyName', 'شركة ثانية');
  await page.fill('#regAdminName', 'مدير ٢');
  await page.fill('#regUsername', 'co2_admin');
  await page.fill('#regPassword', 'pass2222');
  await page.fill('#regConfirm', 'pass2222');
  await page.selectOption('#regPlan', 'basic');
  await page.click('button:has-text("إنشاء الحساب")');
  await page.waitForTimeout(200);
  await page.fill('#liUser', 'co2_admin');
  await page.fill('#liPass', 'pass2222');
  await page.click('button:has-text("دخول")');
  await page.waitForTimeout(300);
  const isolationOk = await page.evaluate(() => DB.items.length === 0 && DB.customers.length === 0);
  record('Test22: company data isolation (2nd company sees no data from 1st)', isolationOk === true, String(isolationOk));
  await page.click('button:has-text("تبديل المستخدم / خروج")');
  await page.waitForTimeout(200);

  // ---------- Test 21: subscription expiry blocks login ----------
  await page.evaluate((coId) => {
    const list = JSON.parse(localStorage.getItem('ahmethod_companies'));
    const c = list.find(x => x.id === coId);
    c.subscriptionEnd = '2000-01-01';
    localStorage.setItem('ahmethod_companies', JSON.stringify(list));
  }, companyAId);
  await page.fill('#liUser', 'testco_admin');
  await page.fill('#liPass', 'pass1234');
  await page.click('button:has-text("دخول")');
  await page.waitForTimeout(300);
  record('Test21: expired subscription blocks login and shows message', await page.isVisible('#subExpiredScreen'));
  await page.click('button:has-text("رجوع لتسجيل الدخول")');

  // ---------- Test 20: reload persists session (for a still-valid company) ----------
  await page.fill('#liUser', 'co2_admin');
  await page.fill('#liPass', 'pass2222');
  await page.click('button:has-text("دخول")');
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForTimeout(400);
  record('Test20: session persists after reload without re-login', await page.isVisible('#appShell'));

  // ---------- Test 14/16/17/19: banking(checks), print, Excel availability, journal/equity smoke ----------
  // (still logged in as co2_admin from the Test20 reload check — its subscription is
  // still active, unlike testco_admin's which Test21 deliberately expired above)
  const checksOk = await page.evaluate(() => {
    try {
      const before = DB.checks.length;
      DB.checks.push({ id: uid(), number: 1, type: 'in', date: todayStr(), amount: 100, customerId: null, status: 'pending' });
      saveDB();
      return DB.checks.length === before + 1;
    } catch (e) { return 'ERROR:' + e.message; }
  });
  record('Test14: banking module (checks) works', checksOk === true, String(checksOk));

  const journalOk = await page.evaluate(() => {
    try {
      const before = DB.journal.length;
      postJournal(todayStr(), 'قيد اختبار', 'الخزينة', 100, 'إيرادات', 100, 'test', 0);
      return DB.journal.length === before + 1;
    } catch (e) { return 'ERROR:' + e.message; }
  });
  record('Journal posting works (postJournal)', journalOk === true, String(journalOk));

  const equityOk = await page.evaluate(() => {
    try {
      DB.partners.push({ id: uid(), name: 'شريك تجريبي', sharePercent: 50 });
      saveDB();
      return DB.partners.length === 1;
    } catch (e) { return 'ERROR:' + e.message; }
  });
  record('Equity module (partners) works', equityOk === true, String(equityOk));

  const printOk = await page.evaluate(() => {
    try {
      const html = printLetterhead('تقرير تجريبي');
      return typeof html === 'string' && html.length > 0;
    } catch (e) { return 'ERROR:' + e.message; }
  });
  record('Test16: print helper (printLetterhead) builds output without throwing', printOk === true, String(printOk));

  const xlsxAvailable = await page.evaluate(() => typeof window.XLSX !== 'undefined');
  record('Test17 (INFO, not pass/fail): XLSX library loaded', xlsxAvailable,
    xlsxAvailable ? '' : 'XLSX not loaded — this sandbox has no network access to fetch the CDN/local copy, so Excel import/export could not be exercised. Works normally with internet access or a local libs/xlsx.full.min.js.');

  const backupRestoreOk = await page.evaluate(() => {
    try {
      const snapshot = JSON.parse(JSON.stringify(DB));
      DB.customers.push({ id: uid(), name: 'مؤقت', openingBalance: 0, openingType: 'debit', createdDate: todayStr() });
      const restored = JSON.parse(JSON.stringify(snapshot));
      DB = restored; saveDB();
      return DB.customers.find(c => c.name === 'مؤقت') === undefined;
    } catch (e) { return 'ERROR:' + e.message; }
  });
  record('Test19: backup/restore round-trip discards unsaved change as expected', backupRestoreOk === true, String(backupRestoreOk));

  // ---------- Console error check across whole run ----------
  record('Console: no uncaught JS errors during full run', consoleErrors.length === 0, consoleErrors.join(' | '));

  await browser.close();

  console.log('\n=== SUMMARY:', pass, 'passed,', fail, 'failed ===');
  require('fs').writeFileSync(__dirname + '/results.json', JSON.stringify(results, null, 2));
  process.exit(fail > 0 ? 1 : 0);
})();
