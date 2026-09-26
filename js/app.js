/* =========================================================
   نظام المحاسبة والمخازن المتكامل (ERP System)
   الجزء الأول: التهيئة + إدارة الحسابات + الفواتير
   ========================================================= */

// ---------- 1. التهيئة وقاعدة البيانات المحلية ----------
let DB = {
  users: [
    { id: 1, name: 'المدير العام', user: 'admin', pass: 'admin123', role: 'admin', perms: ['all'] }
  ],
  accounts: [
    { id: 100, code: '1', name: 'الأصول', type: 'asset', parentId: null },
    { id: 101, code: '11', name: 'الأصول المتداولة', type: 'asset', parentId: 100 },
    { id: 102, code: '111', name: 'الخزينة الرئيسية', type: 'asset', parentId: 101 },
    { id: 103, code: '112', name: 'البنك', type: 'asset', parentId: 101 },
    { id: 104, code: '113', name: 'العملاء', type: 'asset', parentId: 101 },
    { id: 105, code: '114', name: 'المخزون', type: 'asset', parentId: 101 },
    { id: 200, code: '2', name: 'الالتزامات', type: 'liability', parentId: null },
    { id: 201, code: '21', name: 'الموردين', type: 'liability', parentId: 200 },
    { id: 300, code: '3', name: 'الإيرادات', type: 'income', parentId: null },
    { id: 301, code: '31', name: 'مبيعات البضائع', type: 'income', parentId: 300 },
    { id: 400, code: '4', name: 'المصروفات', type: 'expense', parentId: null },
    { id: 401, code: '41', name: 'تكلفة البضاعة المباعة', type: 'expense', parentId: 400 }
  ],
  items: [
    { id: 1, code: 'IT001', name: 'صنف افتراضي', unit: 'قطعة', minQty: 5 }
  ],
  warehouses: [
    { id: 1, name: 'المخزن الرئيسي', code: 'WH1' }
  ],
  customers: [],
  suppliers: [],
  invoices: [],
  journalEntries: [],
  stockOps: [],
  stockBatches: [],
  auditLogs: []
};

let currentUserId = null;

/* ---------- Firebase Realtime Database ---------- */
// إعدادات مشروعك على Firebase (ahmethodpro) — القيم دي client-side API key
// عادي تكون ظاهرة في الكود، الحماية الحقيقية بتيجي من الـ Security Rules
// في لوحة تحكم Firebase (Realtime Database → Rules)، مش من إخفاء المفتاح ده.
const firebaseConfig = {
  apiKey: "AIzaSyCnuv-hBxucSgRN-_SD0i6jx3Xv7CR_gQU",
  authDomain: "ahmethodpro.firebaseapp.com",
  databaseURL: "https://ahmethodpro-default-rtdb.firebaseio.com",
  projectId: "ahmethodpro",
  storageBucket: "ahmethodpro.firebasestorage.app",
  messagingSenderId: "545312965626",
  appId: "1:545312965626:web:94eb7366be72a6dc965a43",
  measurementId: "G-L542GK25F0"
};
firebase.initializeApp(firebaseConfig);
const fbRef = firebase.database().ref('ERP_FULL_DB');

function saveDB() {
  // نسخة محلية فورية (تشتغل حتى لو النت مقطوع لحظتها)
  try {
    localStorage.setItem('ERP_FULL_DB', JSON.stringify(DB));
  } catch(e) {
    console.error('فشل حفظ البيانات في LocalStorage', e);
  }
  // مزامنة مع Firebase — لو فشلت، البيانات المحلية سليمة والنظام يكمل شغل عادي
  fbRef.set(DB).catch(err => {
    console.error('فشل حفظ البيانات على Firebase', err);
    toast('تعذّرت المزامنة مع قاعدة البيانات السحابية (تم الحفظ محليًا فقط)');
  });
}

function loadDB(onReady) {
  fbRef.once('value')
    .then(snapshot => {
      const remote = snapshot.val();
      if (remote) {
        DB = { ...DB, ...remote };
      } else {
        // أول مرة تفتح فيها قاعدة البيانات السحابية فاضية - نرفعلها أي نسخة محلية قديمة موجودة
        mergeLocalFallback();
      }
      if (onReady) onReady();
    })
    .catch(err => {
      console.error('تعذر الاتصال بـ Firebase — سيتم استخدام آخر نسخة محلية محفوظة', err);
      mergeLocalFallback();
      if (onReady) onReady();
    });
}

function mergeLocalFallback() {
  const saved = localStorage.getItem('ERP_FULL_DB');
  if (saved) {
    try {
      DB = { ...DB, ...JSON.parse(saved) };
    } catch(e) {
      console.error('خطأ في تحميل النسخة المحلية الاحتياطية');
    }
  }
}

