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
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.SESSION_SECRET || 'jizhang_secret_' + Date.now();

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function readJSON(file, fallback = []) { try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; } }
function writeJSON(file, data) { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8'); }

ensureDir(DATA_DIR);
ensureDir(path.join(DATA_DIR, 'users'));
ensureDir(path.join(DATA_DIR, 'books'));

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

async function sendFamilyInviteEmail(inviteeEmail, inviterEmail, bookName, inviteToken) {
  const inviteUrl = `${APP_BASE_URL}/?inviteToken=${encodeURIComponent(inviteToken)}`;
  try {
    await transporter.sendMail({
      from: `"积账" <${SMTP_EMAIL}>`,
      to: inviteeEmail,
      subject: '积账 - 家庭账本邀请',
      html: `
        <div style="max-width:460px;margin:0 auto;padding:28px;font-family:-apple-system,sans-serif">
          <h2 style="color:#0A1628;margin-bottom:16px">你收到了一条家庭账本邀请</h2>
          <p style="color:#4B5563;line-height:1.8;margin:0 0 10px">邀请人：<b>${inviterEmail}</b></p>
          <p style="color:#4B5563;line-height:1.8;margin:0 0 20px">账本名称：<b>${bookName}</b></p>
          <a href="${inviteUrl}" style="display:inline-block;padding:12px 18px;background:#0A1628;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">点击加入家庭账本</a>
          <p style="color:#9CA3AF;font-size:12px;margin-top:18px;line-height:1.6">如果按钮无法点击，请复制链接到浏览器打开：<br>${inviteUrl}</p>
        </div>`,
    });
    return true;
  } catch (e) {
    console.error('发送家庭邀请邮件失败:', e.message);
    return false;
  }
}

// ═══════════════════════════════════════════
//  用户系统
// ═══════════════════════════════════════════
const USERS_FILE = path.join(DATA_DIR, 'users.json');
function getUsers() { return readJSON(USERS_FILE, []); }
function saveUsers(users) { writeJSON(USERS_FILE, users); }

const BOOKS_FILE = path.join(DATA_DIR, 'books.json');
const MEMBERSHIPS_FILE = path.join(DATA_DIR, 'book_memberships.json');
const INVITATIONS_FILE = path.join(DATA_DIR, 'book_invitations.json');

function getBooks() { return readJSON(BOOKS_FILE, []); }
function saveBooks(books) { writeJSON(BOOKS_FILE, books); }
function getMemberships() { return readJSON(MEMBERSHIPS_FILE, []); }
function saveMemberships(rows) { writeJSON(MEMBERSHIPS_FILE, rows); }
function getInvitations() { return readJSON(INVITATIONS_FILE, []); }
function saveInvitations(rows) { writeJSON(INVITATIONS_FILE, rows); }

const sessions = {};
function generateToken() { return crypto.randomBytes(32).toString('hex'); }
function hashPassword(pwd) { return crypto.createHash('sha256').update(pwd + 'jizhang_salt').digest('hex'); }

function getUserDir(userId) {
  const dir = path.join(DATA_DIR, 'users', String(userId));
  ensureDir(dir);
  return dir;
}

function getBookDir(bookId) {
  const dir = path.join(DATA_DIR, 'books', String(bookId));
  ensureDir(dir);
  return dir;
}

function ensurePersonalBook(userId, email) {
  const books = getBooks();
  const memberships = getMemberships();
  let personal = books.find(b => b.type === 'personal' && b.owner_user_id === userId);
  if (!personal) {
    personal = {
      id: books.length > 0 ? Math.max(...books.map(b => b.id)) + 1 : 1,
      type: 'personal',
      name: '个人账本',
      owner_user_id: userId,
      owner_email: email,
      created_at: new Date().toISOString(),
    };
    books.push(personal);
    saveBooks(books);
  }
  const m = memberships.find(x => x.book_id === personal.id && x.user_id === userId && x.status === 'active');
  if (!m) {
    memberships.push({
      id: memberships.length > 0 ? Math.max(...memberships.map(x => x.id)) + 1 : 1,
      book_id: personal.id,
      user_id: userId,
      role: 'owner',
      status: 'active',
      joined_at: new Date().toISOString(),
    });
    saveMemberships(memberships);
  }
  return personal;
}

function getUserBooks(userId, email) {
  ensurePersonalBook(userId, email);
  const books = getBooks();
  const memberships = getMemberships().filter(m => m.user_id === userId && m.status === 'active');
  return books
    .filter(b => memberships.some(m => m.book_id === b.id))
    .map(b => {
      const mem = memberships.find(m => m.book_id === b.id);
      return {
        ...b,
        role: mem?.role || 'member',
      };
    });
}

function getBookForRequest(req) {
  const books = getUserBooks(req.userId, req.userEmail);
  const picked = req.headers['x-book-id'] || req.query.bookId || req.body?.bookId;
  const fallback = books.find(b => b.type === 'personal' && b.owner_user_id === req.userId) || books[0];
  if (!picked) return fallback;
  const id = parseInt(picked);
  if (Number.isNaN(id)) return fallback;
  return books.find(b => b.id === id) || fallback;
}

function bookMiddleware(req, res, next) {
  const book = getBookForRequest(req);
  if (!book) return res.status(403).json({ error: '没有可用账本' });
  req.book = book;
  req.dataKey = book.type === 'family' ? `family_${book.id}` : String(req.userId);
  next();
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
  ensurePersonalBook(user.id, user.email);

  // 自动登录
  const token = generateToken();
  sessions[token] = { userId: user.id, email, expiresAt: Date.now() + 7 * 24 * 3600 * 1000 };
  res.json({ ok: true, token, user: { id: user.id, email }, books: getUserBooks(user.id, user.email) });
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
  ensurePersonalBook(user.id, user.email);
  res.json({ ok: true, token, user: { id: user.id, email }, books: getUserBooks(user.id, user.email) });
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
  res.json({ id: req.userId, email: req.userEmail, books: getUserBooks(req.userId, req.userEmail) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) delete sessions[token];
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
//  Book API（需要登录）
// ═══════════════════════════════════════════
app.get('/api/books', authMiddleware, (req, res) => {
  res.json(getUserBooks(req.userId, req.userEmail));
});

app.post('/api/books/family', authMiddleware, (req, res) => {
  const { name } = req.body;
  const familyName = (name || '').trim() || '家庭账本';
  const books = getBooks();
  const memberships = getMemberships();
  const id = books.length > 0 ? Math.max(...books.map(b => b.id)) + 1 : 1;
  const now = new Date().toISOString();
  const book = {
    id,
    type: 'family',
    name: familyName,
    owner_user_id: req.userId,
    owner_email: req.userEmail,
    created_at: now,
  };
  books.push(book);
  memberships.push({
    id: memberships.length > 0 ? Math.max(...memberships.map(m => m.id)) + 1 : 1,
    book_id: id,
    user_id: req.userId,
    role: 'owner',
    status: 'active',
    joined_at: now,
  });
  saveBooks(books);
  saveMemberships(memberships);
  res.json(book);
});

app.post('/api/books/family/invite', authMiddleware, (req, res) => {
  const { email, bookId } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: '请输入有效邮箱' });
  const targetEmail = email.trim().toLowerCase();
  if (targetEmail === req.userEmail.toLowerCase()) return res.status(400).json({ error: '不能邀请自己' });

  const books = getUserBooks(req.userId, req.userEmail);
  const selectedBookId = parseInt(bookId);
  const book = books.find(b => b.id === selectedBookId);
  if (!book || book.type !== 'family') return res.status(400).json({ error: '请选择家庭账本' });

  const users = getUsers();
  const invitee = users.find(u => u.email.toLowerCase() === targetEmail);
  if (!invitee) return res.status(404).json({ error: '该邮箱尚未注册' });

  const memberships = getMemberships();
  const alreadyJoined = memberships.find(m => m.book_id === book.id && m.user_id === invitee.id && m.status === 'active');
  if (alreadyJoined) return res.status(400).json({ error: '对方已在该家庭账本中' });

  const invitations = getInvitations();
  const pending = invitations.find(inv => inv.book_id === book.id && inv.invitee_email.toLowerCase() === targetEmail && inv.status === 'pending');
  if (pending) return res.status(400).json({ error: '已发送邀请，请等待对方处理' });

  const now = new Date().toISOString();
  const inviteToken = crypto.randomBytes(24).toString('hex');
  const invite = {
    id: invitations.length > 0 ? Math.max(...invitations.map(i => i.id)) + 1 : 1,
    book_id: book.id,
    book_name: book.name,
    inviter_user_id: req.userId,
    inviter_email: req.userEmail,
    invitee_email: targetEmail,
    invite_token: inviteToken,
    status: 'pending',
    created_at: now,
  };
  invitations.push(invite);
  saveInvitations(invitations);
  sendFamilyInviteEmail(targetEmail, req.userEmail, book.name, inviteToken).catch(() => {});
  res.json({ ok: true, invite });
});

app.get('/api/books/invitations', authMiddleware, (req, res) => {
  const invitations = getInvitations().filter(inv => inv.invitee_email.toLowerCase() === req.userEmail.toLowerCase() && inv.status === 'pending');
  res.json(invitations);
});

app.get('/api/books/invitations/token/:token', authMiddleware, (req, res) => {
  const token = req.params.token;
  const invitations = getInvitations();
  const invite = invitations.find(i => i.invite_token === token);
  if (!invite) return res.status(404).json({ error: '邀请不存在或已失效' });
  if (invite.invitee_email.toLowerCase() !== req.userEmail.toLowerCase()) return res.status(403).json({ error: '该邀请不属于当前账号' });
  res.json({
    id: invite.id,
    book_id: invite.book_id,
    book_name: invite.book_name,
    inviter_email: invite.inviter_email,
    invitee_email: invite.invitee_email,
    status: invite.status,
    created_at: invite.created_at,
    responded_at: invite.responded_at,
  });
});

function applyInvitationAction(invite, action, userId) {
  invite.status = action === 'accept' ? 'accepted' : 'rejected';
  invite.responded_at = new Date().toISOString();

  if (action === 'accept') {
    const memberships = getMemberships();
    const exists = memberships.find(m => m.book_id === invite.book_id && m.user_id === userId && m.status === 'active');
    if (!exists) {
      memberships.push({
        id: memberships.length > 0 ? Math.max(...memberships.map(m => m.id)) + 1 : 1,
        book_id: invite.book_id,
        user_id: userId,
        role: 'member',
        status: 'active',
        joined_at: new Date().toISOString(),
      });
      saveMemberships(memberships);
    }
  }
}

app.post('/api/books/invitations/:id/respond', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const { action } = req.body;
  if (!['accept', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });

  const invitations = getInvitations();
  const invite = invitations.find(i => i.id === id);
  if (!invite) return res.status(404).json({ error: '邀请不存在' });
  if (invite.invitee_email.toLowerCase() !== req.userEmail.toLowerCase()) return res.status(403).json({ error: '无权操作此邀请' });
  if (invite.status !== 'pending') return res.status(400).json({ error: '邀请已处理' });

  applyInvitationAction(invite, action, req.userId);
  saveInvitations(invitations);
  res.json({ ok: true, invite });
});

