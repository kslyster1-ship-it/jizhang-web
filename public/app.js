/**
 * 积账 Web — 应用逻辑
 * 单页应用：所有页面通过 JS 动态渲染
 */

let currentPage = 'home';
let chartInstances = {};
let homeSelectedDate = null; // 首页资产明细选中的日期
let tableSelectedDate = null; // 数据管理页选中的日期

// ═══════════════════════════════════════════
//  格式化工具
// ═══════════════════════════════════════════
function fmtCurrency(v) { return '¥' + fmtAmount(v); }
function fmtAmount(v) { return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtChange(v) { return (v >= 0 ? '+' : '') + fmtAmount(v); }
function fmtDate(d) { const p = d.split('-'); return `${p[0]}/${parseInt(p[1])}/${parseInt(p[2])}`; }
function fmtDateShort(d) { const p = d.split('-'); return `${parseInt(p[1])}/${parseInt(p[2])}`; }
function fmtDateFull(d) { const p = d.split('-'); return `${p[0]}年${parseInt(p[1])}月${parseInt(p[2])}日`; }
function fmtLargeAmount(v) {
  const a = Math.abs(v); const s = v < 0 ? '-' : '';
  if (a >= 1e8) return s + (a/1e8).toFixed(2) + '亿';
  if (a >= 1e4) return s + (a/1e4).toFixed(1) + '万';
  return s + a.toFixed(0);
}
function todayStr() { return normDate(new Date()); }

// ═══════════════════════════════════════════
//  Toast
// ═══════════════════════════════════════════
function showToast(msg, type = 'info', duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.className = 'toast', duration);
}

// ═══════════════════════════════════════════
//  Navigation
// ═══════════════════════════════════════════
function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  const fab = document.getElementById('fab');
  fab.classList.toggle('hidden', page !== 'home');
  destroyCharts();
  renderPage(page);
}

function destroyCharts() {
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};
}

async function renderPage(page) {
  const container = document.getElementById('page-container');
  container.scrollTop = 0;
  switch (page) {
    case 'home': return renderHomePage(container);
    case 'table': return renderTablePage(container);
    case 'charts': return renderChartsPage(container);
    case 'report': return renderReportPage(container);
  }
}

// ═══════════════════════════════════════════
//  Modal
// ═══════════════════════════════════════════
function openModal(html) {
  const m = document.getElementById('modal-container');
  m.innerHTML = html;
  m.className = 'modal-container visible';
  document.getElementById('fab').classList.add('hidden');
  document.getElementById('bottom-nav').style.display = 'none';
}

function closeModal() {
  const m = document.getElementById('modal-container');
  m.className = 'modal-container hidden';
  document.getElementById('bottom-nav').style.display = '';
  if (currentPage === 'home') document.getElementById('fab').classList.remove('hidden');
  renderPage(currentPage);
}

// ═══════════════════════════════════════════
//  Dialog
// ═══════════════════════════════════════════
function showDialog(html) {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `<div class="dialog">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

function closeDialog(overlay) { if (overlay) overlay.remove(); }

// ═══════════════════════════════════════════
//  HOME PAGE
// ═══════════════════════════════════════════
async function renderHomePage(container) {
  const summary = await getLatestSummary();
  if (!summary) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg></div>
        <div class="empty-title">开始追踪你的资产</div>
        <div class="empty-subtitle">记录每一项资产的变化<br>积少成多，让财富增长一目了然</div>
        <button class="btn-primary" style="width:auto;padding:15px 40px" onclick="openAddSnapshot()">新增第一条记录</button>
      </div>`;
    return;
  }

  // 使用选中的日期或最新日期
  if (!homeSelectedDate) homeSelectedDate = summary.date;
  const currentSummary = homeSelectedDate === summary.date ? summary : await getDateSummary(homeSelectedDate);
  const trend = await getTotalTrend();

  container.innerHTML = `
    <div class="hero-header">
      <div class="hero-topbar">
        <h1>积账</h1>
        <div class="hero-topbar-actions">
          <button onclick="openFeedback()"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg></button>
          <button onclick="openCategoryManage()"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>管理</button>
          <button onclick="handleLogout()" style="opacity:0.6"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg></button>
        </div>
      </div>
      <div class="hero-label">净资产</div>
      <div class="hero-amount">${fmtCurrency(summary.netWorth)}</div>
      <div class="hero-date">更新于 ${fmtDateFull(summary.date)}</div>
    </div>
    <div class="content-pad mt-16">
      <div class="card mb-16">
        <div class="card-header">
          <div class="card-icon" style="background:rgba(212,168,83,0.12)">
            <svg viewBox="0 0 24 24" fill="var(--accent)"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>
          </div>
          <div class="card-title">资产趋势</div>
        </div>
        <div class="chart-canvas-wrap" style="height:180px"><canvas id="home-trend-chart"></canvas></div>
      </div>
      <div class="card" id="detail-card">
        <div class="card-header">
          <div class="card-icon" style="background:rgba(10,22,40,0.08)">
            <svg viewBox="0 0 24 24" fill="var(--primary)"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
          </div>
          <div class="card-title">资产明细</div>
          <div class="card-badge" style="cursor:pointer;display:flex;align-items:center;gap:4px" onclick="pickHomeDate()">
            <svg viewBox="0 0 24 24" fill="var(--text-tertiary)" width="14" height="14"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>
            <span id="home-date-text">${fmtDate(homeSelectedDate)}</span>
            <svg viewBox="0 0 24 24" fill="var(--text-tertiary)" width="12" height="12"><path d="M7 10l5 5 5-5z"/></svg>
          </div>
        </div>
        ${currentSummary && currentSummary.items.length > 0 ? `
        ${currentSummary.items.map(it => `
          <div class="asset-item asset-item-editable" onclick="editSingleItem('${homeSelectedDate}',${it.categoryId})">
            <div class="asset-color-bar" style="background:${it.colorValue}"></div>
            <div class="asset-name">${it.categoryName}</div>
            <div class="asset-value ${it.value < 0 ? 'negative' : ''}">${fmtAmount(it.value)}</div>
            <svg class="asset-edit-icon" viewBox="0 0 24 24" fill="var(--text-tertiary)"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
          </div>`).join('')}
        <div class="divider"></div>
        <div class="total-row">
          <div class="label">Total</div>
          <div class="value">${fmtAmount(currentSummary.netWorth)}</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn-outline" style="flex:1;font-size:13px;padding:10px" onclick="openAddSnapshot('${homeSelectedDate}')">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="vertical-align:-3px;margin-right:4px"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>编辑当天记录
          </button>
          <button class="btn-outline" style="flex:1;font-size:13px;padding:10px;color:var(--negative);border-color:rgba(231,76,60,0.3)" onclick="deleteHomeDate('${homeSelectedDate}')">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="vertical-align:-3px;margin-right:4px"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>删除当天记录
          </button>
        </div>
        ` : '<div style="padding:20px 0;text-align:center;color:var(--text-tertiary);font-size:14px">该日期暂无记录</div>'}
      </div>
    </div>`;

  // Render trend chart
  if (trend.length >= 2) {
    const ctx = document.getElementById('home-trend-chart');
    if (ctx) {
      chartInstances['homeTrend'] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: trend.map(p => fmtDateShort(p.date)),
          datasets: [{
            data: trend.map(p => p.value),
            borderColor: '#0A1628',
            backgroundColor: 'rgba(10,22,40,0.08)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: trend.length <= 15 ? 3 : 0,
            pointBackgroundColor: 'white',
            pointBorderColor: '#0A1628',
            pointBorderWidth: 1.5,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: {
            callbacks: { label: ctx => fmtCurrency(ctx.parsed.y) }
          }},
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9CA3AF', maxTicksLimit: 5 } },
            y: { grid: { color: '#E5E7EB' }, ticks: { font: { size: 10 }, color: '#9CA3AF', callback: v => fmtLargeAmount(v) } }
          }
        }
      });
    }
  }
}

