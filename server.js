const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
const upload = multer();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════
//  配置
// ═══════════════════════════════════════════
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SMTP_EMAIL = process.env.SMTP_EMAIL || 'zhangacd@qq.com';
const SMTP_PASS = process.env.SMTP_PASS || 'bqzaqhhoqkhgbhgi';
const SECRET = process.env.SESSION_SECRET || 'jizhang_secret_' + Date.now();

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function readJSON(file, fallback = []) { try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; } }
function writeJSON(file, data) { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8'); }

ensureDir(DATA_DIR);
ensureDir(path.join(DATA_DIR, 'users'));

// ═══════════════════════════════════════════
//  邮件发送
// ═══════════════════════════════════════════
const transporter = nodemailer.createTransport({
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  auth: { user: SMTP_EMAIL, pass: SMTP_PASS },
});

// 验证码存储: { email: { code, expiresAt } }
const verificationCodes = {};

async function sendVerificationEmail(email) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  verificationCodes[email] = { code, expiresAt: Date.now() + 5 * 60 * 1000 }; // 5分钟过期

  console.log(`[验证码] ${email}: ${code}`);

  try {
    await transporter.sendMail({
      from: `"积账" <${SMTP_EMAIL}>`,
      to: email,
      subject: '积账 - 登录验证码',
      html: `
        <div style="max-width:400px;margin:0 auto;padding:30px;font-family:-apple-system,sans-serif">
          <h2 style="color:#0A1628;margin-bottom:20px">积账 登录验证码</h2>
          <p style="color:#6B7280;font-size:14px">你正在登录积账，验证码为：</p>
          <div style="font-size:32px;font-weight:700;color:#0A1628;letter-spacing:6px;padding:20px;background:#F2F4F8;border-radius:12px;text-align:center;margin:16px 0">${code}</div>
          <p style="color:#9CA3AF;font-size:12px">验证码5分钟内有效，请勿泄露给他人</p>
        </div>`,
    });
    return true;
  } catch (e) {
    console.error('发送邮件失败:', e.message);
    return false;
  }
}

// ═══════════════════════════════════════════
//  用户系统
// ═══════════════════════════════════════════
const USERS_FILE = path.join(DATA_DIR, 'users.json');
function getUsers() { return readJSON(USERS_FILE, []); }
function saveUsers(users) { writeJSON(USERS_FILE, users); }

const sessions = {};
function generateToken() { return crypto.randomBytes(32).toString('hex'); }
function hashPassword(pwd) { return crypto.createHash('sha256').update(pwd + 'jizhang_salt').digest('hex'); }

function getUserDir(userId) {
  const dir = path.join(DATA_DIR, 'users', String(userId));
  ensureDir(dir);
  return dir;
}

// ═══════════════════════════════════════════
//  认证中间件
// ═══════════════════════════════════════════
function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token || !sessions[token] || sessions[token].expiresAt < Date.now()) {
    return res.status(401).json({ error: '请先登录' });
  }
  req.userId = sessions[token].userId;
  req.userEmail = sessions[token].email;
  sessions[token].expiresAt = Date.now() + 7 * 24 * 3600 * 1000;
  next();
}

// ═══════════════════════════════════════════
//  认证 API
// ═══════════════════════════════════════════

// 发送验证码（注册 + 找回密码通用）
app.post('/api/auth/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: '请输入有效的邮箱地址' });
  const existing = verificationCodes[email];
  if (existing && existing.expiresAt - Date.now() > 4 * 60 * 1000) {
    return res.status(429).json({ error: '验证码已发送，请60秒后重试' });
  }
  const ok = await sendVerificationEmail(email);
  if (ok) res.json({ ok: true });
  else res.status(500).json({ error: '发送失败，请检查邮箱地址' });
});

