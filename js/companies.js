/* ============================================================
   AHMETHOD — js/companies.js
   - Registration ("إنشاء حساب جديد") shown from the login screen
   - Super admin panel: list companies, manage subscriptions,
     suspend/activate, delete, and "view as" a company's admin
     to inspect its data/reports.

   Reuses openModal/closeModal/toast/uid/fmt/defaultData/loadDB/
   saveDB/showApp from js/app.js — none of that is duplicated here.
   ============================================================ */

function createCompanyDatabase(companyId, companyName, adminUsername, adminPassword) {
  const data = defaultData(); // js/app.js factory
  data.users = [{ id: 1, name: adminUsername, username: adminUsername, password: adminPassword, isAdmin: true, perms: {} }];
  data.settings = { companyName: companyName, logo: '' };
  localStorage.setItem('acc_system_data_v1__' + companyId, JSON.stringify(data));
  // ارفعها لـ Firebase فورًا كمان عشان المزامنة السحابية تشتغل من أول لحظة
  try {
    firebase.database().ref('ERP_COMPANIES/' + companyId).set(data).catch(err => {
      console.error('فشل رفع بيانات الشركة الجديدة إلى Firebase', err);
    });
  } catch (e) { /* يتم تجاهلها بأمان — النسخة المحلية موجودة بالفعل */ }
}

/* ---------------- Registration ---------------- */
function openRegisterModal() {
  const planOptions = Object.entries(SUBSCRIPTION_PLANS)
    .map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
  openModal('إنشاء حساب / شركة جديدة', `
    <div class="grid3">
      <div class="field"><label>اسم الشركة</label><input id="regCompanyName"></div>
      <div class="field"><label>اسم المدير</label><input id="regAdminName"></div>
      <div class="field"><label>اسم المستخدم</label><input id="regUsername" autocomplete="off"></div>
      <div class="field"><label>كلمة المرور</label><input id="regPassword" type="password"></div>
      <div class="field"><label>تأكيد كلمة المرور</label><input id="regConfirm" type="password"></div>
      <div class="field"><label>رقم الهاتف</label><input id="regPhone"></div>
      <div class="field"><label>البريد الإلكتروني</label><input id="regEmail" type="email"></div>
      <div class="field"><label>نوع الاشتراك</label><select id="regPlan">${planOptions}</select></div>
    </div>
    <div style="color:#ef4444; font-size:13px; margin-top:8px;" id="regErr"></div>
    <div style="text-align:left;margin-top:16px;">
      <button class="btn secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn" onclick="submitRegistration()">إنشاء الحساب</button>
    </div>
  `);
}

function submitRegistration() {
  const val = id => (document.getElementById(id).value || '').trim();
  const companyName = val('regCompanyName');
  const adminName = val('regAdminName');
  const username = val('regUsername');
  const password = document.getElementById('regPassword').value;
  const confirmPw = document.getElementById('regConfirm').value;
  const phone = val('regPhone');
  const email = val('regEmail');
  const planKey = document.getElementById('regPlan').value;
  const err = document.getElementById('regErr');
  const showErr = msg => { err.textContent = msg; };

  if (!companyName || !adminName || !username || !password || !confirmPw) { showErr('يرجى تعبئة جميع الحقول المطلوبة'); return; }
  if (password !== confirmPw) { showErr('كلمة المرور وتأكيدها غير متطابقين'); return; }
  if (password.length < 4) { showErr('كلمة المرور قصيرة جدًا (4 أحرف على الأقل)'); return; }
  if (isUsernameTakenGlobally(username)) { showErr('اسم المستخدم مستخدم بالفعل، اختر اسمًا آخر'); return; }

  const companyId = genPlatformId('co');
  const plan = SUBSCRIPTION_PLANS[planKey] || SUBSCRIPTION_PLANS.trial;
  const start = todayISO();
  const end = addDaysToDate(start, plan.days);

  const company = {
    id: companyId, name: companyName, adminName, phone, email,
    subscriptionType: planKey, subscriptionStart: start, subscriptionEnd: end,
    status: 'active', createdAt: new Date().toISOString(),
  };
  const companies = getCompanies();
  companies.push(company);
  saveCompanies(companies);

  createCompanyDatabase(companyId, companyName, username, password);
  registerCompanyAdminInIndex(username, companyId);

  closeModal();
  toast('تم إنشاء الحساب بنجاح، يمكنك تسجيل الدخول الآن');
  document.getElementById('liUser').value = username;
  document.getElementById('liPass').value = '';
  document.getElementById('liPass').focus();
}

