/**
 * 积账 Web — 数据层（REST API + 用户认证版）
 */

const COLORS = [
  '#1976D2','#E53935','#1565C0','#FF8F00','#43A047',
  '#8E24AA','#00897B','#EF6C00','#5C6BC0','#D81B60','#00ACC1','#7CB342'
];

// ═══════ Auth Token ═══════
function getToken() { return localStorage.getItem('jizhang_token'); }
function setToken(token) { localStorage.setItem('jizhang_token', token); }
function clearToken() { localStorage.removeItem('jizhang_token'); }
function getUser() { try { return JSON.parse(localStorage.getItem('jizhang_user')); } catch { return null; } }
function setUser(user) { localStorage.setItem('jizhang_user', JSON.stringify(user)); }
function clearUser() { localStorage.removeItem('jizhang_user'); }
function isLoggedIn() { return !!getToken(); }
function getActiveBookId() {
  const v = localStorage.getItem('jizhang_active_book_id');
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}
function setActiveBookId(id) {
  if (!id) localStorage.removeItem('jizhang_active_book_id');
  else localStorage.setItem('jizhang_active_book_id', String(id));
}

// ═══════ Helper ═══════
async function api(path, options = {}) {
  const token = getToken();
  const activeBookId = getActiveBookId();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['x-auth-token'] = token;
  if (activeBookId) headers['x-book-id'] = String(activeBookId);
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearToken(); clearUser();
    if (typeof showLoginPage === 'function') showLoginPage();
    throw new Error('请先登录');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || '请求失败');
  }
  return res.json();
}

function normDate(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function openDB() { return Promise.resolve(); }

// ═══════ Auth API ═══════
async function sendCode(email) {
  return api('/api/auth/send-code', { method: 'POST', body: JSON.stringify({ email }) });
}

async function registerUser(email, code, password) {
  const result = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, code, password }) });
  setToken(result.token);
  setUser(result.user);
  if (result.books?.length) {
    const personal = result.books.find(b => b.type === 'personal') || result.books[0];
    if (personal) setActiveBookId(personal.id);
  }
  return result;
}

async function loginUser(email, password) {
  const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  setToken(result.token);
  setUser(result.user);
  if (!getActiveBookId() && result.books?.length) {
    const personal = result.books.find(b => b.type === 'personal') || result.books[0];
    if (personal) setActiveBookId(personal.id);
  }
  return result;
}

async function resetPassword(email, code, password) {
  return api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, code, password }) });
}

async function getMe() {
  return api('/api/auth/me');
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  clearToken(); clearUser();
  setActiveBookId(null);
}

// ═══════ Book API ═══════
async function getBooks() {
  return api('/api/books');
}

async function createFamilyBook(name) {
  return api('/api/books/family', { method: 'POST', body: JSON.stringify({ name }) });
}

async function inviteFamilyMember(bookId, email) {
  return api('/api/books/family/invite', { method: 'POST', body: JSON.stringify({ bookId, email }) });
}

async function getPendingInvitations() {
  return api('/api/books/invitations');
}

async function respondInvitation(invitationId, action) {
  return api(`/api/books/invitations/${invitationId}/respond`, { method: 'POST', body: JSON.stringify({ action }) });
}

async function getInvitationByToken(token) {
  return api(`/api/books/invitations/token/${encodeURIComponent(token)}`);
}

async function respondInvitationByToken(token, action) {
  return api('/api/books/invitations/token/respond', { method: 'POST', body: JSON.stringify({ token, action }) });
}

// ═══════ Category CRUD ═══════
async function getAllCategories() {
  const cats = await api('/api/categories');
  return cats.map(c => ({ ...c, isLiability: c.is_liability, colorValue: c.color_value, sortOrder: c.sort_order }));
}

async function insertCategory({ name, isLiability = false, colorValue = COLORS[0], sortOrder = 0 }) {
  const result = await api('/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name, is_liability: isLiability, color_value: colorValue, sort_order: sortOrder }),
  });
  return result.id;
}

async function updateCategory(cat) {
  await api(`/api/categories/${cat.id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: cat.name, is_liability: cat.isLiability ?? cat.is_liability ?? false, color_value: cat.colorValue ?? cat.color_value ?? '#2196F3' }),
  });
}

async function softDeleteCategory(id) { await api(`/api/categories/${id}`, { method: 'DELETE' }); }

async function getAllCategoriesRaw() {
  const cats = await api('/api/categories');
  return cats.map(c => ({ ...c, isLiability: c.is_liability, colorValue: c.color_value, sortOrder: c.sort_order, isDeleted: c.is_deleted }));
}

async function getNextSortOrder() { const r = await api('/api/categories/next-order'); return r.next; }
async function updateSortOrders(ids) { await api('/api/categories/reorder', { method: 'PUT', body: JSON.stringify({ ids }) }); }
function getNextColor(n) { return COLORS[n % COLORS.length]; }

// ═══════ Snapshot CRUD ═══════
async function saveSnapshots(dateStr, categoryValues) {
  await api('/api/snapshots', { method: 'POST', body: JSON.stringify({ date: dateStr, values: categoryValues }) });
}
async function getSnapshotsByDate(dateStr) {
  const rows = await api(`/api/snapshots/by-date?date=${dateStr}`);
  return rows.map(r => ({ ...r, categoryId: r.category_id, snapshotDate: r.snapshot_date }));
}
async function getAllSnapshots() {
  const rows = await api('/api/snapshots');
  return rows.map(r => ({ ...r, categoryId: r.category_id, snapshotDate: r.snapshot_date }));
}
async function deleteSnapshotsByDate(dateStr) { await api(`/api/snapshots?date=${dateStr}`, { method: 'DELETE' }); }

// ═══════ Computed Queries ═══════
async function getTableData() { return api('/api/table'); }
async function getLatestValues() { return api('/api/latest-values'); }
async function getDateSummary(dateStr) { return api(`/api/summary/${dateStr}`); }
async function getLatestSummary() { return api('/api/summary/latest'); }
async function getAllSnapshotDates() { return api('/api/dates'); }
async function getTotalTrend(startDate = null) { return api(`/api/trend/total${startDate ? '?start='+startDate : ''}`); }
async function getCategoryTrend(categoryId, startDate = null) { return api(`/api/trend/${categoryId}${startDate ? '?start='+startDate : ''}`); }

// ═══════ CSV Import/Export ═══════
async function exportToCsv() {
  const token = getToken();
  const activeBookId = getActiveBookId();
  const headers = { 'x-auth-token': token };
  if (activeBookId) headers['x-book-id'] = String(activeBookId);
  const res = await fetch('/api/export', { headers });
  if (!res.ok) throw new Error('导出失败');
  return res.text();
}
async function importFromCsv(csvStr) {
  const token = getToken();
  const activeBookId = getActiveBookId();
  const formData = new FormData();
  formData.append('file', new Blob([csvStr], { type: 'text/csv' }), 'import.csv');
  const headers = { 'x-auth-token': token };
  if (activeBookId) headers['x-book-id'] = String(activeBookId);
  const res = await fetch('/api/import', { method: 'POST', body: formData, headers });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: '导入失败' })); throw new Error(err.error); }
  return res.json();
}