// 注册：邮箱 + 验证码 + 密码
app.post('/api/auth/register', (req, res) => {
  const { email, code, password } = req.body;
  if (!email || !code || !password) return res.status(400).json({ error: '请填写完整信息' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });

  // 验证码校验
  const record = verificationCodes[email];
  if (!record || record.expiresAt < Date.now()) return res.status(400).json({ error: '验证码已过期' });
  if (record.code !== code) return res.status(400).json({ error: '验证码错误' });
  delete verificationCodes[email];

  // 检查是否已注册
  const users = getUsers();
  if (users.find(u => u.email === email)) return res.status(400).json({ error: '该邮箱已注册，请直接登录' });

  // 创建用户
  const user = { id: users.length + 1, email, password: hashPassword(password), createdAt: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  ensureDir(getUserDir(user.id));

  // 自动登录
  const token = generateToken();
  sessions[token] = { userId: user.id, email, expiresAt: Date.now() + 7 * 24 * 3600 * 1000 };
  res.json({ ok: true, token, user: { id: user.id, email } });
});

// 登录：邮箱 + 密码
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: '请填写邮箱和密码' });

  const users = getUsers();
  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: '该邮箱未注册' });
  if (user.password !== hashPassword(password)) return res.status(400).json({ error: '密码错误' });

  const token = generateToken();
  sessions[token] = { userId: user.id, email, expiresAt: Date.now() + 7 * 24 * 3600 * 1000 };
  res.json({ ok: true, token, user: { id: user.id, email } });
});

// 重置密码：邮箱 + 验证码 + 新密码
app.post('/api/auth/reset-password', (req, res) => {
  const { email, code, password } = req.body;
  if (!email || !code || !password) return res.status(400).json({ error: '请填写完整信息' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });

  const record = verificationCodes[email];
  if (!record || record.expiresAt < Date.now()) return res.status(400).json({ error: '验证码已过期' });
  if (record.code !== code) return res.status(400).json({ error: '验证码错误' });
  delete verificationCodes[email];

  const users = getUsers();
  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: '该邮箱未注册' });

  user.password = hashPassword(password);
  saveUsers(users);
  res.json({ ok: true, message: '密码已重置，请用新密码登录' });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ id: req.userId, email: req.userEmail });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) delete sessions[token];
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
//  用户数据文件操作
// ═══════════════════════════════════════════
function getUserCategories(userId) { return readJSON(path.join(getUserDir(userId), 'categories.json'), []); }
function saveUserCategories(userId, cats) { writeJSON(path.join(getUserDir(userId), 'categories.json'), cats); }
function getUserSnapshots(userId) { return readJSON(path.join(getUserDir(userId), 'snapshots.json'), []); }
function saveUserSnapshots(userId, snaps) { writeJSON(path.join(getUserDir(userId), 'snapshots.json'), snaps); }

function getNextId(arr) { return arr.length > 0 ? Math.max(...arr.map(x => x.id)) + 1 : 1; }

// ═══════════════════════════════════════════
//  Category API（需要登录）
// ═══════════════════════════════════════════
app.get('/api/categories', authMiddleware, (req, res) => {
  const cats = getUserCategories(req.userId).filter(c => !c.is_deleted).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  res.json(cats);
});

app.post('/api/categories', authMiddleware, (req, res) => {
  const { name, is_liability = false, color_value = '#2196F3', sort_order = 0 } = req.body;
  const cats = getUserCategories(req.userId);
  const cat = { id: getNextId(cats), name, is_liability, color_value, sort_order, is_deleted: false, created_at: new Date().toISOString() };
  cats.push(cat);
  saveUserCategories(req.userId, cats);
  res.json(cat);
});

app.put('/api/categories/reorder', authMiddleware, (req, res) => {
  const { ids } = req.body;
  const cats = getUserCategories(req.userId);
  ids.forEach((id, i) => { const cat = cats.find(c => c.id === id); if (cat) cat.sort_order = i; });
  saveUserCategories(req.userId, cats);
  res.json({ ok: true });
});

app.put('/api/categories/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const { name, is_liability, color_value } = req.body;
  const cats = getUserCategories(req.userId);
  const cat = cats.find(c => c.id === id);
  if (!cat) return res.status(404).json({ error: '类别不存在' });
  if (name !== undefined) cat.name = name;
  if (is_liability !== undefined) cat.is_liability = is_liability;
  if (color_value !== undefined) cat.color_value = color_value;
  saveUserCategories(req.userId, cats);
  res.json(cat);
});

app.delete('/api/categories/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const cats = getUserCategories(req.userId);
  const cat = cats.find(c => c.id === id);
  if (cat) { cat.is_deleted = true; saveUserCategories(req.userId, cats); }
  res.json({ ok: true });
});

app.get('/api/categories/next-order', authMiddleware, (req, res) => {
  const cats = getUserCategories(req.userId);
  const max = cats.length > 0 ? Math.max(...cats.map(c => c.sort_order || 0)) : -1;
  res.json({ next: max + 1 });
});

// ═══════════════════════════════════════════
//  Snapshot API（需要登录）
// ═══════════════════════════════════════════
app.get('/api/snapshots', authMiddleware, (req, res) => {
  res.json(getUserSnapshots(req.userId).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)));
});