/* ---------------- Super admin panel ---------------- */
function computeLiveStatus(company) {
  if (company.status === 'suspended') return 'suspended';
  return daysLeft(company.subscriptionEnd) < 0 ? 'expired' : 'active';
}

function renderCompaniesPanel() {
  const shell = document.getElementById('superAdminShell');
  const companies = getCompanies();
  const statusLabel = { active: 'نشط', expired: 'منتهي', suspended: 'موقوف' };
  const statusClass = { active: 'paid', expired: 'unpaid', suspended: 'partial' };

  shell.innerHTML = `
   <div class="header" id="saTopbar"><h3>📒 AHMETHOD — لوحة إدارة الشركات</h3>
     <div style="display:flex;align-items:center;gap:10px;font-size:12px;">
       <span>👤 admin (المدير العام)</span>
       <button class="btn secondary" style="padding:4px 8px;font-size:12px;" onclick="platformLogout()">تسجيل الخروج</button>
     </div>
   </div>
   <div class="card">
     <div class="cardHead"><h2>الشركات المشتركة (${companies.length})</h2></div>
     <div class="tableWrap">
      ${companies.length ? `<table><thead><tr>
        <th>الشركة</th><th>المدير</th><th>الهاتف</th><th>البريد</th><th>الاشتراك</th><th>البداية</th><th>النهاية</th><th>الحالة</th><th></th>
      </tr></thead><tbody>
      ${companies.map(c => {
        const live = computeLiveStatus(c);
        return `<tr>
         <td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.adminName)}</td><td>${escapeHtml(c.phone || '-')}</td><td>${escapeHtml(c.email || '-')}</td>
         <td>${SUBSCRIPTION_PLANS[c.subscriptionType] ? SUBSCRIPTION_PLANS[c.subscriptionType].label : c.subscriptionType}</td>
         <td>${c.subscriptionStart}</td><td>${c.subscriptionEnd}</td>
         <td><span class="tag ${statusClass[live]}">${statusLabel[live]}</span></td>
         <td style="white-space:nowrap;">
          <button class="btn secondary" style="padding:2px 6px;" onclick="viewCompanyAsAdmin('${c.id}')">دخول للبيانات</button>
          <button class="btn secondary" style="padding:2px 6px;" onclick="openEditSubscriptionModal('${c.id}')">الاشتراك</button>
          ${c.status === 'suspended'
            ? `<button class="btn secondary" style="padding:2px 6px;" onclick="setCompanyStatus('${c.id}','active')">تفعيل</button>`
            : `<button class="btn secondary" style="padding:2px 6px;" onclick="setCompanyStatus('${c.id}','suspended')">تعليق</button>`}
          <button class="btn danger" style="padding:2px 6px;" onclick="deleteCompanyAccount('${c.id}')">حذف</button>
         </td>
        </tr>`;
      }).join('')}
      </tbody></table>` : '<div class="empty" style="padding:20px;text-align:center;color:#94a3b8;">لا توجد شركات مسجلة بعد — استخدم "إنشاء حساب جديد" من شاشة الدخول</div>'}
     </div>
    </div>`;
}