app.post('/api/books/invitations/token/respond', authMiddleware, (req, res) => {
  const { token, action } = req.body;
  if (!token) return res.status(400).json({ error: '缺少邀请标识' });
  if (!['accept', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });

  const invitations = getInvitations();
  const invite = invitations.find(i => i.invite_token === token);
  if (!invite) return res.status(404).json({ error: '邀请不存在或已失效' });
  if (invite.invitee_email.toLowerCase() !== req.userEmail.toLowerCase()) return res.status(403).json({ error: '该邀请不属于当前账号' });
  if (invite.status !== 'pending') return res.status(400).json({ error: '邀请已处理' });

  applyInvitationAction(invite, action, req.userId);
  saveInvitations(invitations);
  res.json({ ok: true, invite });
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
app.get('/api/categories', authMiddleware, bookMiddleware, (req, res) => {
  const cats = getUserCategories(req.dataKey).filter(c => !c.is_deleted).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  res.json(cats);
});

app.post('/api/categories', authMiddleware, bookMiddleware, (req, res) => {
  const { name, is_liability = false, color_value = '#2196F3', sort_order = 0 } = req.body;
  const cats = getUserCategories(req.dataKey);
  const cat = { id: getNextId(cats), name, is_liability, color_value, sort_order, is_deleted: false, created_at: new Date().toISOString() };
  cats.push(cat);
  saveUserCategories(req.dataKey, cats);
  res.json(cat);
});

app.put('/api/categories/reorder', authMiddleware, bookMiddleware, (req, res) => {
  const { ids } = req.body;
  const cats = getUserCategories(req.dataKey);
  ids.forEach((id, i) => { const cat = cats.find(c => c.id === id); if (cat) cat.sort_order = i; });
  saveUserCategories(req.dataKey, cats);
  res.json({ ok: true });
});

app.put('/api/categories/:id', authMiddleware, bookMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const { name, is_liability, color_value } = req.body;
  const cats = getUserCategories(req.dataKey);
  const cat = cats.find(c => c.id === id);
  if (!cat) return res.status(404).json({ error: '类别不存在' });
  if (name !== undefined) cat.name = name;
  if (is_liability !== undefined) cat.is_liability = is_liability;
  if (color_value !== undefined) cat.color_value = color_value;
  saveUserCategories(req.dataKey, cats);
  res.json(cat);
});

app.delete('/api/categories/:id', authMiddleware, bookMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const cats = getUserCategories(req.dataKey);
  const cat = cats.find(c => c.id === id);
  if (cat) { cat.is_deleted = true; saveUserCategories(req.dataKey, cats); }
  res.json({ ok: true });
});

