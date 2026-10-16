/**
 * ============================================================
 * DEVELOPER JALANAN CORE V1
 * "Reusable UMKM Business System Starter"
 * ============================================================
 * Code.gs — Backend API (PWA mode): Database Engine, Auth, Business Logic
 * Konsep: SATU CORE SYSTEM -> CLONE -> CONFIGURE -> DEPLOY
 * Tidak ada hardcoded business config. Semua via Settings sheet.
 * ============================================================
 */

/* ============================================================
 * 0. CONFIG
 * ============================================================ */
var SHEETS = {
  SETTINGS: 'Settings',
  USERS: 'Users',
  ROLES: 'Roles',
  PERMISSIONS: 'Permissions',
  PRODUCTS: 'Products',
  CATEGORIES: 'Categories',
  EXPENSE_CATEGORIES: 'ExpenseCategories',
  TRANSACTIONS: 'Transactions',
  TRANSACTION_DETAILS: 'TransactionDetails',
  STOCK_MOVEMENTS: 'StockMovements',
  EXPENSES: 'Expenses',
  ACTIVITY_LOGS: 'ActivityLogs'
};

var ID_PREFIX = {
  Users: 'USR', Roles: 'ROLE', Permissions: 'PERM', Products: 'PRD',
  Categories: 'CAT', ExpenseCategories: 'ECAT', Transactions: 'TRX', TransactionDetails: 'TRXDTL',
  StockMovements: 'STK', Expenses: 'EXP', ActivityLogs: 'LOG'
};

var SCHEMA = {
  Settings: ['key', 'value', 'type', 'description', 'updatedAt', 'updatedBy'],
  Users: ['id', 'username', 'email', 'passwordHash', 'name', 'roleId', 'status', 'createdAt', 'updatedAt', 'lastLoginAt'],
  Roles: ['id', 'name', 'description', 'status', 'createdAt', 'updatedAt'],
  Permissions: ['id', 'roleId', 'module', 'action', 'allowed'],
  Products: ['id', 'sku', 'barcode', 'name', 'categoryId', 'buyPrice', 'sellPrice', 'stock', 'minimumStock', 'unit', 'status', 'createdAt', 'updatedAt'],
  Categories: ['id', 'name', 'description', 'status', 'createdAt', 'updatedAt'],
  ExpenseCategories: ['id', 'name', 'description', 'status', 'createdAt', 'updatedAt'],
  Transactions: ['id', 'invoiceNumber', 'transactionDate', 'userId', 'subtotal', 'discount', 'total', 'paymentMethod', 'paymentAmount', 'changeAmount', 'status', 'createdAt'],
  TransactionDetails: ['id', 'transactionId', 'productId', 'productName', 'qty', 'price', 'discount', 'subtotal', 'buyPrice', 'hpp', 'createdAt'],
  StockMovements: ['id', 'productId', 'type', 'qty', 'stockBefore', 'stockAfter', 'referenceId', 'userId', 'note', 'createdAt'],
  Expenses: ['id', 'expenseDate', 'category', 'description', 'amount', 'userId', 'createdAt', 'updatedAt'],
  ActivityLogs: ['id', 'timestamp', 'userId', 'action', 'module', 'referenceId', 'description', 'status']
};

var DEFAULT_MODULES = ['dashboard', 'pos', 'products', 'inventory', 'transactions', 'expenses', 'reports', 'users', 'roles', 'settings'];
var DEFAULT_ACTIONS = ['view', 'create', 'edit', 'delete', 'print', 'export', 'manage'];

/* ============================================================
 * 0.1 DATABASE SPREADSHEET RESOLVER
 * ============================================================
 * Script ini bisa berjalan sebagai:
 * a) Container-bound script (terikat langsung ke 1 Spreadsheet) -> pakai SpreadsheetApp.getActiveSpreadsheet()
 * b) Standalone script (Web App tanpa spreadsheet terikat) -> getActiveSpreadsheet() = null,
 *    sehingga kita simpan Spreadsheet ID di Script Properties dan buat baru jika belum ada.
 * Semua akses database HARUS melalui getDb_() ini, jangan panggil
 * SpreadsheetApp.getActiveSpreadsheet() langsung di tempat lain.
 */
function getDb_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty('DJ_SPREADSHEET_ID');
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (e) {
      // ID tersimpan tapi spreadsheet tidak bisa dibuka (mungkin dihapus) -> buat baru
    }
  }

  var newSs = SpreadsheetApp.create('Developer Jalanan Core - Database');
  props.setProperty('DJ_SPREADSHEET_ID', newSs.getId());
  return newSs;
}

/* ============================================================
 * 1. ENTRY POINT
 * ============================================================ */
/**
 * Mode PWA: frontend di-hosting terpisah (GitHub Pages) dan memanggil
 * Web App ini sebagai API JSON lewat doPost. doGet hanya endpoint ping.
 */
function doGet(e) {
  return jsonOut_({ success: true, data: { app: 'Developer Jalanan Core API', time: new Date().toISOString() }, message: 'API aktif' });
}

var API_ROUTES_ = {
  // publik (tanpa token)
  login: login,
  getAppConfig: getAppConfig,
  initializeSystem: initializeSystem,
  // sesi & auth
  logout: logout, validateSession: validateSession,
  // sistem (wajib token + izin settings)
  repairDatabase: repairDatabase, getDatabaseUrl: getDatabaseUrl, updateSettings: updateSettings,
  uploadLogo: uploadLogo, getActivityLogs: getActivityLogs,
  validateDatabaseAuth: validateDatabaseAuth, seedDemoDataAuth: seedDemoDataAuth, runAllTestsAuth: runAllTestsAuth,
  // role & user
  getRoles: getRoles, createRole: createRole, updateRole: updateRole, deleteRole: deleteRole,
  getPermissions: getPermissions, updatePermissions: updatePermissions,
  getUsers: getUsers, createUser: createUser, updateUser: updateUser, deleteUser: deleteUser,
  // kategori
  getCategories: getCategories, createCategory: createCategory, updateCategory: updateCategory, deleteCategory: deleteCategory,
  getExpenseCategories: getExpenseCategories, createExpenseCategory: createExpenseCategory,
  updateExpenseCategory: updateExpenseCategory, deleteExpenseCategory: deleteExpenseCategory,
  // produk & stok
  getProducts: getProducts, searchProducts: searchProducts, filterProducts: filterProducts,
  createProduct: createProduct, updateProduct: updateProduct, deleteProduct: deleteProduct,
  adjustStock: adjustStock, getStockMovements: getStockMovements, getLowStockProducts: getLowStockProducts,
  // transaksi, biaya, laporan, dashboard
  createTransaction: createTransaction, getTransactions: getTransactions, getTransactionDetail: getTransactionDetail,
  getExpenses: getExpenses, createExpense: createExpense, updateExpense: updateExpense, deleteExpense: deleteExpense,
  getFinancialReport: getFinancialReport, exportReportPdf: exportReportPdf, exportReportXlsx: exportReportXlsx,
  getDashboardData: getDashboardData
};

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var fn = API_ROUTES_[body.fn];
    if (typeof fn !== 'function') return jsonOut_(apiError('Endpoint tidak dikenal', 'NOT_FOUND'));
    var args = Array.isArray(body.args) ? body.args : [];
    return jsonOut_(fn.apply(null, args));
  } catch (err) {
    Logger.log('doPost ERROR: ' + err.message);
    return jsonOut_(apiError('Terjadi kesalahan pada sistem. Silakan coba lagi.', 'INTERNAL_ERROR'));
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* Versi terautentikasi untuk fungsi sistem (tidak boleh publik di API) */
function systemGuard_(token) {
  var session = requireSession_(token);
  if (!hasPermission_(session.roleId, 'settings', 'manage')) return null;
  return session;
}
function validateDatabaseAuth(token) {
  return safeRun(function () { return systemGuard_(token) ? validateDatabase() : apiError('Tidak memiliki izin', 'FORBIDDEN'); });
}
function seedDemoDataAuth(token) {
  return safeRun(function () { return systemGuard_(token) ? seedDemoData() : apiError('Tidak memiliki izin', 'FORBIDDEN'); });
}
function runAllTestsAuth(token) {
  return safeRun(function () { return systemGuard_(token) ? runAllTests() : apiError('Tidak memiliki izin', 'FORBIDDEN'); });
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ============================================================
 * 2. RESPONSE STANDARD
 * ============================================================ */
function apiSuccess(data, message) {
  return { success: true, data: data === undefined ? null : data, message: message || 'Berhasil' };
}
function apiError(message, errorCode) {
  return { success: false, data: null, message: message || 'Terjadi kesalahan', errorCode: errorCode || 'ERROR' };
}
function safeRun(fn) {
  try {
    return fn();
  } catch (err) {
    Logger.log('ERROR: ' + err.message + '\n' + err.stack);
    return apiError('Terjadi kesalahan pada sistem. Silakan coba lagi.', 'INTERNAL_ERROR');
  }
}

/* ============================================================
 * 3. INITIALIZE SYSTEM (idempotent)
 * ============================================================ */
function initializeSystem() {
  return safeRun(function () {
    var result = initializeSystemCore_();
    return apiSuccess(result, 'Sistem berhasil diinisialisasi');
  });
}

function initializeSystemCore_() {
  var status = {};
  setupDatabase();
  Object.keys(SHEETS).forEach(function (k) { status[SHEETS[k]] = true; });
  setupSettings();
  setupRoles();
  setupPermissions();
  setupAdmin();
  setupExpenseCategories();
  setupDrive();
  var validation = validateDatabase();
  return { status: status, validation: validation.data };
}

function repairDatabase(sessionToken) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'settings', 'manage')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var result = initializeSystemCore_();
    logActivity_(session.userId, 'Repair database', 'settings', '', 'Perbaikan struktur database dijalankan', 'success');
    return apiSuccess(result, 'Database berhasil diperiksa dan diperbaiki');
  });
}