function openEditSubscriptionModal(companyId) {
  const c = getCompanyById(companyId); if (!c) return;
  const planOptions = Object.entries(SUBSCRIPTION_PLANS)
    .map(([k, p]) => `<option value="${k}" ${c.subscriptionType === k ? 'selected' : ''}>${p.label}</option>`).join('');
  openModal('إدارة اشتراك: ' + escapeHtml(c.name), `
   <div class="grid3">
    <div class="field"><label>نوع الاشتراك</label><select id="subPlan">${planOptions}</select></div>
    <div class="field"><label>الحالة</label>
      <select id="subStatus">
        <option value="active" ${c.status === 'active' ? 'selected' : ''}>نشط</option>
        <option value="suspended" ${c.status === 'suspended' ? 'selected' : ''}>موقوف</option>
      </select>
    </div>
    <div class="field"><label>تاريخ البداية</label><input id="subStart" type="date" value="${c.subscriptionStart}"></div>
    <div class="field"><label>تاريخ النهاية</label><input id="subEnd" type="date" value="${c.subscriptionEnd}"></div>
   </div>
   <p style="color:#64748b;font-size:12px;margin-top:8px;">زر "تمديد حسب الخطة" يضيف مدة الخطة المختارة لتاريخ النهاية (أو من اليوم إن كان الاشتراك منتهيًا).</p>
   <div style="text-align:left;margin-top:16px;">
    <button class="btn secondary" onclick="closeModal()">إلغاء</button>
    <button class="btn secondary" onclick="extendSubscriptionByPlan()">تمديد حسب الخطة</button>
    <button class="btn" onclick="saveSubscription('${companyId}')">حفظ</button>
   </div>
  `);
}
function extendSubscriptionByPlan() {
  const planKey = document.getElementById('subPlan').value;
  const plan = SUBSCRIPTION_PLANS[planKey];
  const currentEnd = document.getElementById('subEnd').value || todayISO();
  const base = (new Date(currentEnd) > new Date(todayISO())) ? currentEnd : todayISO();
  document.getElementById('subEnd').value = addDaysToDate(base, plan.days);
}
function saveSubscription(companyId) {
  const companies = getCompanies();
  const c = companies.find(x => x.id === companyId); if (!c) return;
  c.subscriptionType = document.getElementById('subPlan').value;
  c.subscriptionStart = document.getElementById('subStart').value;
  c.subscriptionEnd = document.getElementById('subEnd').value;
  c.status = document.getElementById('subStatus').value;
  saveCompanies(companies);
  closeModal(); renderCompaniesPanel(); toast('تم تحديث الاشتراك');
}
function setCompanyStatus(companyId, status) {
  const companies = getCompanies();
  const c = companies.find(x => x.id === companyId); if (!c) return;
  c.status = status; saveCompanies(companies); renderCompaniesPanel();
  toast(status === 'active' ? 'تم تفعيل الاشتراك' : 'تم تعليق الاشتراك');
}
function deleteCompanyAccount(companyId) {
  const c = getCompanyById(companyId); if (!c) return;
  if (!confirm('سيتم حذف شركة "' + c.name + '" وكل بياناتها نهائيًا. متابعة؟')) return;
  if (!confirm('تأكيد نهائي: لا يمكن التراجع عن هذا الإجراء. حذف الشركة؟')) return;
  localStorage.removeItem('acc_system_data_v1__' + companyId);
  try { firebase.database().ref('ERP_COMPANIES/' + companyId).remove(); } catch (e) {}
  saveCompanies(getCompanies().filter(x => x.id !== companyId));
  removeCompanyFromIndex(companyId);
  renderCompaniesPanel(); toast('تم حذف الشركة');
}

/* Lets the super admin open a company's own app to inspect its data/reports.
   Uses that company's own admin account context — not a separate "god mode". */
function viewCompanyAsAdmin(companyId) {
  const c = getCompanyById(companyId); if (!c) return;
  loadDB(companyId, function () {
    const admin = DB.users.find(u => u.isAdmin) || DB.users[0];
    if (!admin) { toast('لا يوجد مستخدمون في هذه الشركة'); return; }
    DB.currentUserId = admin.id; saveDB();
    saveSession({ role: 'company_view', companyId, userId: admin.id, viaSuperAdmin: true, loginTime: new Date().toISOString() });
    document.getElementById('superAdminShell').style.display = 'none';
    showApp();
    toast('عرض بيانات شركة: ' + c.name);
  });
}