// ═══════════════════════════════════════════
//  TABLE PAGE
// ═══════════════════════════════════════════
async function renderTablePage(container) {
  const dates = await getAllSnapshotDates();

  if (dates.length === 0) {
    container.innerHTML = `
      <div class="table-actions">
        <h2>数据管理</h2>
        <div class="btns">
          <button class="icon-btn" onclick="handleImport()" title="导入" style="background:rgba(46,204,113,0.1)"><svg viewBox="0 0 24 24" fill="var(--positive)"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg></button>
          <button class="icon-btn" onclick="handleExport()" title="导出"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg></button>
        </div>
      </div>
      <div class="empty-state">
        <div class="empty-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg></div>
        <div class="empty-title">暂无数据</div>
        <div class="empty-subtitle">可以导入CSV数据，或新增记录</div>
        <div style="display:flex;gap:12px">
          <button class="btn-outline" style="padding:12px 24px" onclick="handleImport()">导入数据</button>
          <button class="btn-primary" style="width:auto;padding:12px 24px" onclick="openAddSnapshot()">新增记录</button>
        </div>
      </div>`;
    return;
  }

  // 默认显示最新日期
  const currentDate = tableSelectedDate || dates[dates.length - 1];
  tableSelectedDate = currentDate;
  const summary = await getDateSummary(currentDate);

  container.innerHTML = `
    <div class="table-actions">
      <h2>数据管理</h2>
      <div class="btns">
        <button class="icon-btn" onclick="handleExport()" title="导出"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg></button>
        <button class="icon-btn" onclick="handleImport()" title="导入" style="background:rgba(46,204,113,0.1)"><svg viewBox="0 0 24 24" fill="var(--positive)"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg></button>
        <button class="icon-btn" onclick="openAddSnapshot()" title="新增"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg></button>
      </div>
    </div>
    <div style="padding:0 16px">
      <div class="alloc-date-btn" onclick="pickTableDate()">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>
        <span id="table-date-text">${fmtDateFull(currentDate)}</span>
        <svg viewBox="0 0 24 24" fill="var(--text-tertiary)" width="16" height="16" style="margin-left:auto"><path d="M7 10l5 5 5-5z"/></svg>
      </div>
    </div>
    <div id="table-date-detail" style="padding:0 16px 16px">
      ${summary ? renderDateDetailCard(summary) : '<div style="padding:40px 0;text-align:center;color:var(--text-tertiary)">该日期暂无记录</div>'}
    </div>
    <div style="text-align:center;padding:8px 16px">
      <button class="btn-outline" style="width:100%;font-size:13px;padding:10px" onclick="openAddSnapshot('${currentDate}')">编辑 ${fmtDate(currentDate)} 的记录</button>
    </div>
    <div style="text-align:center;padding:0 16px 20px">
      <button class="btn-outline" style="width:100%;font-size:13px;padding:10px;color:var(--negative);border-color:rgba(231,76,60,0.3)" onclick="deleteTableDate('${currentDate}')">删除 ${fmtDate(currentDate)} 的全部记录</button>
    </div>`;
}