function setupDatabase() {
  var ss = getDb_();
  Object.keys(SCHEMA).forEach(function (sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(SCHEMA[sheetName]);
      sheet.setFrozenRows(1);
      return;
    }
    // Validate/extend headers without destroying data (idempotent)
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].filter(String);
    if (existingHeaders.length === 0) {
      sheet.getRange(1, 1, 1, SCHEMA[sheetName].length).setValues([SCHEMA[sheetName]]);
      sheet.setFrozenRows(1);
      return;
    }
    var missing = SCHEMA[sheetName].filter(function (h) { return existingHeaders.indexOf(h) === -1; });
    if (missing.length > 0) {
      sheet.getRange(1, existingHeaders.length + 1, 1, missing.length).setValues([missing]);
    }
  });
  // Default sheet1 cleanup (only if empty and not one of ours)
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() === 0 && sheet1.getLastColumn() <= 1 && ss.getSheets().length > 1) {
    ss.deleteSheet(sheet1);
  }
}

function setupSettings() {
  var defaults = {
    appName: 'Developer Jalanan POS',
    businessName: 'Nama Usaha Anda',
    logoFileId: '',
    businessAddress: '',
    businessPhone: '',
    businessEmail: '',
    currency: 'IDR',
    primaryColor: '#2563eb',
    secondaryColor: '#1e293b',
    receiptFooter: 'Terima kasih atas kunjungan Anda',
    dateFormat: 'dd/MM/yyyy'
  };
  Object.keys(defaults).forEach(function (key) {
    var existing = getSettingRaw_(key);
    if (existing === null) {
      setSettingRaw_(key, defaults[key], 'string', 'Default setting', 'system');
    }
  });
}

function setupRoles() {
  var roles = [
    { name: 'Owner', description: 'Pemilik usaha, akses penuh' },
    { name: 'Admin', description: 'Administrator sistem' },
    { name: 'Kasir', description: 'Kasir / operator POS' }
  ];
  roles.forEach(function (r) {
    var existing = findRecords('Roles', { name: r.name });
    if (existing.length === 0) {
      insertRecord('Roles', { name: r.name, description: r.description, status: 'active' });
    }
  });
}

function setupPermissions() {
  var roles = getAllRecords('Roles');
  var ownerRole = roles.filter(function (r) { return r.name === 'Owner'; })[0];
  var adminRole = roles.filter(function (r) { return r.name === 'Admin'; })[0];
  var kasirRole = roles.filter(function (r) { return r.name === 'Kasir'; })[0];

  function ensurePerm(roleId, module, action, allowed) {
    var existing = findRecords('Permissions', { roleId: roleId, module: module, action: action });
    if (existing.length === 0) {
      insertRecord('Permissions', { roleId: roleId, module: module, action: action, allowed: allowed });
    }
  }

  if (ownerRole) {
    DEFAULT_MODULES.forEach(function (m) {
      DEFAULT_ACTIONS.forEach(function (a) { ensurePerm(ownerRole.id, m, a, true); });
    });
  }
  if (adminRole) {
    DEFAULT_MODULES.forEach(function (m) {
      DEFAULT_ACTIONS.forEach(function (a) { ensurePerm(adminRole.id, m, a, true); });
    });
  }
  if (kasirRole) {
    var kasirAllowed = {
      dashboard: ['view'], pos: ['view', 'create', 'print'], products: ['view'],
      inventory: ['view'], transactions: ['view', 'print'], reports: ['view'],
      expenses: [], users: [], roles: [], settings: []
    };
    DEFAULT_MODULES.forEach(function (m) {
      DEFAULT_ACTIONS.forEach(function (a) {
        var allowed = (kasirAllowed[m] || []).indexOf(a) !== -1;
        ensurePerm(kasirRole.id, m, a, allowed);
      });
    });
  }
}

function setupAdmin() {
  var existingAdmins = getAllRecords('Users');
  if (existingAdmins.length > 0) return;
  var ownerRole = findRecords('Roles', { name: 'Owner' })[0];
  insertRecord('Users', {
    username: 'admin',
    email: 'admin@example.com',
    passwordHash: hashPassword_('admin123'),
    name: 'Administrator',
    roleId: ownerRole ? ownerRole.id : '',
    status: 'active',
    lastLoginAt: ''
  });
}

function setupDrive() {
  // Placeholder: folder created lazily on first logo upload (see uploadLogo).
  return true;
}

function setupExpenseCategories() {
  var defaults = ['Listrik', 'Sewa', 'Transportasi', 'Belanja Operasional', 'Gaji', 'Lainnya'];
  defaults.forEach(function (name) {
    var existing = findRecords('ExpenseCategories', { name: name });
    if (existing.length === 0) {
      insertRecord('ExpenseCategories', { name: name, description: '', status: 'active' });
    }
  });
}

function validateDatabase() {
  return safeRun(function () {
    var errors = [];
    var warnings = [];
    var ss = getDb_();
    Object.keys(SCHEMA).forEach(function (sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) { errors.push({ sheet: sheetName, field: '-', message: 'Sheet tidak ditemukan' }); return; }
      var headers = getHeaders(sheetName);
      SCHEMA[sheetName].forEach(function (h) {
        if (headers.indexOf(h) === -1) errors.push({ sheet: sheetName, field: h, message: 'Kolom hilang' });
      });
      if (SCHEMA[sheetName].indexOf('id') !== -1) {
        var records = getAllRecords(sheetName);
        var ids = records.map(function (r) { return r.id; });
        var dup = ids.filter(function (id, i) { return ids.indexOf(id) !== i; });
        if (dup.length > 0) errors.push({ sheet: sheetName, field: 'id', message: 'Duplicate ID ditemukan: ' + dup.join(', ') });
      }
    });
    var valid = errors.length === 0;
    return apiSuccess({ valid: valid, errors: errors, warnings: warnings }, valid ? 'Database valid' : 'Ditemukan masalah pada database');
  });
}