app.get('/api/categories/next-order', authMiddleware, bookMiddleware, (req, res) => {
  const cats = getUserCategories(req.dataKey);
  const max = cats.length > 0 ? Math.max(...cats.map(c => c.sort_order || 0)) : -1;
  res.json({ next: max + 1 });
});

// ═══════════════════════════════════════════
//  Snapshot API（需要登录）
// ═══════════════════════════════════════════
app.get('/api/snapshots', authMiddleware, bookMiddleware, (req, res) => {
  res.json(getUserSnapshots(req.dataKey).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)));
});

app.get('/api/snapshots/by-date', authMiddleware, bookMiddleware, (req, res) => {
  const { date } = req.query;
  res.json(getUserSnapshots(req.dataKey).filter(s => s.snapshot_date === date));
});

app.post('/api/snapshots', authMiddleware, bookMiddleware, (req, res) => {
  const { date, values } = req.body;
  const snaps = getUserSnapshots(req.dataKey);
  for (const [catId, value] of Object.entries(values)) {
    const cid = parseInt(catId);
    const existing = snaps.find(s => s.category_id === cid && s.snapshot_date === date);
    if (existing) { existing.value = value; }
    else { snaps.push({ id: getNextId(snaps), category_id: cid, snapshot_date: date, value }); }
  }
  saveUserSnapshots(req.dataKey, snaps);
  res.json({ ok: true });
});