function renderDateDetailCard(summary) {
  const positive = summary.items.filter(i => i.value > 0);
  const total = positive.reduce((s, i) => s + i.value, 0);
  return `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:rgba(10,22,40,0.04);border-bottom:1px solid var(--divider)">
        <span style="font-weight:700;font-size:15px">净资产</span>
        <span style="font-weight:700;font-size:18px;color:var(--primary);letter-spacing:-0.5px">${fmtCurrency(summary.netWorth)}</span>
      </div>
      <div style="padding:12px 20px">
        ${summary.items.map(it => `
          <div class="asset-item">
            <div class="asset-color-bar" style="background:${it.colorValue}"></div>
            <div class="asset-name" style="${it.value<0?'color:var(--negative)':''}">${it.categoryName}</div>
            ${total > 0 && it.value > 0 ? `<span style="font-size:10px;color:var(--text-tertiary);margin-right:6px">${(it.value/total*100).toFixed(1)}%</span>` : ''}
            <div class="asset-value ${it.value<0?'negative':''}">${fmtAmount(it.value)}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

async function pickTableDate() {
  const dates = await getAllSnapshotDates();
  if (dates.length === 0) { showToast('暂无记录', 'info'); return; }
  const items = dates.slice().reverse().map(d => `
    <div style="padding:14px 4px;cursor:pointer;border-bottom:1px solid #f0f1f3;display:flex;justify-content:space-between;align-items:center" onclick="selectTableDate('${d}',this)">
      <span style="font-size:15px;font-weight:500">${fmtDateFull(d)}</span>
      ${d === tableSelectedDate ? '<span style="color:var(--primary);font-size:12px;font-weight:600">当前</span>' : ''}
    </div>`).join('');
  showDialog(`<h3>选择日期</h3><div style="max-height:350px;overflow-y:auto">${items}</div><div class="dialog-actions"><button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button></div>`);
}

function selectTableDate(dateStr, el) {
  el.closest('.dialog-overlay').remove();
  tableSelectedDate = dateStr;
  renderTablePage(document.getElementById('page-container'));
}

async function deleteTableDate(dateStr) {
  showDialog(`
    <h3>确认删除</h3>
    <p style="color:var(--text-secondary);font-size:14px;line-height:1.6">确定要删除 <b>${fmtDateFull(dateStr)}</b> 的全部记录吗？<br>此操作不可恢复。</p>
    <div class="dialog-actions">
      <button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
      <button class="danger" onclick="doDeleteTableDate('${dateStr}',this)">删除</button>
    </div>`);
}

async function doDeleteTableDate(dateStr, btn) {
  btn.closest('.dialog-overlay').remove();
  await deleteSnapshotsByDate(dateStr);
  showToast(`已删除 ${fmtDate(dateStr)} 的记录`, 'success');
  tableSelectedDate = null;
  renderTablePage(document.getElementById('page-container'));
}

async function showTableDateDetail(dateStr) {
  const summary = await getDateSummary(dateStr);
  const dd = document.getElementById('table-date-detail');
  if (!dd || !summary) return;

  const positive = summary.items.filter(i => i.value > 0);
  const total = positive.reduce((s, i) => s + i.value, 0);

  dd.innerHTML = `
    <div class="detail-card" style="margin:12px 16px 0">
      <div class="detail-card-header">
        <div class="date">${fmtDateFull(dateStr)}</div>
        <div class="amount">${fmtCurrency(summary.netWorth)}</div>
      </div>
      <div class="detail-card-body">
        ${summary.items.map(it => `
          <div class="detail-row">
            <div class="detail-bar" style="background:${it.colorValue}"></div>
            <div class="detail-name" style="${it.value<0?'color:var(--negative)':''}">${it.categoryName}</div>
            <div class="detail-value" style="${it.value<0?'color:var(--negative)':''}">${fmtAmount(it.value)}</div>
            ${total > 0 && it.value > 0 ? `<div style="font-size:10px;color:var(--text-tertiary);margin-left:4px">${(it.value/total*100).toFixed(1)}%</div>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
  dd.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function pickTableDate() {
  const dates = await getAllSnapshotDates();
  if (dates.length === 0) { showToast('暂无记录', 'info'); return; }
  const items = dates.slice().reverse().map(d => `
    <div style="padding:14px 4px;cursor:pointer;border-bottom:1px solid #f0f1f3" onclick="this.closest('.dialog-overlay').remove();showTableDateDetail('${d}')">
      <span style="font-size:15px;font-weight:500">${fmtDateFull(d)}</span>
    </div>`).join('');
  showDialog(`<h3>选择日期查看配置</h3><div style="max-height:350px;overflow-y:auto">${items}</div><div class="dialog-actions"><button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button></div>`);
}

// ═══════════════════════════════════════════
//  CHARTS PAGE
// ═══════════════════════════════════════════
let chartTab = 0, chartTimeRange = '全部';

async function renderChartsPage(container) {
  container.innerHTML = `
    <div class="chart-header"><h2>图表分析</h2></div>
    <div class="chart-tabs">
      <div class="chart-tab ${chartTab===0?'active':''}" onclick="switchChartTab(0)">总资产趋势</div>
      <div class="chart-tab ${chartTab===1?'active':''}" onclick="switchChartTab(1)">资产配置</div>
      <div class="chart-tab ${chartTab===2?'active':''}" onclick="switchChartTab(2)">单项趋势</div>
    </div>
    <div id="chart-content"></div>`;
  await renderChartContent();
}

function switchChartTab(tab) { chartTab = tab; destroyCharts(); renderChartContent(); }

async function renderChartContent() {
  const cc = document.getElementById('chart-content');
  if (!cc) return;
  switch (chartTab) {
    case 0: return renderTrendChart(cc);
    case 1: return renderAllocationChart(cc);
    case 2: return renderCategoryChart(cc);
  }
}

async function renderTrendChart(cc) {
  const startDate = getStartDate(chartTimeRange);
  const trend = await getTotalTrend(startDate);

  cc.innerHTML = `
    ${buildTimeRangeHtml()}
    <div class="chart-area">
      ${trend.length < 2 ? '<div class="empty-state" style="min-height:30vh"><div class="empty-title" style="font-size:14px;color:var(--text-secondary)">至少需要2条记录才能显示趋势图</div></div>' : `
      <div style="padding-bottom:8px">
        <span style="font-size:18px;font-weight:700">最新: ${fmtCurrency(trend[trend.length-1].value)}</span>
        <span style="font-size:14px;font-weight:500;color:${trend[trend.length-1].value - trend[0].value >= 0 ? 'var(--positive)' : 'var(--negative)'}">
          ${fmtChange(trend[trend.length-1].value - trend[0].value)}
        </span>
      </div>
      <div class="chart-canvas-wrap"><canvas id="trend-canvas"></canvas></div>
      `}
    </div>
    <div id="trend-detail"></div>`;

  if (trend.length >= 2) {
    chartInstances['trend'] = new Chart(document.getElementById('trend-canvas'), {
      type: 'line',
      data: {
        labels: trend.map(p => fmtDateShort(p.date)),
        datasets: [{ data: trend.map(p => p.value), borderColor: '#0A1628', backgroundColor: 'rgba(10,22,40,0.08)', fill: true, tension: 0.3, borderWidth: 2.5, pointRadius: trend.length <= 20 ? 3 : 0, pointBackgroundColor: '#fff', pointBorderColor: '#0A1628', pointBorderWidth: 2 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        onClick: async (e, els) => {
          if (els.length > 0) {
            const idx = els[0].index;
            const detail = await getDateSummary(trend[idx].date);
            const dd = document.getElementById('trend-detail');
            if (detail && dd) {
              dd.innerHTML = `<div class="detail-card">
                <div class="detail-card-header"><div class="date">${fmtDateFull(detail.date)}</div><div class="amount">${fmtCurrency(detail.netWorth)}</div></div>
                <div class="detail-card-body">${detail.items.map(it => `<div class="detail-row"><div class="detail-bar" style="background:${it.colorValue}"></div><div class="detail-name" style="${it.value<0?'color:var(--negative)':''}">${it.categoryName}</div><div class="detail-value" style="${it.value<0?'color:var(--negative)':''}">${fmtAmount(it.value)}</div></div>`).join('')}</div>
              </div>`;
            }
          }
        },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: ctx => { const i = ctx[0].dataIndex; return fmtDate(trend[i].date); }, label: ctx => fmtCurrency(ctx.parsed.y) } } },
        scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9CA3AF', maxTicksLimit: 6 } }, y: { grid: { color: '#E5E7EB' }, ticks: { font: { size: 10 }, color: '#9CA3AF', callback: v => fmtLargeAmount(v) } } }
      }
    });
  }
}

async function renderAllocationChart(cc) {
  const dates = await getAllSnapshotDates();
  if (dates.length === 0) { cc.innerHTML = '<div class="empty-state" style="min-height:40vh"><div class="empty-title" style="font-size:14px;color:var(--text-secondary)">暂无数据</div></div>'; return; }

  const selectedDate = dates[dates.length - 1];
  cc.innerHTML = `
    <div class="alloc-date-btn" onclick="pickAllocDate()">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>
      <span id="alloc-date-text">${fmtDateFull(selectedDate)}</span>
    </div>
    <div class="chart-area"><div class="chart-canvas-wrap" style="height:200px"><canvas id="pie-canvas"></canvas></div></div>
    <div id="pie-legend" class="pie-legend"></div>`;

  await renderPieForDate(selectedDate);
}

async function renderPieForDate(dateStr) {
  const summary = await getDateSummary(dateStr);
  if (!summary) return;
  const positive = summary.items.filter(i => i.value > 0);
  if (positive.length === 0) return;
  const total = positive.reduce((s, i) => s + i.value, 0);

  if (chartInstances['pie']) chartInstances['pie'].destroy();
  chartInstances['pie'] = new Chart(document.getElementById('pie-canvas'), {
    type: 'doughnut',
    data: {
      labels: positive.map(i => i.categoryName),
      datasets: [{ data: positive.map(i => i.value), backgroundColor: positive.map(i => i.colorValue), borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '50%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtAmount(ctx.parsed)} (${(ctx.parsed/total*100).toFixed(1)}%)` } } }
    }
  });

  document.getElementById('pie-legend').innerHTML = positive.map(i =>
    `<div class="pie-legend-item"><div class="pie-dot" style="background:${i.colorValue}"></div><div class="name">${i.categoryName}</div><div class="val">${fmtAmount(i.value)} (${(i.value/total*100).toFixed(1)}%)</div></div>`
  ).join('') + (summary.totalLiabilities > 0 ? `<div class="pie-legend-item"><div class="pie-dot" style="background:var(--negative)"></div><div class="name" style="color:var(--negative)">负债合计</div><div class="val" style="color:var(--negative)">-${fmtAmount(summary.totalLiabilities)}</div></div>` : '');
}

async function pickAllocDate() {
  const dates = await getAllSnapshotDates();
  const items = dates.reverse().map(d => `<div style="padding:12px;cursor:pointer;border-bottom:1px solid #f0f1f3" onclick="selectAllocDate('${d}',this)">${fmtDateFull(d)}</div>`).join('');
  showDialog(`<h3>选择日期</h3><div style="max-height:300px;overflow-y:auto">${items}</div><div class="dialog-actions"><button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button></div>`);
}

async function selectAllocDate(dateStr, el) {
  el.closest('.dialog-overlay').remove();
  document.getElementById('alloc-date-text').textContent = fmtDateFull(dateStr);
  await renderPieForDate(dateStr);
}