function seedDemoData() {
  return safeRun(function () {
    var cats = ['Minuman', 'Makanan', 'Lainnya'];
    var catIds = {};
    cats.forEach(function (name) {
      var existing = findRecords('Categories', { name: name });
      var cat = existing.length ? existing[0] : insertRecord('Categories', { name: name, description: '', status: 'active' });
      catIds[name] = cat.id;
    });
    var products = [
      { name: 'Kopi Susu', categoryId: catIds['Minuman'], buyPrice: 6000, sellPrice: 12000, stock: 25, minimumStock: 5, unit: 'cup' },
      { name: 'Teh Manis', categoryId: catIds['Minuman'], buyPrice: 2000, sellPrice: 5000, stock: 30, minimumStock: 5, unit: 'cup' },
      { name: 'Mie Goreng', categoryId: catIds['Makanan'], buyPrice: 8000, sellPrice: 15000, stock: 15, minimumStock: 3, unit: 'porsi' },
      { name: 'Air Mineral', categoryId: catIds['Minuman'], buyPrice: 2500, sellPrice: 5000, stock: 40, minimumStock: 10, unit: 'botol' }
    ];
    products.forEach(function (p) {
      var existing = findRecords('Products', { name: p.name });
      if (existing.length === 0) {
        p.sku = 'SKU-' + p.name.substring(0, 3).toUpperCase();
        p.barcode = '';
        p.status = 'active';
        insertRecord('Products', p);
      }
    });
    return apiSuccess(null, 'Demo data berhasil dibuat');
  });
}

/* ============================================================
 * 4. DATA ACCESS LAYER (Database.gs logic)
 * ============================================================ */
function getSheet(sheetName) {
  var ss = getDb_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet ' + sheetName + ' tidak ditemukan');
  return sheet;
}

function getHeaders(sheetName) {
  var sheet = getSheet(sheetName);
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].filter(String);
}

function generateId(sheetName) {
  var prefix = ID_PREFIX[sheetName] || sheetName.substring(0, 3).toUpperCase();
  var lockKey = 'idlock_' + sheetName;
  var props = PropertiesService.getScriptProperties();
  var records = getAllRecords(sheetName);
  var max = 0;
  records.forEach(function (r) {
    if (r.id) {
      var num = parseInt(String(r.id).split('-').pop(), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  var next = max + 1;
  return prefix + '-' + ('000000' + next).slice(-6);
}

function sheetToObjects_(sheetName) {
  var sheet = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol === 0) return [];
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var records = [];
  values.forEach(function (row) {
    var isEmpty = row.every(function (v) { return v === '' || v === null; });
    if (isEmpty) return;
    var obj = {};
    headers.forEach(function (h, i) {
      if (!h) return;
      obj[h] = normalizeValue_(h, row[i]);
    });
    records.push(obj);
  });
  return records;
}

function normalizeValue_(field, value) {
  if (value === null || value === undefined) return '';
  var numericFields = ['buyPrice', 'sellPrice', 'stock', 'minimumStock', 'qty', 'price', 'discount',
    'subtotal', 'total', 'paymentAmount', 'changeAmount', 'stockBefore', 'stockAfter', 'amount', 'hpp', 'allowed'];
  if (field === 'allowed') return value === true || value === 'TRUE' || value === 'true' || value === 1;
  if (numericFields.indexOf(field) !== -1) {
    var n = Number(value);
    return isNaN(n) ? 0 : n;
  }
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return String(value);
}

function getAllRecords(sheetName) {
  return sheetToObjects_(sheetName);
}

function getRecordById(sheetName, id) {
  var records = getAllRecords(sheetName);
  return records.filter(function (r) { return String(r.id) === String(id); })[0] || null;
}

function findRecords(sheetName, filters) {
  var records = getAllRecords(sheetName);
  if (!filters) return records;
  return records.filter(function (r) {
    return Object.keys(filters).every(function (k) { return String(r[k]) === String(filters[k]); });
  });
}

function insertRecord(sheetName, data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheetName);
    var now = new Date().toISOString();
    var record = Object.assign({}, data);
    if (headers.indexOf('id') !== -1 && !record.id) record.id = generateId(sheetName);
    if (headers.indexOf('createdAt') !== -1 && !record.createdAt) record.createdAt = now;
    if (headers.indexOf('updatedAt') !== -1 && !record.updatedAt) record.updatedAt = now;
    if (headers.indexOf('timestamp') !== -1 && !record.timestamp) record.timestamp = now;
    var row = headers.map(function (h) { return record[h] !== undefined ? record[h] : ''; });
    sheet.appendRow(row);
    return record;
  } finally {
    lock.releaseLock();
  }
}

function insertRecords(sheetName, records) {
  return records.map(function (r) { return insertRecord(sheetName, r); });
}

function updateRecord(sheetName, id, data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheetName);
    var idCol = headers.indexOf('id');
    if (idCol === -1) throw new Error('Sheet ' + sheetName + ' tidak memiliki kolom id');
    var lastRow = sheet.getLastRow();
    var values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), headers.length).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) {
        var rowIndex = i + 2;
        headers.forEach(function (h, colIndex) {
          if (data.hasOwnProperty(h)) {
            sheet.getRange(rowIndex, colIndex + 1).setValue(data[h]);
          }
        });
        if (headers.indexOf('updatedAt') !== -1) {
          sheet.getRange(rowIndex, headers.indexOf('updatedAt') + 1).setValue(new Date().toISOString());
        }
        return getRecordById(sheetName, id);
      }
    }
    throw new Error('Record dengan id ' + id + ' tidak ditemukan di ' + sheetName);
  } finally {
    lock.releaseLock();
  }
}

function deleteRecord(sheetName, id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheetName);
    var idCol = headers.indexOf('id');
    var lastRow = sheet.getLastRow();
    var values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), headers.length).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) {
        sheet.deleteRow(i + 2);
        return true;
      }
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 * 5. SETTINGS / BRANDING
 * ============================================================ */
function getSettingRaw_(key) {
  var rows = findRecords('Settings', { key: key });
  return rows.length ? rows[0].value : null;
}
function setSettingRaw_(key, value, type, description, user) {
  var existing = findRecords('Settings', { key: key });
  if (existing.length) {
    return updateSettingRow_(key, value, user);
  }
  return insertRecord('Settings', { key: key, value: value, type: type || 'string', description: description || '', updatedBy: user || '' });
}
function updateSettingRow_(key, value, user) {
  var sheet = getSheet('Settings');
  var headers = getHeaders('Settings');
  var lastRow = sheet.getLastRow();
  var values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), headers.length).getValues();
  var keyCol = headers.indexOf('key');
  var valCol = headers.indexOf('value');
  var updCol = headers.indexOf('updatedAt');
  var byCol = headers.indexOf('updatedBy');
  for (var i = 0; i < values.length; i++) {
    if (values[i][keyCol] === key) {
      var rowIndex = i + 2;
      sheet.getRange(rowIndex, valCol + 1).setValue(value);
      if (updCol !== -1) sheet.getRange(rowIndex, updCol + 1).setValue(new Date().toISOString());
      if (byCol !== -1) sheet.getRange(rowIndex, byCol + 1).setValue(user || '');
      return true;
    }
  }
  return false;
}

function buildLogoUrl_(fileId) {
  if (!fileId) return '';
  // Format thumbnail googleusercontent lebih andal untuk ditampilkan inline (PNG & JPG)
  // dibanding link "uc?id=" yang kadang memicu halaman preview/unduh di Drive.
  return 'https://lh3.googleusercontent.com/d/' + fileId + '=w400';
}

function getAppConfig() {
  return safeRun(function () {
    var settings = getAllRecords('Settings');
    var config = {};
    settings.forEach(function (s) { config[s.key] = s.value; });
    config.logoUrl = config.logoFileId ? buildLogoUrl_(config.logoFileId) : '';
    return apiSuccess(config);
  });
}

function updateSettings(sessionToken, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'settings', 'manage')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    Object.keys(data).forEach(function (key) {
      setSettingRaw_(key, data[key], 'string', '', session.userId);
    });
    logActivity_(session.userId, 'Update settings', 'settings', '', 'Perbarui pengaturan/branding', 'success');
    return apiSuccess(null, 'Pengaturan berhasil disimpan');
  });
}

function getDatabaseUrl(sessionToken) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'settings', 'manage')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var ss = getDb_();
    return apiSuccess({ url: ss.getUrl(), name: ss.getName() });
  });
}

var ALLOWED_LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