app.delete('/api/snapshots', authMiddleware, bookMiddleware, (req, res) => {
  const { date } = req.query;
  const snaps = getUserSnapshots(req.dataKey).filter(s => s.snapshot_date !== date);
  saveUserSnapshots(req.dataKey, snaps);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
//  Computed API（需要登录）
// ═══════════════════════════════════════════
app.get('/api/dates', authMiddleware, bookMiddleware, (req, res) => {
  const snaps = getUserSnapshots(req.dataKey);
  res.json([...new Set(snaps.map(s => s.snapshot_date))].sort());
});

app.get('/api/latest-values', authMiddleware, bookMiddleware, (req, res) => {
  const snaps = getUserSnapshots(req.dataKey);
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

app.get('/api/table', authMiddleware, bookMiddleware, (req, res) => {
  const snaps = getUserSnapshots(req.dataKey);
  const data = {};
  for (const s of snaps) { if (!data[s.snapshot_date]) data[s.snapshot_date] = {}; data[s.snapshot_date][s.category_id] = s.value; }
  res.json(data);
});

app.get('/api/summary/latest', authMiddleware, bookMiddleware, (req, res) => {
  const snaps = getUserSnapshots(req.dataKey);
  if (snaps.length === 0) return res.json(null);
  const dates = [...new Set(snaps.map(s => s.snapshot_date))].sort();
  res.json(buildSummary(req.dataKey, dates[dates.length - 1]));
});

app.get('/api/summary/:date', authMiddleware, bookMiddleware, (req, res) => {
  res.json(buildSummary(req.dataKey, req.params.date));
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

app.get('/api/trend/total', authMiddleware, bookMiddleware, (req, res) => {
  const { start } = req.query;
  const cats = getUserCategories(req.dataKey).filter(c => !c.is_deleted);
  const catIds = new Set(cats.map(c => c.id));
  const snaps = getUserSnapshots(req.dataKey).filter(s => catIds.has(s.category_id) && (!start || s.snapshot_date >= start));
  const byDate = {};
  for (const s of snaps) { byDate[s.snapshot_date] = (byDate[s.snapshot_date] || 0) + s.value; }
  res.json(Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => ({ date: d, value: v })));
});

app.get('/api/trend/:categoryId', authMiddleware, bookMiddleware, (req, res) => {
  const catId = parseInt(req.params.categoryId);
  const { start } = req.query;
  const snaps = getUserSnapshots(req.dataKey).filter(s => s.category_id === catId && (!start || s.snapshot_date >= start));
  res.json(snaps.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)).map(s => ({ date: s.snapshot_date, value: s.value })));
});

// ═══════════════════════════════════════════
//  CSV Export/Import（需要登录）
// ═══════════════════════════════════════════
const ASSET_COLORS = ['#1976D2','#E53935','#1565C0','#FF8F00','#43A047','#8E24AA','#00897B','#EF6C00','#5C6BC0','#D81B60','#00ACC1','#7CB342'];

app.get('/api/export', authMiddleware, bookMiddleware, (req, res) => {
  const cats = getUserCategories(req.dataKey).filter(c => !c.is_deleted).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const snaps = getUserSnapshots(req.dataKey);
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

app.post('/api/import', authMiddleware, bookMiddleware, upload.single('file'), (req, res) => {
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
    const cats = getUserCategories(req.dataKey);
    const snaps = getUserSnapshots(req.dataKey);
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
    saveUserCategories(req.dataKey, cats);
    saveUserSnapshots(req.dataKey, snaps);
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