async function renderCategoryChart(cc) {
  const cats = await getAllCategories();
  if (cats.length === 0) { cc.innerHTML = '<div class="empty-state" style="min-height:40vh"><div class="empty-title" style="font-size:14px;color:var(--text-secondary)">暂无资产类别</div></div>'; return; }

  const options = cats.map(c => `<option value="${c.id}" data-color="${c.colorValue}">${c.name}</option>`).join('');
  cc.innerHTML = `
    ${buildTimeRangeHtml()}
    <div style="padding:0 16px">
      <select id="cat-select" onchange="updateCatChart()" style="width:100%;padding:10px 14px;border:1px solid var(--border-light);border-radius:var(--radius-lg);font-size:14px;background:var(--input-bg);outline:none">${options}</select>
    </div>
    <div class="chart-area"><div class="chart-canvas-wrap"><canvas id="cat-canvas"></canvas></div></div>`;

  await updateCatChart();
}

async function updateCatChart() {
  const sel = document.getElementById('cat-select');
  if (!sel) return;
  const catId = parseInt(sel.value);
  const color = sel.options[sel.selectedIndex].dataset.color;
  const startDate = getStartDate(chartTimeRange);
  const trend = await getCategoryTrend(catId, startDate);

  if (chartInstances['cat']) chartInstances['cat'].destroy();
  if (trend.length < 2) return;

  chartInstances['cat'] = new Chart(document.getElementById('cat-canvas'), {
    type: 'line',
    data: {
      labels: trend.map(p => fmtDateShort(p.date)),
      datasets: [{ data: trend.map(p => p.value), borderColor: color, borderWidth: 2.5, tension: 0.3, pointRadius: trend.length <= 20 ? 3 : 0, pointBackgroundColor: '#fff', pointBorderColor: color, pointBorderWidth: 2, fill: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtCurrency(ctx.parsed.y) } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9CA3AF', maxTicksLimit: 6 } }, y: { grid: { color: '#E5E7EB' }, ticks: { font: { size: 10 }, color: '#9CA3AF', callback: v => fmtLargeAmount(v) } } }
    }
  });
}

function buildTimeRangeHtml() {
  return `<div class="time-range">${['1M','3M','6M','1Y','全部'].map(r =>
    `<button class="time-chip ${chartTimeRange===r?'active':''}" onclick="setTimeRange('${r}')">${r}</button>`
  ).join('')}</div>`;
}

function setTimeRange(r) { chartTimeRange = r; destroyCharts(); renderChartContent(); }

function getStartDate(range) {
  const now = new Date();
  switch (range) {
    case '1M': return normDate(new Date(now.getFullYear(), now.getMonth()-1, now.getDate()));
    case '3M': return normDate(new Date(now.getFullYear(), now.getMonth()-3, now.getDate()));
    case '6M': return normDate(new Date(now.getFullYear(), now.getMonth()-6, now.getDate()));
    case '1Y': return normDate(new Date(now.getFullYear()-1, now.getMonth(), now.getDate()));
    default: return null;
  }
}

// ═══════════════════════════════════════════
//  REPORT PAGE
// ═══════════════════════════════════════════
async function renderReportPage(container) {
  const summary = await getLatestSummary();
  if (!summary) {
    container.innerHTML = `<div class="table-actions"><h2>资产报告</h2></div><div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"/></svg></div><div class="empty-title">暂无数据</div><div class="empty-subtitle">请先添加资产记录</div></div>`;
    return;
  }

  const pct = (v) => summary.totalAssets > 0 && v > 0 ? `<span style="font-size:10px;font-weight:600;color:inherit;background:currentColor;-webkit-background-clip:text;padding:3px 7px;border-radius:6px;opacity:0.6">${(v/summary.totalAssets*100).toFixed(1)}%</span>` : '';

  container.innerHTML = `
    <div class="table-actions"><h2>资产报告</h2></div>
    <div class="report-card" id="report-capture">
      <div class="report-header">
        <div class="report-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9z"/></svg></div>
        <div class="report-title"><h2>资产报告</h2><p>Asset Report</p></div>
        <div style="flex:1"></div>
        <div class="card-badge">${fmtDate(summary.date)}</div>
      </div>
      <div class="report-hero"><div class="label">净资产</div><div class="amount">${fmtCurrency(summary.netWorth)}</div></div>
      <div class="summary-row">
        <div class="summary-item positive"><div class="label">↗ 资产总计</div><div class="value">${fmtCurrency(summary.totalAssets)}</div></div>
        <div class="summary-item negative"><div class="label">↘ 负债总计</div><div class="value">${fmtCurrency(summary.totalLiabilities)}</div></div>
      </div>
      <div class="section-label">资产明细</div>
      ${summary.items.map(it => `
        <div class="asset-item">
          <div class="asset-color-bar" style="background:${it.colorValue}"></div>
          <div class="asset-name" style="${it.value<0?'color:var(--negative)':''}">${it.categoryName}</div>
          <div class="asset-value ${it.value<0?'negative':''}">${fmtCurrency(it.value)}</div>
        </div>`).join('')}
      <div class="divider" style="margin:6px 0"></div>
      <div class="total-row"><div class="label">合计</div><div class="value">${fmtCurrency(summary.netWorth)}</div></div>
      <div class="report-watermark mt-16">✦ 由 积账 生成</div>
    </div>
    <div style="padding:0 20px 20px"><button class="btn-primary" onclick="shareReport()">分享报告</button></div>`;
}

// ═══════════════════════════════════════════
//  HOME PAGE — 资产明细交互
// ═══════════════════════════════════════════
async function pickHomeDate() {
  const dates = await getAllSnapshotDates();
  if (dates.length === 0) { showToast('暂无记录', 'info'); return; }
  const items = dates.slice().reverse().map(d => `
    <div style="padding:14px 4px;cursor:pointer;border-bottom:1px solid #f0f1f3;display:flex;justify-content:space-between;align-items:center" onclick="selectHomeDate('${d}',this)">
      <span style="font-size:15px;font-weight:500">${fmtDateFull(d)}</span>
      ${d === homeSelectedDate ? '<span style="color:var(--primary);font-size:12px;font-weight:600">当前</span>' : ''}
    </div>`).join('');
  showDialog(`<h3>选择日期</h3><div style="max-height:350px;overflow-y:auto">${items}</div><div class="dialog-actions"><button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button></div>`);
}

function selectHomeDate(dateStr, el) {
  el.closest('.dialog-overlay').remove();
  homeSelectedDate = dateStr;
  destroyCharts();
  renderHomePage(document.getElementById('page-container'));
}

async function editSingleItem(dateStr, categoryId) {
  const cats = await getAllCategories();
  const cat = cats.find(c => c.id === categoryId);
  if (!cat) return;
  const snaps = await getSnapshotsByDate(dateStr);
  const snap = snaps.find(s => s.categoryId === categoryId);
  const currentVal = snap ? Math.abs(snap.value) : 0;

  showDialog(`
    <h3>编辑 ${cat.name}</h3>
    <p style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px">${fmtDateFull(dateStr)}</p>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="width:4px;height:36px;border-radius:2px;background:${cat.colorValue}"></div>
      <span style="font-size:14px;font-weight:600">${cat.name}</span>
    </div>
    <input type="number" step="0.01" id="edit-item-val" value="${currentVal.toFixed(2)}" placeholder="0.00" style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:var(--radius-lg);font-size:18px;font-weight:600;outline:none;background:var(--input-bg)" autofocus>
    <div class="dialog-actions" style="margin-top:20px">
      <button class="danger" onclick="deleteSingleItem('${dateStr}',${categoryId},this)">删除此条</button>
      <div style="flex:1"></div>
      <button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
      <button class="confirm" onclick="saveSingleItem('${dateStr}',${categoryId},${cat.isLiability},this)">保存</button>
    </div>`);
}

async function saveSingleItem(dateStr, categoryId, isLiability, btn) {
  const overlay = btn.closest('.dialog-overlay');
  const val = parseFloat(overlay.querySelector('#edit-item-val').value);
  if (isNaN(val)) { showToast('请输入有效金额', 'error'); return; }
  const saveVal = isLiability ? -Math.abs(val) : val;
  await saveSnapshots(dateStr, { [categoryId]: saveVal });
  overlay.remove();
  showToast('已更新', 'success');
  homeSelectedDate = dateStr;
  destroyCharts();
  renderHomePage(document.getElementById('page-container'));
}

async function deleteSingleItem(dateStr, categoryId, btn) {
  const overlay = btn.closest('.dialog-overlay');
  overlay.remove();
  showDialog(`
    <h3>确认删除</h3>
    <p style="color:var(--text-secondary);font-size:14px">确定要删除该条目吗？</p>
    <div class="dialog-actions">
      <button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
      <button class="danger" onclick="doDeleteSingleItem('${dateStr}',${categoryId},this)">删除</button>
    </div>`);
}

async function doDeleteSingleItem(dateStr, categoryId, btn) {
  btn.closest('.dialog-overlay').remove();
  // 获取该日期所有快照，删掉这一条，重新保存其余
  const snaps = await getSnapshotsByDate(dateStr);
  await deleteSnapshotsByDate(dateStr);
  const remaining = snaps.filter(s => s.categoryId !== categoryId);
  if (remaining.length > 0) {
    const vals = {};
    remaining.forEach(s => { vals[s.categoryId] = s.value; });
    await saveSnapshots(dateStr, vals);
  }
  showToast('已删除', 'success');
  homeSelectedDate = dateStr;
  destroyCharts();
  renderHomePage(document.getElementById('page-container'));
}

async function deleteHomeDate(dateStr) {
  showDialog(`
    <h3>确认删除</h3>
    <p style="color:var(--text-secondary);font-size:14px;line-height:1.6">确定要删除 <b>${fmtDateFull(dateStr)}</b> 的全部记录吗？<br>此操作不可恢复。</p>
    <div class="dialog-actions">
      <button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
      <button class="danger" onclick="doDeleteHomeDate('${dateStr}',this)">删除</button>
    </div>`);
}

async function doDeleteHomeDate(dateStr, btn) {
  btn.closest('.dialog-overlay').remove();
  await deleteSnapshotsByDate(dateStr);
  showToast(`已删除 ${fmtDate(dateStr)} 的记录`, 'success');
  homeSelectedDate = null; // 重置为最新日期
  destroyCharts();
  renderHomePage(document.getElementById('page-container'));
}

function shareReport() {
  showToast('网页版暂不支持截图分享，请使用App版本', 'info');
}

// ═══════════════════════════════════════════
//  ADD/EDIT SNAPSHOT
// ═══════════════════════════════════════════
let snapDate = todayStr(), snapShowAssets = true;

async function openAddSnapshot(editDate) {
  snapDate = editDate || todayStr();
  snapShowAssets = true;
  const cats = await getAllCategories();
  const latestVals = await getLatestValues();
  const dateSnaps = await getSnapshotsByDate(snapDate);
  const dateVals = Object.fromEntries(dateSnaps.map(s => [s.categoryId, s.value]));

  renderSnapshotModal(cats, latestVals, dateVals, editDate);
}

function renderSnapshotModal(cats, latestVals, dateVals, editDate) {
  const assetCats = cats.filter(c => !c.isLiability);
  const liabCats = cats.filter(c => c.isLiability);

  // 只显示该日期已有数据的类别（用户需要手动添加新类别）
  const currentTypeCats = snapShowAssets ? assetCats : liabCats;
  const catsWithData = currentTypeCats.filter(c => dateVals[c.id] !== undefined);

  const inputRows = catsWithData.map(c => {
    const val = dateVals[c.id];
    const displayVal = val != null ? Math.abs(val).toFixed(2) : '';
    return `<div class="input-row" data-row-cat-id="${c.id}">
      <div class="color-bar" style="background:${c.colorValue}"></div>
      <div class="cat-name ${c.isLiability?'liability':''}">${c.name}</div>
      <input type="number" step="0.01" placeholder="0.00" value="${displayVal}" data-cat-id="${c.id}" oninput="updateSnapTotals()">
      <button class="row-action-btn" onclick="removeSnapRow(this)" title="移除"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
    </div>`;
  }).join('');

  openModal(`
    <div class="modal-header">
      <button class="back-btn" onclick="closeModal()"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></button>
      <h2>${editDate ? '编辑记录' : '新增记录'}</h2>
      <button class="action-btn" onclick="closeModal();openCategoryManage()"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg></button>
    </div>
    <div class="date-selector" style="position:relative">
      <div class="date-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg></div>
      <div class="date-text">${fmtDateFull(snapDate)}</div>
      <div class="date-chevron"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></div>
      <input type="date" id="snap-date-native" value="${snapDate}" max="${todayStr()}" onchange="onSnapDateChange(this.value)" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0.02;z-index:10;border:none;background:transparent;font-size:16px;color:transparent;-webkit-text-fill-color:transparent;touch-action:manipulation">
    </div>
    <div class="type-toggle">
      <div class="type-chip ${snapShowAssets?'active':''}" onclick="snapShowAssets=true;reRenderSnap()">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9z"/></svg>
        <div class="type-chip-text"><h3>资产</h3><p>${assetCats.length} 项</p></div>
      </div>
      <div class="type-chip ${!snapShowAssets?'active':''}" onclick="snapShowAssets=false;reRenderSnap()">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.11-.9-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
        <div class="type-chip-text"><h3>负债</h3><p>${liabCats.length} 项</p></div>
      </div>
    </div>
    <div class="px-20" id="snap-inputs">
      ${inputRows}
      <button class="add-cat-btn" onclick="selectExistingCategory()">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        添加类别
      </button>
    </div>
    <div class="bottom-bar" id="snap-bottom">
      <div class="row"><span class="sub-label">${snapShowAssets?'资产小计':'负债小计'}</span><span class="sub-value" id="snap-subtotal">¥0.00</span></div>
      <div class="row mt-4"><span class="net-label">净资产</span><span class="net-value" id="snap-net">¥0.00</span></div>
      <button class="btn-primary mt-14" onclick="saveSnapshot()">保存</button>
    </div>`);

  updateSnapTotals();
}

async function reRenderSnap() {
  const cats = await getAllCategories();
  const latestVals = await getLatestValues();
  // Collect current input values before re-render
  const currentVals = {};
  document.querySelectorAll('#snap-inputs input[data-cat-id]').forEach(inp => {
    if (inp.value) currentVals[inp.dataset.catId] = parseFloat(inp.value);
  });
  const dateSnaps = await getSnapshotsByDate(snapDate);
  const dateVals = Object.fromEntries(dateSnaps.map(s => [s.categoryId, s.value]));
  Object.assign(dateVals, Object.fromEntries(Object.entries(currentVals).map(([k,v]) => [parseInt(k), v])));
  renderSnapshotModal(cats, await getLatestValues(), dateVals);
}

async function onSnapDateChange(picked) {
  if (!picked) return;
  snapDate = picked;
  const cats = await getAllCategories();
  const latestVals = await getLatestValues();
  const dateSnaps = await getSnapshotsByDate(snapDate);
  const dateVals = Object.fromEntries(dateSnaps.map(s => [s.categoryId, s.value]));
  renderSnapshotModal(cats, latestVals, dateVals, snapDate);
}

function removeSnapRow(btn) {
  const row = btn.closest('.input-row');
  if (row) {
    row.remove();
    updateSnapTotals();
  }
}

function updateSnapTotals() {
  let subtotal = 0, assetTotal = 0, liabTotal = 0;
  document.querySelectorAll('#snap-inputs input[data-cat-id]').forEach(inp => {
    const v = parseFloat(inp.value) || 0;
    subtotal += v;
  });
  // Need all inputs for net worth calculation - re-read from all cats
  // For simplicity, just show subtotal of current tab
  const subEl = document.getElementById('snap-subtotal');
  const netEl = document.getElementById('snap-net');
  if (subEl) {
    subEl.textContent = fmtCurrency(subtotal);
    subEl.className = `sub-value ${subtotal >= 0 ? 'positive' : 'negative'}`;
  }
  if (netEl) {
    netEl.textContent = fmtCurrency(subtotal);
    netEl.className = `net-value ${subtotal >= 0 ? '' : 'negative'}`;
  }
}

async function saveSnapshot() {
  const inputs = document.querySelectorAll('#snap-inputs input[data-cat-id]');
  const cats = await getAllCategories();
  const catMap = Object.fromEntries(cats.map(c => [c.id, c]));
  const values = {};
  inputs.forEach(inp => {
    const v = parseFloat(inp.value);
    if (!isNaN(v)) {
      const catId = parseInt(inp.dataset.catId);
      const cat = catMap[catId];
      values[catId] = cat && cat.isLiability ? -Math.abs(v) : v;
    }
  });

  if (Object.keys(values).length === 0) { showToast('请至少填写一项资产金额', 'error'); return; }

  try {
    await saveSnapshots(snapDate, values);
    showToast(`已保存 ${fmtDate(snapDate)} 的资产记录`, 'success');
    closeModal();
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error');
  }
}

async function selectExistingCategory() {
  // 获取所有匹配当前类型的类别
  const allCats = await getAllCategories();
  const typeCats = allCats.filter(c => snapShowAssets ? !c.isLiability : c.isLiability);

  // 找出当前页面已经显示的类别ID
  const shownIds = new Set();
  document.querySelectorAll('#snap-inputs input[data-cat-id]').forEach(inp => {
    shownIds.add(parseInt(inp.dataset.catId));
  });

  // 过滤出还没显示的类别
  const available = typeCats.filter(c => !shownIds.has(c.id));

  if (available.length === 0) {
    showDialog(`
      <h3>没有更多${snapShowAssets ? '资产' : '负债'}类别</h3>
      <p style="color:var(--text-secondary);font-size:14px;line-height:1.6">所有${snapShowAssets ? '资产' : '负债'}类别已添加到列表中。<br><br>如需新建类别，请前往「类别管理」。</p>
      <div class="dialog-actions">
        <button class="cancel" onclick="this.closest('.dialog-overlay').remove()">关闭</button>
        <button class="confirm" onclick="this.closest('.dialog-overlay').remove();closeModal();openCategoryManage()">去类别管理</button>
      </div>`);
    return;
  }

  const items = available.map(c => `
    <div style="display:flex;align-items:center;gap:12px;padding:14px 4px;border-bottom:1px solid #f0f1f3;cursor:pointer;-webkit-tap-highlight-color:transparent" onclick="doSelectCategory(${c.id},this)">
      <div style="width:32px;height:32px;border-radius:10px;background:${c.colorValue}22;display:flex;align-items:center;justify-content:center">
        <div style="width:12px;height:12px;border-radius:50%;background:${c.colorValue}"></div>
      </div>
      <span style="font-size:15px;font-weight:500">${c.name}</span>
    </div>`).join('');

  showDialog(`
    <h3>选择${snapShowAssets ? '资产' : '负债'}项目</h3>
    <div style="max-height:350px;overflow-y:auto">${items}</div>
    <div class="dialog-actions">
      <button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
    </div>`);
}

async function doSelectCategory(catId, el) {
  el.closest('.dialog-overlay').remove();
  // 将选中的类别添加到输入列表
  const allCats = await getAllCategories();
  const cat = allCats.find(c => c.id === catId);
  if (!cat) return;

  const inputsDiv = document.getElementById('snap-inputs');
  const addBtn = inputsDiv.querySelector('.add-cat-btn');
  const row = document.createElement('div');
  row.className = 'input-row';
  row.innerHTML = `
    <div class="color-bar" style="background:${cat.colorValue}"></div>
    <div class="cat-name ${cat.isLiability?'liability':''}">${cat.name}</div>
    <input type="number" step="0.01" placeholder="0.00" value="" data-cat-id="${cat.id}" oninput="updateSnapTotals()">`;
  inputsDiv.insertBefore(row, addBtn);

  // 聚焦到新增的输入框
  const newInput = row.querySelector('input');
  if (newInput) newInput.focus();

  updateSnapTotals();
}

// ═══════════════════════════════════════════
//  CATEGORY MANAGEMENT
// ═══════════════════════════════════════════
async function openCategoryManage() {
  const cats = await getAllCategories();
  const items = cats.map(c => `
    <div class="category-item" data-id="${c.id}">
      <div class="category-icon" style="background:${c.colorValue}22"><svg viewBox="0 0 24 24" fill="${c.colorValue}"><path d="${c.isLiability ? 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.11-.9-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z' : 'M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9z'}"/></svg></div>
      <div class="category-info"><div class="name ${c.isLiability?'liability':''}">${c.name}</div><div class="type">${c.isLiability?'负债':'资产'}</div></div>
      <div class="category-actions">
        <button onclick="editCategory(${c.id})"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
        <button class="delete-btn" onclick="deleteCategory(${c.id},'${c.name.replace(/'/g,"\\'")}')"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
      </div>
    </div>`).join('');

  openModal(`
    <div class="modal-header">
      <button class="back-btn" onclick="closeModal()"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></button>
      <h2>类别管理</h2>
    </div>
    <div class="content-pad" style="padding-top:12px" id="cat-list">
      ${cats.length === 0 ? '<div class="empty-state" style="min-height:40vh"><div class="empty-title" style="font-size:16px;color:var(--text-secondary)">还没有资产类别</div></div>' : items}
    </div>
    <div style="position:fixed;bottom:20px;right:20px;z-index:210">
      <button class="fab" style="position:static" onclick="addCategoryDialog()"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg><span>新增类别</span></button>
    </div>`);
}

async function addCategoryDialog() {
  const overlay = showDialog(`
    <h3>新增类别</h3>
    <input type="text" id="cat-name" placeholder="如：招商银行" autofocus>
    <div class="liability-toggle" id="liab-toggle" onclick="this.classList.toggle('active');this.querySelector('.toggle-switch').classList.toggle('on')">
      <label>标记为负债</label>
      <div class="toggle-switch"></div>
    </div>
    <div class="section-label" style="font-size:13px;color:var(--text-secondary)">选择颜色</div>
    <div class="color-picker">${COLORS.map((c,i) => `<div class="color-dot ${i===0?'selected':''}" style="background:${c}" data-idx="${i}" onclick="document.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('selected'));this.classList.add('selected')"></div>`).join('')}</div>
    <div class="dialog-actions">
      <button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
      <button class="confirm" onclick="doAddCategory(this)">添加</button>
    </div>`);
}

async function doAddCategory(btn) {
  const overlay = btn.closest('.dialog-overlay');
  const name = overlay.querySelector('#cat-name').value.trim();
  if (!name) return;
  const isLiab = overlay.querySelector('#liab-toggle').classList.contains('active');
  const selDot = overlay.querySelector('.color-dot.selected');
  const colorIdx = selDot ? parseInt(selDot.dataset.idx) : 0;
  const so = await getNextSortOrder();
  await insertCategory({ name, isLiability: isLiab, colorValue: COLORS[colorIdx], sortOrder: so });
  overlay.remove();
  openCategoryManage();
}

async function editCategory(id) {
  const cats = await getAllCategoriesRaw();
  const cat = cats.find(c => c.id === id);
  if (!cat) return;
  const currentColorIdx = COLORS.indexOf(cat.colorValue);

  const overlay = showDialog(`
    <h3>编辑类别</h3>
    <input type="text" id="edit-cat-name" value="${cat.name}">
    <div class="liability-toggle ${cat.isLiability?'active':''}" id="edit-liab" onclick="this.classList.toggle('active');this.querySelector('.toggle-switch').classList.toggle('on')">
      <label>标记为负债</label>
      <div class="toggle-switch ${cat.isLiability?'on':''}"></div>
    </div>
    <div class="section-label" style="font-size:13px;color:var(--text-secondary)">选择颜色</div>
    <div class="color-picker">${COLORS.map((c,i) => `<div class="color-dot ${i===currentColorIdx?'selected':''}" style="background:${c}" data-idx="${i}" onclick="document.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('selected'));this.classList.add('selected')"></div>`).join('')}</div>
    <div class="dialog-actions">
      <button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
      <button class="confirm" onclick="doEditCategory(${id},this)">保存</button>
    </div>`);
}

async function doEditCategory(id, btn) {
  const overlay = btn.closest('.dialog-overlay');
  const name = overlay.querySelector('#edit-cat-name').value.trim();
  if (!name) return;
  const isLiab = overlay.querySelector('#edit-liab').classList.contains('active');
  const selDot = overlay.querySelector('.color-dot.selected');
  const colorIdx = selDot ? parseInt(selDot.dataset.idx) : 0;
  const cats = await getAllCategoriesRaw();
  const cat = cats.find(c => c.id === id);
  cat.name = name; cat.isLiability = isLiab; cat.colorValue = COLORS[colorIdx];
  await updateCategory(cat);
  overlay.remove();
  openCategoryManage();
}

async function deleteCategory(id, name) {
  const overlay = showDialog(`
    <h3>确认删除</h3>
    <p>确定要删除"${name}"吗？<br>已有的记录数据不会丢失。</p>
    <div class="dialog-actions">
      <button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
      <button class="danger" onclick="doDeleteCategory(${id},this)">删除</button>
    </div>`);
}

async function doDeleteCategory(id, btn) {
  await softDeleteCategory(id);
  btn.closest('.dialog-overlay').remove();
  openCategoryManage();
}

// ═══════════════════════════════════════════
//  FEEDBACK PAGE
// ═══════════════════════════════════════════
let fbType = 0;
function openFeedback() {
  fbType = 0;
  const types = ['功能建议','问题反馈','界面优化','其他'];
  const icons = ['M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z',
    'M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5s-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8z',
    'M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5 0 .12.05.23.13.33.41.47.64 1.06.64 1.67 0 1.38-1.12 2.5-2.5 2.5z',
    'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z'];

  openModal(`
    <div class="modal-header">
      <button class="back-btn" onclick="closeModal()"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></button>
      <h2>提意见</h2>
    </div>
    <div class="content-pad" style="padding-top:20px">
      <div class="feedback-hero">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        <h2>你的声音很重要</h2>
        <p>告诉我们你的想法，帮助我们做得更好</p>
      </div>
      <div class="section-label">反馈类型</div>
      <div class="feedback-types" id="fb-types">
        ${types.map((t,i) => `<div class="fb-type ${i===0?'active':''}" onclick="document.querySelectorAll('.fb-type').forEach(d=>d.classList.remove('active'));this.classList.add('active');fbType=${i}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="${icons[i]}"/></svg><span>${t}</span></div>`).join('')}
      </div>
      <div class="section-label">详细描述</div>
      <textarea id="fb-content" placeholder="请详细描述你的建议或遇到的问题..." style="width:100%;padding:16px;border:1px solid var(--border-light);border-radius:var(--radius-lg);font-size:14px;min-height:120px;resize:vertical;outline:none;background:var(--surface);font-family:inherit"></textarea>
      <div class="section-label mt-16">联系方式（选填）</div>
      <div class="section-note">方便我们联系你了解更多详情</div>
      <input type="text" id="fb-contact" placeholder="手机号 / 微信号 / 邮箱" style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:var(--radius-lg);font-size:14px;background:var(--input-bg);outline:none">
      <button class="btn-primary mt-16" onclick="submitFeedback()">提交反馈</button>
    </div>`);
}

function submitFeedback() {
  const content = document.getElementById('fb-content').value.trim();
  if (!content) { showToast('请输入反馈内容', 'error'); return; }
  showToast('感谢你的反馈！我们会认真考虑', 'success');
  closeModal();
}

// ═══════════════════════════════════════════
//  IMPORT / EXPORT
// ═══════════════════════════════════════════
async function handleExport() {
  try {
    const csv = await exportToCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    a.href = url;
    a.download = `积账_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出', 'success');
  } catch (e) {
    showToast('导出失败: ' + e.message, 'error');
  }
}

function handleImport() {
  const overlay = showDialog(`
    <h3>导入数据</h3>
    <p style="font-size:14px;line-height:1.6;color:var(--text-secondary)">
      导入将合并数据到当前账本：<br>
      • 同名类别会自动复用<br>
      • 同日期同类别的数据会被覆盖<br>
      • 新增的类别和数据会被添加<br><br>
      请选择 .csv 格式的备份文件
    </p>
    <div class="dialog-actions">
      <button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
      <button class="confirm" onclick="doImport(this)">选择文件</button>
    </div>`);
}

function doImport(btn) {
  btn.closest('.dialog-overlay').remove();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await importFromCsv(text);
      showToast(`导入成功！新增 ${result.categoriesImported} 个类别，${result.snapshotsImported} 条记录`, 'success', 4000);
      renderPage(currentPage);
    } catch (e) {
      showToast('导入失败: ' + e.message, 'error');
    }
  };
  input.click();
}