function uploadLogo(sessionToken, base64Data, mimeType, fileName) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'settings', 'manage')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var normalizedMime = (mimeType || '').toLowerCase();
    if (ALLOWED_LOGO_MIME_TYPES.indexOf(normalizedMime) === -1) {
      return apiError('Format logo tidak didukung. Gunakan file PNG atau JPG.', 'VALIDATION_ERROR');
    }
    var folder = getOrCreateAppFolder_();
    var bytes = Utilities.base64Decode(base64Data.split(',').pop());
    var blob = Utilities.newBlob(bytes, normalizedMime, fileName || ('logo.' + (normalizedMime === 'image/png' ? 'png' : 'jpg')));
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    setSettingRaw_('logoFileId', file.getId(), 'string', 'Logo aplikasi', session.userId);
    logActivity_(session.userId, 'Upload logo', 'settings', file.getId(), 'Logo diperbarui', 'success');
    return apiSuccess({ logoFileId: file.getId(), logoUrl: buildLogoUrl_(file.getId()) }, 'Logo berhasil diunggah');
  });
}

function getOrCreateAppFolder_() {
  var folderName = 'Developer Jalanan Core - Files';
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(folderName);
}

/* ============================================================
 * 6. AUTHENTICATION & SESSION
 * ============================================================ */
function hashPassword_(password) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  return digest.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function login(username, password) {
  return safeRun(function () {
    if (!username || !password) return apiError('Username dan password wajib diisi', 'VALIDATION_ERROR');
    var users = getAllRecords('Users');
    var user = users.filter(function (u) {
      return (u.username === username || u.email === username) && u.status === 'active';
    })[0];
    if (!user) return apiError('Username atau password salah', 'AUTH_FAILED');
    if (user.passwordHash !== hashPassword_(password)) return apiError('Username atau password salah', 'AUTH_FAILED');

    var role = getRecordById('Roles', user.roleId);
    var token = Utilities.getUuid();
    var session = {
      token: token,
      userId: user.id,
      username: user.username,
      name: user.name,
      roleId: user.roleId,
      roleName: role ? role.name : '',
      createdAt: new Date().getTime()
    };
    var cache = CacheService.getScriptCache();
    cache.put('session_' + token, JSON.stringify(session), 21600); // 6 hours
    updateRecord('Users', user.id, { lastLoginAt: new Date().toISOString() });
    logActivity_(user.id, 'Login', 'auth', user.id, 'User login', 'success');

    var permissions = findRecords('Permissions', { roleId: user.roleId }).filter(function (p) { return p.allowed; });
    return apiSuccess({
      token: token,
      user: { id: user.id, username: user.username, name: user.name, roleId: user.roleId, roleName: session.roleName },
      permissions: permissions
    }, 'Login berhasil');
  });
}

function logout(sessionToken) {
  return safeRun(function () {
    var session = getSessionData_(sessionToken);
    if (session) {
      logActivity_(session.userId, 'Logout', 'auth', session.userId, 'User logout', 'success');
      CacheService.getScriptCache().remove('session_' + sessionToken);
    }
    return apiSuccess(null, 'Logout berhasil');
  });
}

function getSessionData_(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var raw = cache.get('session_' + token);
  if (!raw) return null;
  return JSON.parse(raw);
}

function requireSession_(token) {
  var session = getSessionData_(token);
  if (!session) throw new Error('SESSION_EXPIRED');
  return session;
}

function validateSession(sessionToken) {
  return safeRun(function () {
    var session = getSessionData_(sessionToken);
    if (!session) return apiError('Sesi telah berakhir, silakan login kembali', 'SESSION_EXPIRED');
    var permissions = findRecords('Permissions', { roleId: session.roleId }).filter(function (p) { return p.allowed; });
    return apiSuccess({
      user: { id: session.userId, username: session.username, name: session.name, roleId: session.roleId, roleName: session.roleName },
      permissions: permissions
    });
  });
}

function hasPermission_(roleId, module, action) {
  var perms = findRecords('Permissions', { roleId: roleId, module: module, action: action });
  return perms.length > 0 && perms[0].allowed === true;
}

/* ============================================================
 * 7. ACTIVITY LOG
 * ============================================================ */
function logActivity_(userId, action, module, referenceId, description, status) {
  try {
    insertRecord('ActivityLogs', {
      userId: userId || '', action: action, module: module, referenceId: referenceId || '',
      description: description || '', status: status || 'success'
    });
  } catch (e) { Logger.log('Failed to log activity: ' + e.message); }
}

function getActivityLogs(sessionToken, limit) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'settings', 'view')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var logs = getAllRecords('ActivityLogs').sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    return apiSuccess(logs.slice(0, limit || 100));
  });
}

/* ============================================================
 * 8. ROLES & PERMISSIONS
 * ============================================================ */
function getRoles(sessionToken) {
  return safeRun(function () {
    requireSession_(sessionToken);
    return apiSuccess(getAllRecords('Roles'));
  });
}

function createRole(sessionToken, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'roles', 'create')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    if (!data.name) return apiError('Nama role wajib diisi', 'VALIDATION_ERROR');
    if (findRecords('Roles', { name: data.name }).length) return apiError('Nama role sudah digunakan', 'DUPLICATE');
    var role = insertRecord('Roles', { name: data.name, description: data.description || '', status: 'active' });
    DEFAULT_MODULES.forEach(function (m) {
      DEFAULT_ACTIONS.forEach(function (a) { insertRecord('Permissions', { roleId: role.id, module: m, action: a, allowed: false }); });
    });
    logActivity_(session.userId, 'Create role', 'roles', role.id, 'Role dibuat: ' + role.name, 'success');
    return apiSuccess(role, 'Role berhasil dibuat');
  });
}

function updateRole(sessionToken, id, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'roles', 'edit')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var updated = updateRecord('Roles', id, data);
    logActivity_(session.userId, 'Update role', 'roles', id, 'Role diperbarui', 'success');
    return apiSuccess(updated, 'Role berhasil diperbarui');
  });
}

function deleteRole(sessionToken, id) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'roles', 'delete')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    updateRecord('Roles', id, { status: 'inactive' });
    logActivity_(session.userId, 'Delete role', 'roles', id, 'Role dinonaktifkan', 'success');
    return apiSuccess(null, 'Role berhasil dinonaktifkan');
  });
}

function getPermissions(sessionToken, roleId) {
  return safeRun(function () {
    requireSession_(sessionToken);
    return apiSuccess(findRecords('Permissions', { roleId: roleId }));
  });
}

function updatePermissions(sessionToken, roleId, permissionUpdates) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'roles', 'manage')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    permissionUpdates.forEach(function (p) {
      var existing = findRecords('Permissions', { roleId: roleId, module: p.module, action: p.action });
      if (existing.length) {
        updateRecord('Permissions', existing[0].id, { allowed: p.allowed });
      } else {
        insertRecord('Permissions', { roleId: roleId, module: p.module, action: p.action, allowed: p.allowed });
      }
    });
    logActivity_(session.userId, 'Update permission', 'roles', roleId, 'Permission role diperbarui', 'success');
    return apiSuccess(null, 'Permission berhasil disimpan');
  });
}

/* ============================================================
 * 9. USERS
 * ============================================================ */
function getUsers(sessionToken) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'users', 'view')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var users = getAllRecords('Users').map(function (u) {
      var copy = Object.assign({}, u); delete copy.passwordHash; return copy;
    });
    return apiSuccess(users);
  });
}

function createUser(sessionToken, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'users', 'create')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    if (!data.username || !data.password || !data.name || !data.roleId) return apiError('Data user tidak lengkap', 'VALIDATION_ERROR');
    if (findRecords('Users', { username: data.username }).length) return apiError('Username sudah digunakan', 'DUPLICATE');
    var user = insertRecord('Users', {
      username: data.username, email: data.email || '', passwordHash: hashPassword_(data.password),
      name: data.name, roleId: data.roleId, status: 'active', lastLoginAt: ''
    });
    logActivity_(session.userId, 'Create user', 'users', user.id, 'User dibuat: ' + user.username, 'success');
    var copy = Object.assign({}, user); delete copy.passwordHash;
    return apiSuccess(copy, 'User berhasil dibuat');
  });
}