// ---------- 2. أدوات مساعدة (Utility Functions) ----------
function uid() { return Date.now() + Math.floor(Math.random() * 1000); }
function todayStr() { return new Date().toISOString().split('T')[0]; }
function fmt(num) { return Number(num || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function toast(msg) {
  const t = document.getElementById('toast');
  if(!t) return;
  t.innerText = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 3000);
}

function logAudit(action, module, details) {
  const u = DB.users.find(x => x.id === currentUserId);
  DB.auditLogs.push({
    id: uid(),
    user: u ? u.name : 'غير معروف',
    action, module, details,
    date: new Date().toLocaleString('ar-EG')
  });
  saveDB();
}

function requirePerm(module, perm) {
  const u = DB.users.find(x => x.id === currentUserId);
  if(!u) return false;
  if(u.role === 'admin' || u.perms.includes('all')) return true;
  return u.perms.includes(`${module}_${perm}`);
}

/* ---------- Modal Window Management ---------- */
function openModal(title, htmlContent, onConfirm, hideButtons = false) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modalOverlay">
      <div class="modalBox">
        <h3 style="margin-bottom:15px; border-bottom:1px solid #ccc; padding-bottom:8px;">${title}</h3>
        <div class="modalBody">${htmlContent}</div>
        <div style="margin-top:20px; text-align:left; display:flex; gap:8px; justify-content:flex-end;">
          ${!hideButtons ? `<button class="btn" id="modalOkBtn">حفظ</button>` : ''}
          <button class="btn secondary" onclick="closeModal()">إغلاق</button>
        </div>
      </div>
    </div>
  `;
  if(!hideButtons && onConfirm) {
    document.getElementById('modalOkBtn').onclick = onConfirm;
  }
}

function closeModal() {
  document.getElementById('modalRoot').innerHTML = '';
}

/* ---------- 3. تسجيل الدخول وإدارة الجلسات ---------- */
function doLogin() {
  const uInput = document.getElementById('liUser').value.trim();
  const pInput = document.getElementById('liPass').value.trim();
  const errEl = document.getElementById('liErr');

  const user = DB.users.find(x => x.user === uInput && x.pass === pInput);
  if (user) {
    currentUserId = user.id;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
    renderUserBox();
    renderNav();
    renderAll();
    logAudit('تسجيل دخول', 'الأمان', 'تم تسجيل الدخول بنجاح');
    toast('مرحباً بك في النظام');
  } else {
    errEl.innerText = 'اسم المستخدم أو كلمة المرور غير صحيحة';
  }
}

function doLogout() {
  logAudit('تسجيل خروج', 'الأمان', 'خروج المستخدم');
  currentUserId = null;
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('liPass').value = '';
}

function renderUserBox() {
  const u = DB.users.find(x => x.id === currentUserId);
  document.getElementById('userBox').innerHTML = `
    <span>المستخدم: <b>${u ? u.name : ''}</b> (${u ? u.role : ''})</span>
    <button class="btn danger" style="margin-right:10px; padding:4px 8px; font-size:12px;" onclick="doLogout()">تسجيل الخروج</button>
  `;
}

function renderNav() {
  const nav = document.getElementById('navMain');
  nav.innerHTML = `
    <button class="btn" onclick="renderInventory(document.getElementById('content'))">الأصناف والمخزون</button>
    <button class="btn" onclick="renderStockReceive(document.getElementById('content'))">إذن استلام</button>
    <button class="btn" onclick="renderStockIssue(document.getElementById('content'))">إذن صرف</button>
    <button class="btn" onclick="renderStockTransfer(document.getElementById('content'))">تحويل مخزني</button>
    <button class="btn" onclick="renderInvoices(document.getElementById('content'))">الفواتير والمبيعات</button>
    <button class="btn" onclick="renderAccountsTree(document.getElementById('content'))">شجرة الحسابات</button>
    <button class="btn" onclick="renderStockOps(document.getElementById('content'))">سجل الحركات</button>
    <button class="btn secondary" onclick="renderInvImportExport(document.getElementById('content'))">Excel استيراد/تصدير</button>
  `;
}

/* ---------- 4. شجرة الحسابات والدفاتر ---------- */
function renderAccountsTree(root) {
  root.innerHTML = `
    <div class="card">
      <div class="cardHead" style="display:flex; justify-content:space-between; align-items:center;">
        <h2>شجرة الحسابات العامة</h2>
        <button class="btn" onclick="openAccountModal()">+ إضافة حساب جديد</button>
      </div>
      <div class="tableWrap">
        <table>
          <thead>
            <tr><th>الكود</th><th>اسم الحساب</th><th>النوع</th><th>الحساب الأب</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            ${DB.accounts.map(acc => {
              const parent = DB.accounts.find(a => a.id === acc.parentId);
              return `<tr>
                <td><b>${acc.code}</b></td>
                <td>${acc.name}</td>
                <td>${acc.type}</td>
                <td>${parent ? parent.name : '-'}</td>
                <td>
                  <button class="btn secondary" style="padding:2px 6px;" onclick="openAccountModal(${acc.id})">تعديل</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openAccountModal(id = null) {
  const acc = id ? DB.accounts.find(x => x.id === id) : { code: '', name: '', type: 'asset', parentId: '' };
  openModal(id ? 'تعديل حساب' : 'إضافة حساب جديد', `
    <div class="field" style="margin-bottom:8px;"><label>كود الحساب</label><input id="accCode" value="${acc.code}"></div>
    <div class="field" style="margin-bottom:8px;"><label>اسم الحساب</label><input id="accName" value="${acc.name}"></div>
    <div class="field" style="margin-bottom:8px;"><label>نوع الحساب</label>
      <select id="accType">
        <option value="asset" ${acc.type==='asset'?'selected':''}>أصول</option>
        <option value="liability" ${acc.type==='liability'?'selected':''}>التزامات</option>
        <option value="income" ${acc.type==='income'?'selected':''}>إيرادات</option>
        <option value="expense" ${acc.type==='expense'?'selected':''}>مصروفات</option>
      </select>
    </div>
    <div class="field"><label>الحساب الأب</label>
      <select id="accParent">
        <option value="">لا يوجد (حساب رئيسي)</option>
        ${DB.accounts.filter(a => a.id !== id).map(a => `<option value="${a.id}" ${acc.parentId===a.id?'selected':''}>${a.name} (${a.code})</option>`).join('')}
      </select>
    </div>
  `, () => saveAccount(id));
}

function saveAccount(id) {
  const code = document.getElementById('accCode').value.trim();
  const name = document.getElementById('accName').value.trim();
  const type = document.getElementById('accType').value;
  const parentId = Number(document.getElementById('accParent').value) || null;

  if(!code || !name) { toast('بيانات الحساب غير مكتملة'); return; }

  if(id) {
    const acc = DB.accounts.find(x => x.id === id);
    if(acc) { acc.code = code; acc.name = name; acc.type = type; acc.parentId = parentId; }
  } else {
    DB.accounts.push({ id: uid(), code, name, type, parentId });
  }
  saveDB(); closeModal(); renderAccountsTree(document.getElementById('content')); toast('تم حفظ الحساب');
}

/* =========================================================
   نظام المحاسبة والمخازن المتكامل (ERP System)
   الجزء الثاني: إدارة المخزون + FIFO + الحركات والتصدير
   ========================================================= */

/* ---------- 5. منطق تقييم المخزون وحسابات (FIFO) ---------- */
function getItemStock(itemId, warehouseId = null) {
  let batches = DB.stockBatches.filter(b => b.itemId === itemId && b.remaining > 0);
  if (warehouseId) {
    batches = batches.filter(b => b.warehouseId === warehouseId);
  }
  return batches.reduce((sum, b) => sum + b.remaining, 0);
}

function addStockBatch(itemId, warehouseId, qty, unitCost, date, source, refId) {
  DB.stockBatches.push({
    id: uid(), 
    itemId, 
    warehouseId,
    qty: Number(qty), 
    remaining: Number(qty),
    unitCost: Number(unitCost), 
    date: date || todayStr(), 
    source, 
    refId
  });
  saveDB();
}

function consumeStockFIFO(itemId, warehouseId, qtyToConsume, updateDB = true) {
  let remainingNeed = qtyToConsume;
  let totalCost = 0;
  
  // ترتيب الدفعات المتاحة حسب التاريخ (الوارد أولاً يصرف أولاً)
  let batches = DB.stockBatches
    .filter(b => b.itemId === itemId && b.warehouseId === warehouseId && b.remaining > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  for (let b of batches) {
    if (remainingNeed <= 0) break;
    let take = Math.min(b.remaining, remainingNeed);
    totalCost += take * b.unitCost;
    remainingNeed -= take;
    if (updateDB) {
      b.remaining -= take;
    }
  }

  if (remainingNeed > 0.0001) return null; // الرصيد المتوفر لا يكفي
  if (updateDB) saveDB();
  return { cost: totalCost };
}

/* ---------- 6. إدارة الأصناف وقائمة المخزون ---------- */
function renderAll() {
  const content = document.getElementById('content');
  if (content) renderInventory(content);
}

function renderInventory(root) {
  root.innerHTML = `
    <div class="card">
      <div class="cardHead" style="display:flex; justify-content:space-between; align-items:center;">
        <h2>قائمة الأصناف والمخزون</h2>
        <button class="btn" onclick="openItemModal()">+ إضافة صنف جديد</button>
      </div>
      <div class="tableWrap">
        <table>
          <thead>
            <tr><th>الكود</th><th>اسم الصنف</th><th>الوحدة</th><th>إجمالي المخزون</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            ${DB.items.map(i => `
              <tr>
                <td>${i.code}</td>
                <td><b>${i.name}</b></td>
                <td>${i.unit}</td>
                <td>${fmt(getItemStock(i.id))}</td>
                <td>
                  <button class="btn secondary" style="padding:3px 8px;" onclick="openItemCard(${i.id})">كارت الصنف</button>
                  <button class="btn" style="padding:3px 8px;" onclick="openItemModal(${i.id})">تعديل</button>
                  <button class="btn danger" style="padding:3px 8px;" onclick="deleteItem(${i.id})">حذف</button>
                </td>
              </tr>
            `).join('') || '<tr><td colspan=5 class="empty">لا توجد أصناف معرفة</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openItemModal(id = null) {
  const item = id ? DB.items.find(x => x.id === id) : { code: 'IT' + uid(), name: '', unit: 'قطعة' };
  openModal(id ? 'تعديل صنف' : 'إضافة صنف جديد', `
    <div class="field" style="margin-bottom:10px;"><label>كود الصنف</label><input id="mCode" value="${item.code}"></div>
    <div class="field" style="margin-bottom:10px;"><label>اسم الصنف</label><input id="mName" value="${item.name}"></div>
    <div class="field"><label>الوحدة</label><input id="mUnit" value="${item.unit}"></div>
  `, () => saveItem(id));
}

function saveItem(id) {
  const code = document.getElementById('mCode').value.trim();
  const name = document.getElementById('mName').value.trim();
  const unit = document.getElementById('mUnit').value.trim();
  if(!name) { toast('يرجى إدخال اسم الصنف'); return; }

  if(id) {
    const it = DB.items.find(x => x.id === id);
    if(it) { it.code = code; it.name = name; it.unit = unit; }
  } else {
    DB.items.push({ id: uid(), code, name, unit });
  }

  saveDB();
  logAudit(id ? 'تعديل' : 'إضافة', 'inventory', 'صنف: ' + name);
  closeModal();
  renderAll();
  toast('تم الحفظ بنجاح');
}

function deleteItem(id) {
  if (!requirePerm('inventory', 'delete')) return;
  if (!confirm('تأكيد حذف الصنف؟')) return;
  DB.items = DB.items.filter(x => x.id !== id);
  saveDB();
  renderAll();
  toast('تم الحذف');
}

function openItemCard(id) {
  const it = DB.items.find(x => x.id === id); 
  if(!it) return;
  const ops = DB.stockOps.filter(o => o.itemId === id);
  const batches = DB.stockBatches.filter(b => b.itemId === id && b.remaining > 0.0001);
  
  openModal('كارت الصنف: ' + it.name + ' (' + it.code + ')', `
    <h3>الدفعة الحالية المتوفرة (FIFO)</h3>
    <div class="tableWrap">
      <table>
        <thead><tr><th>المخزن</th><th>الكمية المتبقية</th><th>تكلفة الوحدة</th><th>التاريخ</th></tr></thead>
        <tbody>
          ${batches.map(b => {
            const wh = DB.warehouses.find(w => w.id == b.warehouseId);
            return `<tr><td>${wh ? wh.name : '-'}</td><td>${fmt(b.remaining)}</td><td>${fmt(b.unitCost)}</td><td>${b.date}</td></tr>`;
          }).join('') || '<tr><td colspan=4 class="empty">لا يوجد رصيد متبقٍ</td></tr>'}
        </tbody>
      </table>
    </div>
    <h3 style="margin-top:16px;">سجل الحركات</h3>
    <div class="tableWrap">
      <table>
        <thead><tr><th>التاريخ</th><th>المخزن</th><th>نوع الحركة</th><th>وارد</th><th>منصرف</th><th>المرجع</th></tr></thead>
        <tbody>
          ${ops.map(o => {
            const wh = DB.warehouses.find(w => w.id == o.warehouseId);
            return `<tr><td>${o.date}</td><td>${wh ? wh.name : '-'}</td><td>${o.type}</td><td>${o.inQty ? fmt(o.inQty) : ''}</td><td>${o.outQty ? fmt(o.outQty) : ''}</td><td>${o.ref || '-'}</td></tr>`;
          }).join('') || '<tr><td colspan=6 class="empty">لا توجد حركات سابقة</td></tr>'}
        </tbody>
      </table>
    </div>
  `, null, true);
}

/* ---------- 7. حركة المخزون (استلام / صرف / تحويل) ---------- */
function logStockOp(itemId, warehouseId, type, inQty, outQty, date, ref) {
  DB.stockOps.push({ 
    id: uid(), 
    itemId, 
    warehouseId, 
    type, 
    inQty: Number(inQty || 0), 
    outQty: Number(outQty || 0), 
    date: date || todayStr(), 
    ref 
  });
  saveDB();
}

function renderStockReceive(root) {
  root.innerHTML = `
    <div class="card">
      <div class="cardHead"><h2>إذن استلام مخزني (وارد)</h2></div>
      <div class="grid3">
        <div class="field"><label>الصنف</label><select id="srItem">${DB.items.map(i => `<option value="${i.id}">${i.name} (${i.code})</option>`).join('')}</select></div>
        <div class="field"><label>المخزن</label><select id="srWh">${DB.warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}</select></div>
        <div class="field"><label>الكمية</label><input type="number" id="srQty" value="1"></div>
        <div class="field"><label>تكلفة الوحدة</label><input type="number" id="srCost" value="0"></div>
        <div class="field"><label>التاريخ</label><input type="date" id="srDate" value="${todayStr()}"></div>
        <div class="field"><label>ملاحظات / مرجع</label><input id="srRef"></div>
      </div>
      <button class="btn" style="margin-top:12px;" onclick="saveStockReceive()">حفظ إذن الاستلام</button>
    </div>
  `;
}

function saveStockReceive() {
  const itemId = Number(document.getElementById('srItem').value);
  const whId = Number(document.getElementById('srWh').value);
  const qty = Number(document.getElementById('srQty').value || 0);
  const cost = Number(document.getElementById('srCost').value || 0);
  const date = document.getElementById('srDate').value;
  const ref = document.getElementById('srRef').value;

  if(!itemId || qty <= 0) { toast('يرجى ملء البيانات بالشكل الصحيح'); return; }

  addStockBatch(itemId, whId, qty, cost, date, 'manual_in', null);
  logStockOp(itemId, whId, 'إذن استلام', qty, 0, date, ref || 'إذن استلام يدوي');
  toast('تم إضافة الشحنة بنجاح');
  renderAll();
}

function renderStockIssue(root) {
  root.innerHTML = `
    <div class="card">
      <div class="cardHead"><h2>إذن صرف مخزني (منصرف)</h2></div>
      <div class="grid3">
        <div class="field"><label>الصنف</label><select id="siItem">${DB.items.map(i => `<option value="${i.id}">${i.name} (${i.code})</option>`).join('')}</select></div>
        <div class="field"><label>المخزن</label><select id="siWh">${DB.warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}</select></div>
        <div class="field"><label>الكمية</label><input type="number" id="siQty" value="1"></div>
        <div class="field"><label>التاريخ</label><input type="date" id="siDate" value="${todayStr()}"></div>
        <div class="field"><label>ملاحظات / مرجع</label><input id="siRef"></div>
      </div>
      <button class="btn" style="margin-top:12px;" onclick="saveStockIssue()">حفظ إذن الصرف</button>
    </div>
  `;
}

function saveStockIssue() {
  const itemId = Number(document.getElementById('siItem').value);
  const whId = Number(document.getElementById('siWh').value);
  const qty = Number(document.getElementById('siQty').value || 0);
  const date = document.getElementById('siDate').value;
  const ref = document.getElementById('siRef').value;

  const avail = getItemStock(itemId, whId);
  if (qty > avail) { alert('الكمية المتاحة لا تكفي! الرصيد المتاح: ' + avail); return; }

  consumeStockFIFO(itemId, whId, qty, true);
  logStockOp(itemId, whId, 'إذن صرف', 0, qty, date, ref || 'إذن صرف يدوي');
  toast('تم صرف الكمية بنجاح');
  renderAll();
}

function renderStockTransfer(root) {
  root.innerHTML = `
    <div class="card">
      <div class="cardHead"><h2>تحويل بين المخازن</h2></div>
      <div class="grid3">
        <div class="field"><label>الصنف</label><select id="stItem">${DB.items.map(i => `<option value="${i.id}">${i.name} (${i.code})</option>`).join('')}</select></div>
        <div class="field"><label>من مخزن</label><select id="stFrom">${DB.warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}</select></div>
        <div class="field"><label>إلى مخزن</label><select id="stTo">${DB.warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}</select></div>
        <div class="field"><label>الكمية</label><input type="number" id="stQty" value="1"></div>
        <div class="field"><label>التاريخ</label><input type="date" id="stDate" value="${todayStr()}"></div>
      </div>
      <button class="btn" style="margin-top:12px;" onclick="saveStockTransfer()">تأكيد التحويل</button>
    </div>
  `;
}

function saveStockTransfer() {
  const itemId = Number(document.getElementById('stItem').value);
  const fromWh = Number(document.getElementById('stFrom').value);
  const toWh = Number(document.getElementById('stTo').value);
  const qty = Number(document.getElementById('stQty').value || 0);
  const date = document.getElementById('stDate').value;

  if (fromWh === toWh) { toast('الرجاء اختيار مخزنين مختلفين'); return; }

  const res = consumeStockFIFO(itemId, fromWh, qty, false);
  if (!res) { alert('الرصيد في المخزن المصدر لا يكفي!'); return; }

  consumeStockFIFO(itemId, fromWh, qty, true);
  const avgCost = res.cost / qty;
  addStockBatch(itemId, toWh, qty, avgCost, date, 'transfer', null);

  logStockOp(itemId, fromWh, 'تحويل (منصرف)', 0, qty, date, 'تحويل لمخزن آخر');
  logStockOp(itemId, toWh, 'تحويل (وارد)', qty, 0, date, 'تحويل من مخزن آخر');

  toast('تم التحويل بين المخزنين بنجاح');
  renderAll();
}

function renderStockOps(root) {
  root.innerHTML = `
    <div class="card">
      <div class="cardHead"><h2>سجل عمليات وحركات المخزون</h2></div>
      <div class="tableWrap">
        <table>
          <thead>
            <tr><th>التاريخ</th><th>الصنف</th><th>المخزن</th><th>نوع الحركة</th><th>وارد</th><th>منصرف</th><th>المرجع</th></tr>
          </thead>
          <tbody>
            ${DB.stockOps.slice().reverse().map(o => {
              const it = DB.items.find(i => i.id === o.itemId);
              const wh = DB.warehouses.find(w => w.id === o.warehouseId);
              return `<tr><td>${o.date}</td><td>${it ? it.name : '-'}</td><td>${wh ? wh.name : '-'}</td><td>${o.type}</td><td>${o.inQty ? fmt(o.inQty) : ''}</td><td>${o.outQty ? fmt(o.outQty) : ''}</td><td>${o.ref || '-'}</td></tr>`;
            }).join('') || '<tr><td colspan=7 class="empty">لا توجد حركات مسجلة</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ---------- 8. استيراد وتصدير Excel ---------- */
function renderInvImportExport(root) {
  root.innerHTML = `
    <div class="card">
      <div class="cardHead"><h2>استيراد / تصدير الأصناف عبر ملفات Excel</h2></div>
      <p style="margin-bottom:12px; font-size:14px; color:#64748b;">يمكنك تصدير قاعدة الأصناف الحالية كملف Excel أو رفع ملف للتحميل تلقائياً.</p>
      <button class="btn" onclick="exportItemsToExcel()">تصدير الأصناف إلى Excel</button>
    </div>
  `;
}

function exportItemsToExcel() {
  if (typeof XLSX === 'undefined') { toast('مكتبة Excel غير مثبتة أو غير محملة'); return; }
  const rows = DB.items.map(i => ({ 
    'كود الصنف': i.code, 
    'اسم الصنف': i.name, 
    'الوحدة': i.unit, 
    'إجمالي المخزون المتاح': getItemStock(i.id) 
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الأصناف');
  XLSX.writeFile(wb, 'Items_List.xlsx');
}

/* =========================================================
   الجزء الثالث: الفواتير والمبيعات (Sales Invoices)
   يستخدم نفس نمط addStockBatch/consumeStockFIFO الموجود بالأعلى،
   ويربط كل فاتورة بقيد يومية مزدوج على شجرة الحسابات.
   ========================================================= */

/* ---------- 9. الفواتير - المبيعات ---------- */
function findAccountByCode(code) { return DB.accounts.find(a => a.code === code); }

let _invDraftLines = [];

function renderInvoices(root) {
  root.innerHTML = `
    <div class="card">
      <div class="cardHead" style="display:flex; justify-content:space-between; align-items:center;">
        <h2>فواتير المبيعات</h2>
        <button class="btn" onclick="openSalesInvoiceModal()">+ فاتورة بيع جديدة</button>
      </div>
      <div class="tableWrap">
        <table>
          <thead>
            <tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>نوع الدفع</th><th>الإجمالي</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            ${DB.invoices.slice().reverse().map(inv => {
              const cust = DB.customers.find(c => c.id === inv.customerId);
              return `<tr>
                <td>${inv.number}</td>
                <td>${inv.date}</td>
                <td>${cust ? cust.name : '-'}</td>
                <td>${inv.paymentType === 'cash' ? 'نقدي' : 'آجل'}</td>
                <td>${fmt(inv.total)}</td>
                <td><button class="btn secondary" style="padding:3px 8px;" onclick="viewInvoice('${inv.id}')">عرض</button></td>
              </tr>`;
            }).join('') || '<tr><td colspan=6 class="empty">لا توجد فواتير مسجلة</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openSalesInvoiceModal() {
  _invDraftLines = [{
    itemId: DB.items[0] ? DB.items[0].id : '',
    warehouseId: DB.warehouses[0] ? DB.warehouses[0].id : '',
    qty: 1, price: 0
  }];

  const customerOptions = DB.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
    || '<option value="">لا يوجد عملاء بعد</option>';

  openModal('فاتورة بيع جديدة', `
    <div class="grid3" style="margin-bottom:12px;">
      <div class="field">
        <label>العميل</label>
        <div style="display:flex; gap:6px;">
          <select id="invCustomer" style="flex:1;">${customerOptions}</select>
          <button class="btn secondary" type="button" style="padding:6px 10px;" onclick="quickAddCustomer()">+ جديد</button>
        </div>
      </div>
      <div class="field"><label>التاريخ</label><input type="date" id="invDate" value="${todayStr()}"></div>
      <div class="field"><label>نوع الدفع</label>
        <select id="invPayType">
          <option value="cash">نقدي</option>
          <option value="credit">آجل (على الحساب)</option>
        </select>
      </div>
    </div>
    <div id="invLinesWrap"></div>
    <button class="btn secondary" type="button" style="margin-top:8px;" onclick="addInvoiceLineRow()">+ إضافة صنف</button>
    <div style="margin-top:14px; text-align:left; font-size:16px;"><b>الإجمالي: <span id="invTotalLabel">0.00</span></b></div>
  `, () => saveSalesInvoice());

  renderInvoiceLinesTable();
}

function renderInvoiceLinesTable() {
  const wrap = document.getElementById('invLinesWrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="tableWrap">
      <table>
        <thead><tr><th>الصنف</th><th>المخزن</th><th>الكمية</th><th>السعر</th><th>الرصيد المتاح</th><th>الإجمالي</th><th></th></tr></thead>
        <tbody>
          ${_invDraftLines.map((ln, idx) => {
            const avail = ln.itemId && ln.warehouseId ? getItemStock(Number(ln.itemId), Number(ln.warehouseId)) : 0;
            const lineTotal = Number(ln.qty || 0) * Number(ln.price || 0);
            return `<tr>
              <td><select onchange="updateInvoiceLine(${idx},'itemId',this.value)">
                ${DB.items.map(i => `<option value="${i.id}" ${ln.itemId == i.id ? 'selected' : ''}>${i.name}</option>`).join('')}
              </select></td>
              <td><select onchange="updateInvoiceLine(${idx},'warehouseId',this.value)">
                ${DB.warehouses.map(w => `<option value="${w.id}" ${ln.warehouseId == w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
              </select></td>
              <td><input type="number" min="0" value="${ln.qty}" style="width:70px;" onchange="updateInvoiceLine(${idx},'qty',this.value)"></td>
              <td><input type="number" min="0" value="${ln.price}" style="width:80px;" onchange="updateInvoiceLine(${idx},'price',this.value)"></td>
              <td>${fmt(avail)}</td>
              <td>${fmt(lineTotal)}</td>
              <td>${_invDraftLines.length > 1 ? `<button class="btn danger" style="padding:2px 8px;" onclick="removeInvoiceLineRow(${idx})">حذف</button>` : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  const totalLabel = document.getElementById('invTotalLabel');
  if (totalLabel) totalLabel.innerText = fmt(calcInvoiceDraftTotal());
}

function calcInvoiceDraftTotal() {
  return _invDraftLines.reduce((s, ln) => s + Number(ln.qty || 0) * Number(ln.price || 0), 0);
}

function updateInvoiceLine(idx, field, value) {
  if (!_invDraftLines[idx]) return;
  _invDraftLines[idx][field] = (field === 'qty' || field === 'price') ? Number(value) : value;
  renderInvoiceLinesTable();
}

function addInvoiceLineRow() {
  _invDraftLines.push({
    itemId: DB.items[0] ? DB.items[0].id : '',
    warehouseId: DB.warehouses[0] ? DB.warehouses[0].id : '',
    qty: 1, price: 0
  });
  renderInvoiceLinesTable();
}

function removeInvoiceLineRow(idx) {
  _invDraftLines.splice(idx, 1);
  renderInvoiceLinesTable();
}

function quickAddCustomer() {
  const name = prompt('اسم العميل الجديد:');
  if (!name) return;
  DB.customers.push({ id: uid(), name, balance: 0 });
  saveDB();
  openSalesInvoiceModal(); // إعادة فتح النموذج مع تحديث قائمة العملاء
}

function saveSalesInvoice() {
  const customerId = Number(document.getElementById('invCustomer').value) || null;
  const date = document.getElementById('invDate').value || todayStr();
  const paymentType = document.getElementById('invPayType').value;

  if (!customerId) { toast('يرجى اختيار العميل (أو إضافة عميل جديد أولاً)'); return; }
  if (!_invDraftLines.length) { toast('أضف صنفًا واحدًا على الأقل'); return; }

  // تحقق من توفر الرصيد لكل الأصناف قبل تنفيذ أي عملية صرف فعلية
  for (const ln of _invDraftLines) {
    const itemId = Number(ln.itemId), whId = Number(ln.warehouseId), qty = Number(ln.qty);
    if (!itemId || !whId || qty <= 0) { toast('يرجى استكمال بيانات كل الأصناف بشكل صحيح'); return; }
    const avail = getItemStock(itemId, whId);
    if (qty > avail) {
      const item = DB.items.find(i => i.id === itemId);
      toast(`الرصيد غير كافٍ للصنف "${item ? item.name : itemId}" — المتاح: ${fmt(avail)}`);
      return;
    }
  }

  let total = 0, totalCost = 0;
  const savedLines = [];
  for (const ln of _invDraftLines) {
    const itemId = Number(ln.itemId), whId = Number(ln.warehouseId), qty = Number(ln.qty), price = Number(ln.price);
    const res = consumeStockFIFO(itemId, whId, qty, true);
    const lineCost = res ? res.cost : 0;
    total += qty * price;
    totalCost += lineCost;
    savedLines.push({ itemId, warehouseId: whId, qty, price, cost: lineCost });
    logStockOp(itemId, whId, 'فاتورة بيع', 0, qty, date, 'فاتورة بيع');
  }

  const invoice = {
    id: uid(),
    number: 'S-' + (DB.invoices.filter(i => i.type === 'sale').length + 1).toString().padStart(4, '0'),
    type: 'sale',
    date, customerId, paymentType,
    lines: savedLines,
    total, totalCost
  };
  DB.invoices.push(invoice);

  // تحديث رصيد العميل في حالة البيع الآجل (على الحساب)
  if (paymentType === 'credit') {
    const cust = DB.customers.find(c => c.id === customerId);
    if (cust) cust.balance = Number(cust.balance || 0) + total;
  }

  postInvoiceJournal(invoice);

  saveDB();
  logAudit('إضافة', 'invoices', 'فاتورة بيع رقم: ' + invoice.number);
  closeModal();
  renderInvoices(document.getElementById('content'));
  toast('تم حفظ الفاتورة رقم ' + invoice.number);
}

function postInvoiceJournal(invoice) {
  const cashAcc = findAccountByCode('111');
  const custAcc = findAccountByCode('113');
  const salesAcc = findAccountByCode('31');
  const cogsAcc = findAccountByCode('41');
  const invAcc = findAccountByCode('114');
  const debitAcc = invoice.paymentType === 'cash' ? cashAcc : custAcc;

  // قيد الإيراد: من ح/ الخزينة (نقدي) أو العملاء (آجل) - إلى ح/ مبيعات البضائع
  DB.journalEntries.push({
    id: uid(), date: invoice.date,
    memo: 'فاتورة بيع رقم ' + invoice.number,
    debitAccountId: debitAcc ? debitAcc.id : null,
    creditAccountId: salesAcc ? salesAcc.id : null,
    amount: invoice.total
  });

  // قيد تكلفة البضاعة المباعة: من ح/ تكلفة البضاعة المباعة - إلى ح/ المخزون
  if (invoice.totalCost > 0) {
    DB.journalEntries.push({
      id: uid(), date: invoice.date,
      memo: 'تكلفة بضاعة فاتورة بيع رقم ' + invoice.number,
      debitAccountId: cogsAcc ? cogsAcc.id : null,
      creditAccountId: invAcc ? invAcc.id : null,
      amount: invoice.totalCost
    });
  }
}

function viewInvoice(id) {
  const inv = DB.invoices.find(i => i.id === id);
  if (!inv) return;
  const cust = DB.customers.find(c => c.id === inv.customerId);
  openModal('فاتورة بيع رقم ' + inv.number, `
    <p><b>التاريخ:</b> ${inv.date} &nbsp;|&nbsp; <b>العميل:</b> ${cust ? cust.name : '-'} &nbsp;|&nbsp; <b>نوع الدفع:</b> ${inv.paymentType === 'cash' ? 'نقدي' : 'آجل'}</p>
    <div class="tableWrap" style="margin-top:12px;">
      <table>
        <thead><tr><th>الصنف</th><th>المخزن</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${inv.lines.map(ln => {
            const item = DB.items.find(i => i.id === ln.itemId);
            const wh = DB.warehouses.find(w => w.id === ln.warehouseId);
            return `<tr><td>${item ? item.name : '-'}</td><td>${wh ? wh.name : '-'}</td><td>${fmt(ln.qty)}</td><td>${fmt(ln.price)}</td><td>${fmt(ln.qty * ln.price)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:14px; text-align:left; font-size:16px;"><b>الإجمالي: ${fmt(inv.total)}</b></div>
  `, null, true);
}

// التشغيل والتهيئة المباشرة بعد فتح النظام
// loadDB أصبحت غير متزامنة (بتتصل بـ Firebase الأول) فمحتاجين ننتظرها
// قبل ما نظهر شاشة الدخول، عشان ميحصلش دخول ببيانات فاضية قبل ما توصل من السحابة.
window.onload = function() {
  const loadingEl = document.getElementById('loadingScreen');
  const loginEl = document.getElementById('loginScreen');
  loadDB(function() {
    if (loadingEl) loadingEl.style.display = 'none';
    if (loginEl) loginEl.style.display = 'flex';
  });
};