// ═══════════════════════════════════════════
//  LOGIN PAGE — 登录 / 注册 / 找回密码
// ═══════════════════════════════════════════
let authMode = 'login'; // 'login' | 'register' | 'reset'

function showLoginPage() {
  authMode = 'login';
  document.getElementById('bottom-nav').style.display = 'none';
  document.getElementById('fab').classList.add('hidden');
  renderAuthPage();
}

function renderAuthPage() {
  const container = document.getElementById('page-container');

  const logo = `
    <div style="text-align:center;margin-bottom:36px">
      <div style="width:72px;height:72px;margin:0 auto 16px;background:rgba(212,168,83,0.15);border-radius:20px;display:flex;align-items:center;justify-content:center">
        <span style="font-size:36px;font-weight:700;color:#D4A853">积</span>
      </div>
      <h1 style="color:white;font-size:28px;font-weight:700;letter-spacing:-0.5px">积账</h1>
      <p style="color:rgba(255,255,255,0.5);font-size:14px;margin-top:6px">记录资产变化，积少成多</p>
    </div>`;

  let formHtml = '';

  if (authMode === 'login') {
    formHtml = `
      <h2 style="font-size:18px;font-weight:700;margin-bottom:20px">登录</h2>
      <input type="email" id="auth-email" placeholder="邮箱地址" style="width:100%;padding:14px 16px;border:1px solid var(--border-light);border-radius:14px;font-size:15px;outline:none;background:var(--input-bg);margin-bottom:12px">
      <input type="password" id="auth-password" placeholder="密码" style="width:100%;padding:14px 16px;border:1px solid var(--border-light);border-radius:14px;font-size:15px;outline:none;background:var(--input-bg)">
      <button class="btn-primary mt-16" id="auth-submit" onclick="handleLogin()">登录</button>
      <div style="display:flex;justify-content:space-between;margin-top:16px">
        <button style="color:var(--primary);font-size:13px;font-weight:500;background:none;border:none;cursor:pointer" onclick="authMode='register';renderAuthPage()">注册新账号</button>
        <button style="color:var(--text-tertiary);font-size:13px;background:none;border:none;cursor:pointer" onclick="authMode='reset';renderAuthPage()">忘记密码？</button>
      </div>`;
  } else if (authMode === 'register') {
    formHtml = `
      <h2 style="font-size:18px;font-weight:700;margin-bottom:20px">注册</h2>
      <input type="email" id="auth-email" placeholder="邮箱地址" style="width:100%;padding:14px 16px;border:1px solid var(--border-light);border-radius:14px;font-size:15px;outline:none;background:var(--input-bg);margin-bottom:12px">
      <div style="display:flex;gap:10px;margin-bottom:12px">
        <input type="text" id="auth-code" placeholder="验证码" maxlength="6" inputmode="numeric" style="flex:1;padding:14px 16px;border:1px solid var(--border-light);border-radius:14px;font-size:15px;outline:none;background:var(--input-bg)">
        <button id="send-code-btn" onclick="handleSendCode()" style="flex-shrink:0;padding:0 16px;background:var(--primary);color:white;border:none;border-radius:14px;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer">发送验证码</button>
      </div>
      <input type="password" id="auth-password" placeholder="设置密码（至少6位）" style="width:100%;padding:14px 16px;border:1px solid var(--border-light);border-radius:14px;font-size:15px;outline:none;background:var(--input-bg);margin-bottom:12px">
      <input type="password" id="auth-password2" placeholder="确认密码" style="width:100%;padding:14px 16px;border:1px solid var(--border-light);border-radius:14px;font-size:15px;outline:none;background:var(--input-bg)">
      <button class="btn-primary mt-16" id="auth-submit" onclick="handleRegister()">注册</button>
      <div style="text-align:center;margin-top:16px">
        <button style="color:var(--primary);font-size:13px;font-weight:500;background:none;border:none;cursor:pointer" onclick="authMode='login';renderAuthPage()">← 已有账号，去登录</button>
      </div>`;
  } else {
    formHtml = `
      <h2 style="font-size:18px;font-weight:700;margin-bottom:20px">找回密码</h2>
      <input type="email" id="auth-email" placeholder="注册时的邮箱" style="width:100%;padding:14px 16px;border:1px solid var(--border-light);border-radius:14px;font-size:15px;outline:none;background:var(--input-bg);margin-bottom:12px">
      <div style="display:flex;gap:10px;margin-bottom:12px">
        <input type="text" id="auth-code" placeholder="验证码" maxlength="6" inputmode="numeric" style="flex:1;padding:14px 16px;border:1px solid var(--border-light);border-radius:14px;font-size:15px;outline:none;background:var(--input-bg)">
        <button id="send-code-btn" onclick="handleSendCode()" style="flex-shrink:0;padding:0 16px;background:var(--primary);color:white;border:none;border-radius:14px;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer">发送验证码</button>
      </div>
      <input type="password" id="auth-password" placeholder="新密码（至少6位）" style="width:100%;padding:14px 16px;border:1px solid var(--border-light);border-radius:14px;font-size:15px;outline:none;background:var(--input-bg);margin-bottom:12px">
      <input type="password" id="auth-password2" placeholder="确认新密码" style="width:100%;padding:14px 16px;border:1px solid var(--border-light);border-radius:14px;font-size:15px;outline:none;background:var(--input-bg)">
      <button class="btn-primary mt-16" id="auth-submit" onclick="handleResetPassword()">重置密码</button>
      <div style="text-align:center;margin-top:16px">
        <button style="color:var(--primary);font-size:13px;font-weight:500;background:none;border:none;cursor:pointer" onclick="authMode='login';renderAuthPage()">← 返回登录</button>
      </div>`;
  }

  container.innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:32px 24px;background:linear-gradient(180deg,#0A1628 0%,#1B3A5C 40%,var(--bg) 100%)">
      ${logo}
      <div style="background:white;border-radius:24px;padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,0.15)">
        ${formHtml}
      </div>
    </div>`;
}

async function handleLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showToast('请填写邮箱和密码', 'error'); return; }

  const btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = '登录中...';
  try {
    await loginUser(email, password);
    showToast('登录成功！', 'success');
    initApp();
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false; btn.textContent = '登录';
  }
}

async function handleSendCode() {
  const email = document.getElementById('auth-email').value.trim();
  if (!email || !email.includes('@')) { showToast('请输入有效的邮箱地址', 'error'); return; }

  const btn = document.getElementById('send-code-btn');
  btn.disabled = true; btn.textContent = '发送中...';
  try {
    await sendCode(email);
    showToast('验证码已发送到邮箱', 'success');
    let sec = 60;
    btn.textContent = `${sec}s`;
    const timer = setInterval(() => {
      sec--; btn.textContent = `${sec}s`;
      if (sec <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = '重新发送'; }
    }, 1000);
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false; btn.textContent = '发送验证码';
  }
}

async function handleRegister() {
  const email = document.getElementById('auth-email').value.trim();
  const code = document.getElementById('auth-code').value.trim();
  const password = document.getElementById('auth-password').value;
  const password2 = document.getElementById('auth-password2').value;

  if (!email || !code || !password) { showToast('请填写完整信息', 'error'); return; }
  if (password.length < 6) { showToast('密码至少6位', 'error'); return; }
  if (password !== password2) { showToast('两次密码不一致', 'error'); return; }

  const btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = '注册中...';
  try {
    await registerUser(email, code, password);
    showToast('注册成功！', 'success');
    initApp();
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false; btn.textContent = '注册';
  }
}

async function handleResetPassword() {
  const email = document.getElementById('auth-email').value.trim();
  const code = document.getElementById('auth-code').value.trim();
  const password = document.getElementById('auth-password').value;
  const password2 = document.getElementById('auth-password2').value;

  if (!email || !code || !password) { showToast('请填写完整信息', 'error'); return; }
  if (password.length < 6) { showToast('密码至少6位', 'error'); return; }
  if (password !== password2) { showToast('两次密码不一致', 'error'); return; }

  const btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = '重置中...';
  try {
    await resetPassword(email, code, password);
    showToast('密码已重置，请登录', 'success');
    authMode = 'login';
    renderAuthPage();
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false; btn.textContent = '重置密码';
  }
}

// ═══════════════════════════════════════════
//  USER MENU (首页显示用户信息+退出)
// ═══════════════════════════════════════════
async function handleLogout() {
  showDialog(`
    <h3>确认退出</h3>
    <p style="color:var(--text-secondary);font-size:14px">退出后需要重新登录才能查看数据</p>
    <div class="dialog-actions">
      <button class="cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
      <button class="danger" onclick="doLogout(this)">退出登录</button>
    </div>`);
}

async function doLogout(btn) {
  btn.closest('.dialog-overlay').remove();
  await logout();
  showToast('已退出登录', 'info');
  showLoginPage();
}

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
function initApp() {
  document.getElementById('bottom-nav').style.display = '';
  navigateTo('home');
}

document.addEventListener('DOMContentLoaded', async () => {
  if (isLoggedIn()) {
    try {
      await getMe(); // 验证 token 是否有效
      initApp();
    } catch {
      showLoginPage();
    }
  } else {
    showLoginPage();
  }
});