app.get('/api/snapshots/by-date', authMiddleware, (req, res) => {
  const { date } = req.query;
  res.json(getUserSnapshots(req.userId).filter(s => s.snapshot_date === date));
});

app.post('/api/snapshots', authMiddleware, (req, res) => {
  const { date, values } = req.body;
  const snaps = getUserSnapshots(req.userId);
  for (const [catId, value] of Object.entries(values)) {
    const cid = parseInt(catId);
    const existing = snaps.find(s => s.category_id === cid && s.snapshot_date === date);
    if (existing) { existing.value = value; }
    else { snaps.push({ id: getNextId(snaps), category_id: cid, snapshot_date: date, value }); }
  }
  saveUserSnapshots(req.userId, snaps);
  res.json({ ok: true });
});

app.delete('/api/snapshots', authMiddleware, (req, res) => {
  const { date } = req.query;
  const snaps = getUserSnapshots(req.userId).filter(s => s.snapshot_date !== date);
  saveUserSnapshots(req.userId, snaps);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
//  Computed API（需要登录）
// ═══════════════════════════════════════════
app.get('/api/dates', authMiddleware, (req, res) => {
  const snaps = getUserSnapshots(req.userId);
  res.json([...new Set(snaps.map(s => s.snapshot_date))].sort());
});

app.get('/api/latest-values', authMiddleware, (req, res) => {
  const snaps = getUserSnapshots(req.userId);
  const latest = {};
  for (const s of snaps) {
    if (!latest[s.category_id] || s.snapshot_date > latest[s.category_id].date) {
      latest[s.category_id] = { date: s.snapshot_date, value: s.value };
    }
  }
  const result = {};
  for (const [k, v] of Object.entries(latest)) result[k] = v.value;
  res.json(result);
});

app.get('/api/table', authMiddleware, (req, res) => {
  const snaps = getUserSnapshots(req.userId);
  const data = {};
  for (const s of snaps) { if (!data[s.snapshot_date]) data[s.snapshot_date] = {}; data[s.snapshot_date][s.category_id] = s.value; }
  res.json(data);
});

app.get('/api/summary/latest', authMiddleware, (req, res) => {
  const snaps = getUserSnapshots(req.userId);
  if (snaps.length === 0) return res.json(null);
  const dates = [...new Set(snaps.map(s => s.snapshot_date))].sort();
  res.json(buildSummary(req.userId, dates[dates.length - 1]));
});

app.get('/api/summary/:date', authMiddleware, (req, res) => {
  res.json(buildSummary(req.userId, req.params.date));
});

function buildSummary(userId, date) {
  const cats = getUserCategories(userId).filter(c => !c.is_deleted);
  const catMap = Object.fromEntries(cats.map(c => [c.id, c]));
  const snaps = getUserSnapshots(userId).filter(s => s.snapshot_date === date);
  if (snaps.length === 0) return null;
  let totalAssets = 0, totalLiabilities = 0;
  const items = [];
  for (const s of snaps) {
    const cat = catMap[s.category_id]; if (!cat) continue;
    if (cat.is_liability || s.value < 0) totalLiabilities += Math.abs(s.value);
    else totalAssets += s.value;
    items.push({ categoryId: s.category_id, categoryName: cat.name, isLiability: cat.is_liability, colorValue: cat.color_value, value: s.value });
  }
  items.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return { date, totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities, items };
}

app.get('/api/trend/total', authMiddleware, (req, res) => {
  const { start } = req.query;
  const cats = getUserCategories(req.userId).filter(c => !c.is_deleted);
  const catIds = new Set(cats.map(c => c.id));
  const snaps = getUserSnapshots(req.userId).filter(s => catIds.has(s.category_id) && (!start || s.snapshot_date >= start));
  const byDate = {};
  for (const s of snaps) { byDate[s.snapshot_date] = (byDate[s.snapshot_date] || 0) + s.value; }
  res.json(Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => ({ date: d, value: v })));
});

app.get('/api/trend/:categoryId', authMiddleware, (req, res) => {
  const catId = parseInt(req.params.categoryId);
  const { start } = req.query;
  const snaps = getUserSnapshots(req.userId).filter(s => s.category_id === catId && (!start || s.snapshot_date >= start));
  res.json(snaps.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)).map(s => ({ date: s.snapshot_date, value: s.value })));
});