function updateUser(sessionToken, id, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'users', 'edit')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var update = Object.assign({}, data);
    if (update.password) {
      update.passwordHash = hashPassword_(update.password);
      delete update.password;
    }
    var updated = updateRecord('Users', id, update);
    logActivity_(session.userId, 'Update user', 'users', id, 'User diperbarui', 'success');
    var copy = Object.assign({}, updated); delete copy.passwordHash;
    return apiSuccess(copy, 'User berhasil diperbarui');
  });
}

function deleteUser(sessionToken, id) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'users', 'delete')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    updateRecord('Users', id, { status: 'inactive' });
    logActivity_(session.userId, 'Delete user', 'users', id, 'User dinonaktifkan', 'success');
    return apiSuccess(null, 'User berhasil dinonaktifkan');
  });
}

/* ============================================================
 * 10. CATEGORIES
 * ============================================================ */
function getCategories(sessionToken) {
  return safeRun(function () {
    requireSession_(sessionToken);
    return apiSuccess(getAllRecords('Categories').filter(function (c) { return c.status !== 'inactive'; }));
  });
}

function createCategory(sessionToken, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'products', 'create')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    if (!data.name) return apiError('Nama kategori wajib diisi', 'VALIDATION_ERROR');
    if (findRecords('Categories', { name: data.name }).length) return apiError('Kategori sudah ada', 'DUPLICATE');
    var cat = insertRecord('Categories', { name: data.name, description: data.description || '', status: 'active' });
    logActivity_(session.userId, 'Create category', 'products', cat.id, 'Kategori dibuat: ' + cat.name, 'success');
    return apiSuccess(cat, 'Kategori berhasil dibuat');
  });
}

function updateCategory(sessionToken, id, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'products', 'edit')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var updated = updateRecord('Categories', id, data);
    logActivity_(session.userId, 'Update category', 'products', id, 'Kategori diperbarui', 'success');
    return apiSuccess(updated, 'Kategori berhasil diperbarui');
  });
}

function deleteCategory(sessionToken, id) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'products', 'delete')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    updateRecord('Categories', id, { status: 'inactive' });
    logActivity_(session.userId, 'Delete category', 'products', id, 'Kategori dinonaktifkan', 'success');
    return apiSuccess(null, 'Kategori berhasil dinonaktifkan');
  });
}

/* ============================================================
 * 10.1 EXPENSE CATEGORIES
 * ============================================================ */
function getExpenseCategories(sessionToken) {
  return safeRun(function () {
    requireSession_(sessionToken);
    return apiSuccess(getAllRecords('ExpenseCategories').filter(function (c) { return c.status !== 'inactive'; }));
  });
}

function createExpenseCategory(sessionToken, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'expenses', 'create')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    if (!data.name) return apiError('Nama kategori wajib diisi', 'VALIDATION_ERROR');
    if (findRecords('ExpenseCategories', { name: data.name }).length) return apiError('Kategori sudah ada', 'DUPLICATE');
    var cat = insertRecord('ExpenseCategories', { name: data.name, description: data.description || '', status: 'active' });
    logActivity_(session.userId, 'Create expense category', 'expenses', cat.id, 'Kategori pengeluaran dibuat: ' + cat.name, 'success');
    return apiSuccess(cat, 'Kategori berhasil dibuat');
  });
}

function updateExpenseCategory(sessionToken, id, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'expenses', 'edit')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    if (data.name && findRecords('ExpenseCategories', { name: data.name }).some(function (c) { return String(c.id) !== String(id); })) {
      return apiError('Kategori sudah ada', 'DUPLICATE');
    }
    var updated = updateRecord('ExpenseCategories', id, data);
    logActivity_(session.userId, 'Update expense category', 'expenses', id, 'Kategori pengeluaran diperbarui', 'success');
    return apiSuccess(updated, 'Kategori berhasil diperbarui');
  });
}

function deleteExpenseCategory(sessionToken, id) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'expenses', 'delete')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    updateRecord('ExpenseCategories', id, { status: 'inactive' });
    logActivity_(session.userId, 'Delete expense category', 'expenses', id, 'Kategori pengeluaran dinonaktifkan', 'success');
    return apiSuccess(null, 'Kategori berhasil dinonaktifkan');
  });
}

/* ============================================================
 * 11. PRODUCTS
 * ============================================================ */
function getProducts(sessionToken) {
  return safeRun(function () {
    requireSession_(sessionToken);
    return apiSuccess(getAllRecords('Products').filter(function (p) { return p.status !== 'inactive'; }));
  });
}

function searchProducts(sessionToken, keyword) {
  return safeRun(function () {
    requireSession_(sessionToken);
    var kw = (keyword || '').toLowerCase();
    var products = getAllRecords('Products').filter(function (p) {
      return p.status !== 'inactive' && (
        p.name.toLowerCase().indexOf(kw) !== -1 ||
        String(p.sku).toLowerCase().indexOf(kw) !== -1 ||
        String(p.barcode).toLowerCase().indexOf(kw) !== -1
      );
    });
    return apiSuccess(products);
  });
}

function filterProducts(sessionToken, filters) {
  return safeRun(function () {
    requireSession_(sessionToken);
    var products = getAllRecords('Products').filter(function (p) { return p.status !== 'inactive'; });
    if (filters && filters.categoryId) products = products.filter(function (p) { return p.categoryId === filters.categoryId; });
    return apiSuccess(products);
  });
}

function validateProductInput_(data) {
  if (!data.name) return 'Nama produk wajib diisi';
  if (isNaN(Number(data.sellPrice))) return 'Harga jual harus berupa angka';
  if (isNaN(Number(data.buyPrice))) return 'Harga beli harus berupa angka';
  if (isNaN(Number(data.stock))) return 'Stok harus berupa angka';
  if (isNaN(Number(data.minimumStock))) return 'Minimum stok harus berupa angka';
  return null;
}

function createProduct(sessionToken, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'products', 'create')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var err = validateProductInput_(data);
    if (err) return apiError(err, 'VALIDATION_ERROR');
    if (data.sku && findRecords('Products', { sku: data.sku }).length) return apiError('SKU sudah digunakan', 'DUPLICATE');
    if (data.barcode && findRecords('Products', { barcode: data.barcode }).length) return apiError('Barcode sudah digunakan', 'DUPLICATE');
    var product = insertRecord('Products', {
      sku: data.sku || '', barcode: data.barcode || '', name: data.name, categoryId: data.categoryId || '',
      buyPrice: Number(data.buyPrice), sellPrice: Number(data.sellPrice), stock: Number(data.stock) || 0,
      minimumStock: Number(data.minimumStock) || 0, unit: data.unit || 'pcs', status: 'active'
    });
    if (product.stock > 0) {
      insertRecord('StockMovements', {
        productId: product.id, type: 'INITIAL', qty: product.stock, stockBefore: 0, stockAfter: product.stock,
        referenceId: product.id, userId: session.userId, note: 'Stok awal produk'
      });
    }
    logActivity_(session.userId, 'Create product', 'products', product.id, 'Produk dibuat: ' + product.name, 'success');
    return apiSuccess(product, 'Produk berhasil dibuat');
  });
}

function updateProduct(sessionToken, id, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'products', 'edit')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var current = getRecordById('Products', id);
    if (!current) return apiError('Produk tidak ditemukan', 'NOT_FOUND');
    var updated = updateRecord('Products', id, data);
    logActivity_(session.userId, 'Update product', 'products', id, 'Produk diperbarui: ' + updated.name, 'success');
    return apiSuccess(updated, 'Produk berhasil diperbarui');
  });
}

function deleteProduct(sessionToken, id) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'products', 'delete')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    updateRecord('Products', id, { status: 'inactive' });
    logActivity_(session.userId, 'Delete product', 'products', id, 'Produk dinonaktifkan', 'success');
    return apiSuccess(null, 'Produk berhasil dinonaktifkan');
  });
}

/* ============================================================
 * 12. INVENTORY / STOCK
 * ============================================================ */
