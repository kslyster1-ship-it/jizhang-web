# 积账 Web

一个面向个人与家庭的资产记账应用。

## 功能

- 邮箱注册 / 登录 / 找回密码（验证码）
- 个人账本（默认自动创建）
- 家庭账本（可创建并邀请成员）
- 邀请成员共享记账数据（支持邮件邀请链接）
- 资产/负债分类管理
- 每日快照记录、趋势图、报告导出
- CSV 导入 / 导出

## 本地启动

```bash
npm install
npm run dev
```

默认访问地址：

- `http://localhost:3000/`

## 家庭账本使用流程

1. 登录后，在首页顶部进入「账本管理」。
2. 点击「创建家庭账本」。
3. 在家庭账本中点击「邀请」，输入对方已注册邮箱。
4. 对方收到邮件后点击链接，登录后即可一键接受邀请。
5. 双方切换到同一个家庭账本后，可共同记账并共享数据。

## 邀请链接说明

邮件邀请链接形如：

- `http://localhost:3000/?inviteToken=xxxx`

前端会自动识别 `inviteToken`，登录后弹出邀请处理框（接受/拒绝）。

## 环境变量

可选配置：

- `PORT`：服务端口，默认 `3000`
- `DATA_DIR`：数据目录，默认 `./data`
- `APP_BASE_URL`：邀请邮件中的应用地址，默认 `http://localhost:3000`
- `SMTP_EMAIL`：发件邮箱
- `SMTP_PASS`：发件邮箱授权码
- `SESSION_SECRET`：会话密钥

示例：

```bash
APP_BASE_URL=https://your-domain.com PORT=3000 npm run dev
```

## 数据文件

- `data/users.json`：用户信息
- `data/books.json`：账本信息（个人/家庭）
- `data/book_memberships.json`：账本成员关系
- `data/book_invitations.json`：邀请记录
- `data/users/<id>/`：个人账本分类与快照
- `data/users/family_<bookId>/`：家庭账本分类与快照

## 技术栈

- Node.js + Express
- 原生前端（HTML/CSS/JS）
- Chart.js
- Nodemailer