// ═══════════════════════════════════════════
//  CSV Export/Import（需要登录）
// ═══════════════════════════════════════════
const ASSET_COLORS = ['#1976D2','#E53935','#1565C0','#FF8F00','#43A047','#8E24AA','#00897B','#EF6C00','#5C6BC0','#D81B60','#00ACC1','#7CB342'];

app.get('/api/export', authMiddleware, (req, res) => {
  const cats = getUserCategories(req.userId).filter(c => !c.is_deleted).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const snaps = getUserSnapshots(req.userId);
  const dates = [...new Set(snaps.map(s => s.snapshot_date))].sort();
  if (cats.length === 0 || dates.length === 0) return res.status(400).json({ error: '没有数据可导出' });
  const tableData = {};
  snaps.forEach(s => { if (!tableData[s.snapshot_date]) tableData[s.snapshot_date] = {}; tableData[s.snapshot_date][s.category_id] = s.value; });
  let csv = '\uFEFF项目,类型';
  dates.forEach(d => { const p = d.split('-'); csv += `,${p[0]}/${parseInt(p[1])}/${parseInt(p[2])}`; });
  csv += '\n';
  cats.forEach(cat => {
    const name = cat.name.includes(',') ? `"${cat.name}"` : cat.name;
    csv += `${name},${cat.is_liability ? '负债' : '资产'}`;
    dates.forEach(d => { csv += `,${tableData[d]?.[cat.id] ?? ''}`; });
    csv += '\n';
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="jizhang_${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});

app.post('/api/import', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });
    let csvStr = req.file.buffer.toString('utf-8');
    if (csvStr.charCodeAt(0) === 0xFEFF) csvStr = csvStr.slice(1);
    const lines = csvStr.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) throw new Error('CSV格式不正确');
    const header = parseCsvLine(lines[0]);
    if (header.length < 3 || header[0] !== '项目' || header[1] !== '类型') throw new Error('CSV表头格式不正确');
    const dates = [];
    for (let i = 2; i < header.length; i++) {
      const parts = header[i].split('/');
      if (parts.length !== 3) throw new Error(`日期格式错误: ${header[i]}`);
      dates.push(`${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`);
    }
    const cats = getUserCategories(req.userId);
    const snaps = getUserSnapshots(req.userId);
    const nameMap = Object.fromEntries(cats.filter(c => !c.is_deleted).map(c => [c.name, c.id]));
    let catsImported = 0, snapsImported = 0, colorIdx = cats.length;
    for (let li = 1; li < lines.length; li++) {
      const fields = parseCsvLine(lines[li]);
      if (fields.length < 3) continue;
      const name = fields[0], type = fields[1], isLiab = type === '负债';
      let catId;
      if (nameMap[name] !== undefined) { catId = nameMap[name]; }
      else {
        const maxOrder = cats.length > 0 ? Math.max(...cats.map(c => c.sort_order || 0)) : -1;
        catId = getNextId(cats);
        cats.push({ id: catId, name, is_liability: isLiab, color_value: ASSET_COLORS[colorIdx % ASSET_COLORS.length], sort_order: maxOrder + 1, is_deleted: false, created_at: new Date().toISOString() });
        nameMap[name] = catId; colorIdx++; catsImported++;
      }
      for (let i = 2; i < fields.length && (i-2) < dates.length; i++) {
        const v = fields[i].trim(); if (!v) continue;
        const val = parseFloat(v); if (isNaN(val)) continue;
        const existing = snaps.find(s => s.category_id === catId && s.snapshot_date === dates[i-2]);
        if (existing) { existing.value = val; } else { snaps.push({ id: getNextId(snaps), category_id: catId, snapshot_date: dates[i-2], value: val }); }
        snapsImported++;
      }
    }
    saveUserCategories(req.userId, cats);
    saveUserSnapshots(req.userId, snaps);
    res.json({ categoriesImported: catsImported, snapshotsImported: snapsImported, categoriesSkipped: (lines.length - 1) - catsImported });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function parseCsvLine(line) {
  const result = []; let inQ = false; let cur = '';
  for (const ch of line) { if (ch === '"') inQ = !inQ; else if (ch === ',' && !inQ) { result.push(cur); cur = ''; } else cur += ch; }
  result.push(cur); return result;
}

// ═══════════════════════════════════════════
//  SPA fallback
// ═══════════════════════════════════════════
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// ═══════════════════════════════════════════
//  启动
// ═══════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`积账网页版运行在 http://localhost:${PORT}`);
  console.log(`数据存储在: ${DATA_DIR}`);
});