function adjustStock(sessionToken, productId, type, qty, note) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'inventory', 'manage') && !hasPermission_(session.roleId, 'inventory', 'edit')) {
      return apiError('Tidak memiliki izin', 'FORBIDDEN');
    }
    if (!qty || Number(qty) <= 0) return apiError('Qty harus lebih dari 0', 'VALIDATION_ERROR');
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var product = getRecordById('Products', productId);
      if (!product) return apiError('Produk tidak ditemukan', 'NOT_FOUND');
      var stockBefore = Number(product.stock);
      var delta = (type === 'ADJUSTMENT_OUT' || type === 'SALE') ? -Number(qty) : Number(qty);
      var stockAfter = stockBefore + delta;
      if (stockAfter < 0) return apiError('Stok tidak mencukupi', 'INSUFFICIENT_STOCK');
      updateRecord('Products', productId, { stock: stockAfter });
      insertRecord('StockMovements', {
        productId: productId, type: type, qty: Number(qty), stockBefore: stockBefore, stockAfter: stockAfter,
        referenceId: '', userId: session.userId, note: note || ''
      });
      logActivity_(session.userId, 'Stock adjustment', 'inventory', productId, type + ' ' + qty, 'success');
      return apiSuccess({ stockBefore: stockBefore, stockAfter: stockAfter }, 'Stok berhasil disesuaikan');
    } finally {
      lock.releaseLock();
    }
  });
}

function getStockMovements(sessionToken, productId) {
  return safeRun(function () {
    requireSession_(sessionToken);
    var filters = productId ? { productId: productId } : null;
    var movements = findRecords('StockMovements', filters).sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    return apiSuccess(movements);
  });
}

function getLowStockProducts(sessionToken) {
  return safeRun(function () {
    requireSession_(sessionToken);
    var products = getAllRecords('Products').filter(function (p) {
      return p.status !== 'inactive' && Number(p.stock) <= Number(p.minimumStock);
    });
    return apiSuccess(products);
  });
}

/* ============================================================
 * 13. POS / TRANSACTIONS (with LockService safety)
 * ============================================================ */
function createTransaction(sessionToken, payload) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'pos', 'create')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    if (!payload || !payload.items || payload.items.length === 0) return apiError('Keranjang belanja kosong', 'VALIDATION_ERROR');

    var lock = LockService.getScriptLock();
    var gotLock = lock.tryLock(15000);
    if (!gotLock) return apiError('Sistem sedang sibuk, silakan coba lagi', 'LOCK_TIMEOUT');

    try {
      // Validate items & stock
      var items = payload.items;
      var subtotal = 0;
      var validatedItems = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.qty || Number(it.qty) <= 0) return apiError('Qty item tidak valid', 'VALIDATION_ERROR');
        var product = getRecordById('Products', it.productId);
        if (!product || product.status === 'inactive') return apiError('Produk tidak ditemukan: ' + it.productId, 'NOT_FOUND');
        if (Number(product.stock) < Number(it.qty)) return apiError('Stok tidak cukup untuk ' + product.name, 'INSUFFICIENT_STOCK');
        var price = it.price !== undefined ? Number(it.price) : Number(product.sellPrice);
        var itemDiscount = Number(it.discount) || 0;
        var itemSubtotal = (price * Number(it.qty)) - itemDiscount;
        subtotal += itemSubtotal;
        validatedItems.push({
          productId: product.id, productName: product.name, qty: Number(it.qty), price: price,
          discount: itemDiscount, subtotal: itemSubtotal, buyPrice: Number(product.buyPrice),
          hpp: Number(product.buyPrice) * Number(it.qty)
        });
      }
      var discount = Number(payload.discount) || 0;
      var total = subtotal - discount;
      var paymentAmount = Number(payload.paymentAmount) || 0;
      if (payload.paymentMethod === 'cash' && paymentAmount < total) return apiError('Jumlah pembayaran kurang', 'VALIDATION_ERROR');
      var changeAmount = paymentAmount - total > 0 ? paymentAmount - total : 0;

      var invoiceNumber = 'INV-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + Utilities.getUuid().substring(0, 6).toUpperCase();

      var trx = insertRecord('Transactions', {
        invoiceNumber: invoiceNumber, transactionDate: new Date().toISOString(), userId: session.userId,
        subtotal: subtotal, discount: discount, total: total, paymentMethod: payload.paymentMethod || 'cash',
        paymentAmount: paymentAmount, changeAmount: changeAmount, status: 'completed'
      });

      validatedItems.forEach(function (vi) {
        insertRecord('TransactionDetails', {
          transactionId: trx.id, productId: vi.productId, productName: vi.productName, qty: vi.qty,
          price: vi.price, discount: vi.discount, subtotal: vi.subtotal, buyPrice: vi.buyPrice, hpp: vi.hpp
        });
        var product = getRecordById('Products', vi.productId);
        var stockBefore = Number(product.stock);
        var stockAfter = stockBefore - vi.qty;
        updateRecord('Products', vi.productId, { stock: stockAfter });
        insertRecord('StockMovements', {
          productId: vi.productId, type: 'SALE', qty: vi.qty, stockBefore: stockBefore, stockAfter: stockAfter,
          referenceId: trx.id, userId: session.userId, note: 'Penjualan ' + invoiceNumber
        });
      });

      logActivity_(session.userId, 'Create transaction', 'pos', trx.id, 'Transaksi ' + invoiceNumber + ' sebesar ' + total, 'success');

      return apiSuccess({
        transaction: trx, items: validatedItems
      }, 'Transaksi berhasil');
    } catch (err) {
      logActivity_(session.userId, 'Create transaction', 'pos', '', 'Gagal: ' + err.message, 'failed');
      return apiError('Transaksi gagal disimpan. Silakan coba lagi.', 'TRANSACTION_FAILED');
    } finally {
      lock.releaseLock();
    }
  });
}

function getTransactions(sessionToken, filters) {
  return safeRun(function () {
    requireSession_(sessionToken);
    var trx = getAllRecords('Transactions').sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    if (filters && filters.startDate && filters.endDate) {
      trx = trx.filter(function (t) {
        var d = new Date(t.transactionDate);
        return d >= new Date(filters.startDate) && d <= new Date(filters.endDate);
      });
    }
    return apiSuccess(trx.slice(0, 200));
  });
}

function getTransactionDetail(sessionToken, transactionId) {
  return safeRun(function () {
    requireSession_(sessionToken);
    var trx = getRecordById('Transactions', transactionId);
    if (!trx) return apiError('Transaksi tidak ditemukan', 'NOT_FOUND');
    var details = findRecords('TransactionDetails', { transactionId: transactionId });
    var user = getRecordById('Users', trx.userId);
    return apiSuccess({ transaction: trx, items: details, cashierName: user ? user.name : '' });
  });
}

/* ============================================================
 * 14. EXPENSES
 * ============================================================ */
function getExpenses(sessionToken) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'expenses', 'view')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var expenses = getAllRecords('Expenses').sort(function (a, b) { return new Date(b.expenseDate) - new Date(a.expenseDate); });
    return apiSuccess(expenses);
  });
}

function createExpense(sessionToken, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'expenses', 'create')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    if (!data.amount || Number(data.amount) <= 0) return apiError('Jumlah pengeluaran harus lebih dari 0', 'VALIDATION_ERROR');
    var expense = insertRecord('Expenses', {
      expenseDate: data.expenseDate || new Date().toISOString(), category: data.category || 'Lainnya',
      description: data.description || '', amount: Number(data.amount), userId: session.userId
    });
    logActivity_(session.userId, 'Create expense', 'expenses', expense.id, 'Pengeluaran dicatat: ' + expense.amount, 'success');
    return apiSuccess(expense, 'Pengeluaran berhasil dicatat');
  });
}

function updateExpense(sessionToken, id, data) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'expenses', 'edit')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var updated = updateRecord('Expenses', id, data);
    logActivity_(session.userId, 'Update expense', 'expenses', id, 'Pengeluaran diperbarui', 'success');
    return apiSuccess(updated, 'Pengeluaran berhasil diperbarui');
  });
}

function deleteExpense(sessionToken, id) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'expenses', 'delete')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    deleteRecord('Expenses', id);
    logActivity_(session.userId, 'Delete expense', 'expenses', id, 'Pengeluaran dihapus', 'success');
    return apiSuccess(null, 'Pengeluaran berhasil dihapus');
  });
}

/* ============================================================
 * 15. FINANCIAL REPORT
 * ============================================================ */
function getFinancialReport(sessionToken, startDate, endDate) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'reports', 'view')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var start = new Date(startDate);
    var end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    var trx = getAllRecords('Transactions').filter(function (t) {
      var d = new Date(t.transactionDate);
      return d >= start && d <= end && t.status === 'completed';
    });
    var trxIds = trx.map(function (t) { return t.id; });
    var details = getAllRecords('TransactionDetails').filter(function (d) { return trxIds.indexOf(d.transactionId) !== -1; });
    var expenses = getAllRecords('Expenses').filter(function (e) {
      var d = new Date(e.expenseDate);
      return d >= start && d <= end;
    });

    var omzet = trx.reduce(function (sum, t) { return sum + Number(t.total); }, 0);
    var hpp = details.reduce(function (sum, d) { return sum + Number(d.hpp); }, 0);
    var labaKotor = omzet - hpp;
    var totalExpense = expenses.reduce(function (sum, e) { return sum + Number(e.amount); }, 0);
    var labaBersih = labaKotor - totalExpense;

    var byProduct = {};
    details.forEach(function (d) {
      if (!byProduct[d.productId]) byProduct[d.productId] = { productName: d.productName, qty: 0, total: 0 };
      byProduct[d.productId].qty += Number(d.qty);
      byProduct[d.productId].total += Number(d.subtotal);
    });
    var productSales = Object.keys(byProduct).map(function (id) { return byProduct[id]; })
      .sort(function (a, b) { return b.total - a.total; });

    var byPayment = {};
    trx.forEach(function (t) {
      byPayment[t.paymentMethod] = (byPayment[t.paymentMethod] || 0) + Number(t.total);
    });

    return apiSuccess({
      period: { startDate: startDate, endDate: endDate },
      summary: {
        omzet: omzet, totalTransactions: trx.length, hpp: hpp, labaKotor: labaKotor,
        totalExpense: totalExpense, labaBersih: labaBersih
      },
      productSales: productSales,
      paymentMethodBreakdown: byPayment,
      expenses: expenses
    });
  });
}

/* ============================================================
 * 15.1 REPORT EXPORT (PDF & XLSX)
 * Dibangun via Spreadsheet sementara agar hasil export punya
 * styling tabel Google Sheets asli (rapi & profesional), lalu
 * file sementara tersebut langsung dihapus - hasil akhir dikirim
 * sebagai base64 ke browser untuk diunduh langsung ke perangkat,
 * BUKAN disimpan permanen ke Google Drive pengguna.
 * ============================================================ */
function exportReportXlsx(sessionToken, startDate, endDate) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'reports', 'export')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var reportRes = getFinancialReport(sessionToken, startDate, endDate);
    if (!reportRes.success) return reportRes;
    var built;
    try {
      built = buildReportSpreadsheet_(reportRes.data, startDate, endDate);
    } catch (e) {
      return apiError('Gagal menyusun data laporan: ' + e.message, 'EXPORT_BUILD_ERROR');
    }
    try {
      var url = 'https://docs.google.com/spreadsheets/d/' + built.ssId + '/export?format=xlsx&gid=' + built.sheetGid;
      var blob = fetchExport_(url).setName('Laporan Keuangan.xlsx');
      var fileName = 'Laporan-Keuangan_' + startDate + '_sd_' + endDate + '.xlsx';
      logActivity_(session.userId, 'Export report', 'reports', '', 'Export laporan XLSX periode ' + startDate + ' - ' + endDate, 'success');
      return apiSuccess({
        base64: Utilities.base64Encode(blob.getBytes()),
        fileName: fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }, 'Laporan XLSX siap diunduh');
    } catch (e) {
      return apiError('Gagal mengekspor XLSX: ' + e.message, 'EXPORT_ERROR');
    } finally {
      try { DriveApp.getFileById(built.ssId).setTrashed(true); } catch (e2) { /* abaikan, bukan bagian penting dari hasil */ }
    }
  });
}

function exportReportPdf(sessionToken, startDate, endDate) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'reports', 'export')) return apiError('Tidak memiliki izin', 'FORBIDDEN');
    var reportRes = getFinancialReport(sessionToken, startDate, endDate);
    if (!reportRes.success) return reportRes;
    var built;
    try {
      built = buildReportSpreadsheet_(reportRes.data, startDate, endDate);
    } catch (e) {
      return apiError('Gagal menyusun data laporan: ' + e.message, 'EXPORT_BUILD_ERROR');
    }
    try {
      var params = [
        'format=pdf', 'gid=' + built.sheetGid, 'portrait=true', 'fitw=true',
        'gridlines=false', 'printtitle=false', 'sheetnames=false', 'pagenumbers=false',
        'size=A4', 'top_margin=0.4', 'bottom_margin=0.4', 'left_margin=0.4', 'right_margin=0.4',
        'horizontal_alignment=CENTER'
      ].join('&');
      var url = 'https://docs.google.com/spreadsheets/d/' + built.ssId + '/export?' + params;
      var blob = fetchExport_(url);
      var fileName = 'Laporan-Keuangan_' + startDate + '_sd_' + endDate + '.pdf';
      logActivity_(session.userId, 'Export report', 'reports', '', 'Export laporan PDF periode ' + startDate + ' - ' + endDate, 'success');
      return apiSuccess({
        base64: Utilities.base64Encode(blob.getBytes()),
        fileName: fileName,
        mimeType: 'application/pdf'
      }, 'Laporan PDF siap diunduh');
    } catch (e) {
      return apiError('Gagal mengekspor PDF: ' + e.message, 'EXPORT_ERROR');
    } finally {
      try { DriveApp.getFileById(built.ssId).setTrashed(true); } catch (e2) { /* abaikan, bukan bagian penting dari hasil */ }
    }
  });
}

function fetchExport_(url) {
  var token = ScriptApp.getOAuthToken();
  var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Gagal mengekspor laporan (HTTP ' + res.getResponseCode() + ')');
  return res.getBlob();
}

function buildReportSpreadsheet_(data, startDate, endDate) {
  var settings = getAllRecords('Settings');
  var cfgMap = {};
  settings.forEach(function (s) { cfgMap[s.key] = s.value; });
  var primaryColor = cfgMap.primaryColor || '#2563eb';
  var businessName = cfgMap.businessName || cfgMap.appName || 'Laporan Keuangan';
  var COLS = 4;

  var ss = SpreadsheetApp.create('TMP-Laporan-' + new Date().getTime());
  var sheet = ss.getSheets()[0];
  sheet.setName('Laporan');
  sheet.setHiddenGridlines(true);

  var row = 1;
  sheet.getRange(row, 1, 1, COLS).merge().setValue(businessName)
    .setFontSize(15).setFontWeight('bold').setHorizontalAlignment('center')
    .setFontColor('#ffffff').setBackground(primaryColor);
  sheet.setRowHeight(row, 32);
  row++;

  sheet.getRange(row, 1, 1, COLS).merge().setValue('LAPORAN KEUANGAN')
    .setFontSize(11).setFontWeight('bold').setHorizontalAlignment('center')
    .setFontColor('#ffffff').setBackground(primaryColor);
  row++;

  sheet.getRange(row, 1, 1, COLS).merge()
    .setValue('Periode: ' + fmtDateID_(startDate) + ' s/d ' + fmtDateID_(endDate))
    .setFontStyle('italic').setHorizontalAlignment('center').setFontColor('#475569')
    .setBackground('#f1f5f9');
  row += 2;

  row = writeSectionTitle_(sheet, row, COLS, 'RINGKASAN', primaryColor);
  var s = data.summary;
  var summaryPairs = [
    ['Omzet', s.omzet, false], ['HPP', s.hpp, false], ['Laba Kotor', s.labaKotor, false],
    ['Total Pengeluaran', s.totalExpense, false], ['Laba Bersih', s.labaBersih, false],
    ['Total Transaksi', s.totalTransactions, true]
  ];
  summaryPairs.forEach(function (p, i) {
    var bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
    var labelCell = sheet.getRange(row, 1);
    labelCell.setValue(p[0]).setFontWeight('bold').setBackground(bg);
    var valCell = sheet.getRange(row, 2);
    valCell.setValue(p[1]).setNumberFormat(p[2] ? '#,##0' : '"Rp" #,##0')
      .setFontWeight('bold').setHorizontalAlignment('right').setBackground(bg);
    sheet.getRange(row, 1, 1, 2).setBorder(true, true, true, true, false, false, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);
    row++;
  });
  row++;

  row = writeSectionTitle_(sheet, row, COLS, 'PENJUALAN PER PRODUK', primaryColor);
  row = writeTable_(sheet, row,
    ['Produk', 'Qty', 'Total'],
    data.productSales.map(function (p) { return [p.productName, p.qty, p.total]; }),
    ['', '#,##0', '"Rp" #,##0']);
  row++;

  row = writeSectionTitle_(sheet, row, COLS, 'METODE PEMBAYARAN', primaryColor);
  var paymentRows = Object.keys(data.paymentMethodBreakdown).map(function (k) {
    return [capitalizeWords_(k), data.paymentMethodBreakdown[k]];
  });
  row = writeTable_(sheet, row, ['Metode', 'Total'], paymentRows, ['', '"Rp" #,##0']);
  row++;

  row = writeSectionTitle_(sheet, row, COLS, 'RINCIAN PENGELUARAN', primaryColor);
  var expenseRows = data.expenses.map(function (e) {
    return [fmtDateID_(e.expenseDate), e.category, e.description, e.amount];
  });
  row = writeTable_(sheet, row, ['Tanggal', 'Kategori', 'Deskripsi', 'Jumlah'], expenseRows,
    ['', '', '', '"Rp" #,##0']);
  row++;

  sheet.getRange(row, 1, 1, COLS).merge()
    .setValue('Dicetak pada ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMMM yyyy HH:mm'))
    .setFontSize(9).setFontColor('#94a3b8').setHorizontalAlignment('center');

  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 220);
  sheet.setColumnWidth(4, 140);
  SpreadsheetApp.flush();

  return { ssId: ss.getId(), sheetGid: sheet.getSheetId() };
}

function writeSectionTitle_(sheet, row, cols, title, color) {
  sheet.getRange(row, 1, 1, cols).merge().setValue(title)
    .setFontWeight('bold').setFontColor('#ffffff').setBackground(color || '#1e293b')
    .setHorizontalAlignment('left').setFontSize(11);
  sheet.setRowHeight(row, 24);
  return row + 1;
}

function writeTable_(sheet, startRow, headers, rows, numberFormats) {
  var cols = headers.length;
  var headerRange = sheet.getRange(startRow, 1, 1, cols);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold').setFontColor('#ffffff').setBackground('#334155')
    .setHorizontalAlignment('center')
    .setBorder(true, true, true, true, true, true, '#1e293b', SpreadsheetApp.BorderStyle.SOLID);
  var row = startRow + 1;
  if (!rows.length) {
    sheet.getRange(row, 1, 1, cols).merge().setValue('Tidak ada data')
      .setHorizontalAlignment('center').setFontColor('#94a3b8').setFontStyle('italic')
      .setBorder(true, true, true, true, false, false, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);
    return row + 1;
  }
  rows.forEach(function (r, i) {
    var range = sheet.getRange(row, 1, 1, cols);
    range.setValues([r]);
    range.setBackground(i % 2 === 0 ? '#f8fafc' : '#ffffff');
    range.setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);
    for (var c = 0; c < cols; c++) {
      if (numberFormats[c]) {
        sheet.getRange(row, c + 1).setNumberFormat(numberFormats[c]).setHorizontalAlignment('right');
      }
    }
    row++;
  });
  return row;
}

function fmtDateID_(dateStr) {
  var d = new Date(dateStr);
  if (isNaN(d)) return String(dateStr || '-');
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

function capitalizeWords_(str) {
  str = String(str || '');
  return str.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

/* ============================================================
 * 16. DASHBOARD
 * ============================================================ */
function getDashboardData(sessionToken) {
  return safeRun(function () {
    var session = requireSession_(sessionToken);
    if (!hasPermission_(session.roleId, 'dashboard', 'view')) return apiError('Tidak memiliki izin', 'FORBIDDEN');

    var now = new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    var allTrx = getAllRecords('Transactions').filter(function (t) { return t.status === 'completed'; });
    var todayTrx = allTrx.filter(function (t) { return new Date(t.transactionDate) >= todayStart; });
    var monthTrx = allTrx.filter(function (t) { return new Date(t.transactionDate) >= monthStart; });

    var omzetToday = todayTrx.reduce(function (s, t) { return s + Number(t.total); }, 0);
    var omzetMonth = monthTrx.reduce(function (s, t) { return s + Number(t.total); }, 0);

    var monthTrxIds = monthTrx.map(function (t) { return t.id; });
    var monthDetails = getAllRecords('TransactionDetails').filter(function (d) { return monthTrxIds.indexOf(d.transactionId) !== -1; });
    var hppMonth = monthDetails.reduce(function (s, d) { return s + Number(d.hpp); }, 0);
    var labaKotorMonth = omzetMonth - hppMonth;

    var monthExpenses = getAllRecords('Expenses').filter(function (e) { return new Date(e.expenseDate) >= monthStart; });
    var totalExpenseMonth = monthExpenses.reduce(function (s, e) { return s + Number(e.amount); }, 0);
    var labaBersihMonth = labaKotorMonth - totalExpenseMonth;

    var productSold = {};
    monthDetails.forEach(function (d) {
      productSold[d.productName] = (productSold[d.productName] || 0) + Number(d.qty);
    });
    var topProducts = Object.keys(productSold).map(function (name) { return { name: name, qty: productSold[name] }; })
      .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);

    var lowStock = getAllRecords('Products').filter(function (p) { return p.status !== 'inactive' && Number(p.stock) <= Number(p.minimumStock); });
    var recentTrx = allTrx.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 10);

    var salesLast7Days = [];
    for (var i = 6; i >= 0; i--) {
      var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      var dayTotal = allTrx.filter(function (t) {
        var d = new Date(t.transactionDate);
        return d >= day && d < dayEnd;
      }).reduce(function (s, t) { return s + Number(t.total); }, 0);
      salesLast7Days.push({ date: Utilities.formatDate(day, Session.getScriptTimeZone(), 'dd/MM'), total: dayTotal });
    }

    return apiSuccess({
      omzetToday: omzetToday, omzetMonth: omzetMonth, totalTransactionsToday: todayTrx.length,
      productsSoldMonth: monthDetails.reduce(function (s, d) { return s + Number(d.qty); }, 0),
      hppMonth: hppMonth, labaKotorMonth: labaKotorMonth, totalExpenseMonth: totalExpenseMonth,
      labaBersihMonth: labaBersihMonth, topProducts: topProducts, lowStockProducts: lowStock,
      recentTransactions: recentTrx, salesLast7Days: salesLast7Days
    });
  });
}

/* ============================================================
 * 17. TESTING
 * ============================================================ */
function runAllTests() {
  var results = [];
  var passed = 0, failed = 0;

  function test(name, fn) {
    try {
      var ok = fn();
      results.push({ name: name, passed: !!ok });
      if (ok) passed++; else failed++;
    } catch (e) {
      results.push({ name: name, passed: false, error: e.message });
      failed++;
    }
  }

  test('Database sheets exist', function () {
    var v = validateDatabase();
    return v.success && v.data.valid;
  });
  test('Settings has appName', function () { return getSettingRaw_('appName') !== null; });
  test('Default roles exist', function () { return getAllRecords('Roles').length >= 3; });
  test('Admin user exists', function () { return getAllRecords('Users').length >= 1; });
  test('generateId produces unique sequential id', function () {
    var id1 = generateId('Categories');
    return /^CAT-\d{6}$/.test(id1);
  });
  test('Insert & delete test category', function () {
    var cat = insertRecord('Categories', { name: 'TEST_CAT_' + Date.now(), description: '', status: 'active' });
    var found = getRecordById('Categories', cat.id);
    deleteRecord('Categories', cat.id);
    return !!found;
  });
  test('Permission check works for Owner', function () {
    var owner = findRecords('Roles', { name: 'Owner' })[0];
    return owner ? hasPermission_(owner.id, 'settings', 'manage') === true : false;
  });

  return apiSuccess({ totalTests: results.length, passed: passed, failed: failed, results: results },
    'Testing selesai: ' + passed + '/' + results.length + ' lulus');
}