/* Переиспользуемый экран «Финансы» (колонки категорий, счета, движения).
   Один компонент для полной ERP и кабинета директора (read-only).
   Стили инъектируются (классы .fv-*). Данные: GET /api/v2/finance?from=&to=. */
(function () {
  'use strict';
  const SECTIONS = { poverka: '📋 Поверка', sale: '💰 Продажа', other: '📄 Прочие', branch: '🏢 Филиалы' };
  const BANK = { kaspi: 'Kaspi Bank', bck: 'БЦК', nalichka: 'касса', other: '' };
  const S = { root: null, accounts: [], ops: [], cat: 'all', readOnly: false, stack: false, api: '/api/v2/finance', hooks: {}, collapsed: {} };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₸';
  const today = () => new Date().toISOString().slice(0, 10);
  const secOf = id => { const a = S.accounts.find(x => x.id === id); return a ? (a.section || 'other') : 'other'; };
  const cats = () => S.cat === 'all' ? Object.keys(SECTIONS) : [S.cat];
  const movSign = o => o.opType === 'Приход' ? 1 : -1;

  const CSS = `
  .fv-view{--c-pov:#2563eb;--c-sale:#d97706;--c-other:#6f42c1;--c-branch:#0d9488;--c-navy:#1b2a4a;--fv-card:#fff;--fv-line:#e2e8f0;--fv-bg:#f8fafc;--fv-ink:#111827;--fv-muted:#6b7280;color:var(--fv-ink);}
  .fv-filters{display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:var(--fv-card);border:1px solid var(--fv-line);border-radius:10px;padding:12px 14px;margin-bottom:14px;}
  .fv-chip{border:1.5px solid var(--fv-line);background:#fff;border-radius:20px;padding:6px 14px;font-size:13px;cursor:pointer;font-weight:600;color:var(--fv-muted);font-family:inherit;}
  .fv-chip.on{color:#fff;}
  .fv-chip[data-c="all"].on{background:var(--c-navy);border-color:var(--c-navy);}
  .fv-chip[data-c="poverka"].on{background:var(--c-pov);border-color:var(--c-pov);}
  .fv-chip[data-c="sale"].on{background:var(--c-sale);border-color:var(--c-sale);}
  .fv-chip[data-c="other"].on{background:var(--c-other);border-color:var(--c-other);}
  .fv-chip[data-c="branch"].on{background:var(--c-branch);border-color:var(--c-branch);}
  .fv-sep{width:1px;height:26px;background:var(--fv-line);margin:0 4px;}
  .fv-filters label{font-size:12.5px;color:var(--fv-muted);}
  .fv-filters input[type=date]{border:1px solid var(--fv-line);border-radius:6px;padding:6px 8px;font-size:13px;background:#fff;color:var(--fv-ink);font-family:inherit;}
  .fv-btn{border:none;border-radius:7px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;}
  .fv-btn-primary{background:#2563eb;color:#fff;}
  .fv-btn-light{background:#fff;border:1px solid var(--fv-line);color:var(--fv-ink);}
  .fv-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px;}
  .fv-scard{background:var(--fv-card);border:1px solid var(--fv-line);border-top:3px solid var(--c-navy);border-radius:10px;padding:13px 16px;}
  .fv-scard.in{border-top-color:#16a34a;}.fv-scard.out{border-top-color:#dc2626;}
  .fv-scard .lbl{font-size:12px;color:var(--fv-muted);margin-bottom:4px;}
  .fv-scard .val{font-size:22px;font-weight:800;}
  .fv-scard.in .val{color:#16a34a;}.fv-scard.out .val{color:#dc2626;}
  .fv-cols{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start;}
  .fv-cols.single{grid-template-columns:1fr;}
  .fv-cols.stack{grid-template-columns:1fr;}
  .fv-col{background:var(--fv-card);border:1px solid var(--fv-line);border-radius:12px;overflow:hidden;}
  .fv-col-head{padding:12px 14px;color:#fff;display:flex;justify-content:space-between;align-items:baseline;gap:8px;}
  .fv-col-head .name{font-weight:700;font-size:14px;}
  .fv-col-head .total{font-weight:800;font-size:16px;white-space:nowrap;}
  .fv-col[data-c="poverka"] .fv-col-head{background:var(--c-pov);}
  .fv-col[data-c="sale"] .fv-col-head{background:var(--c-sale);}
  .fv-col[data-c="other"] .fv-col-head{background:var(--c-other);}
  .fv-col[data-c="branch"] .fv-col-head{background:var(--c-branch);}
  .fv-col.acc .fv-col-head{cursor:pointer;}
  .fv-col.acc .fv-col-head .name::before{content:'▾ ';font-size:11px;}
  .fv-col.acc.collapsed .fv-col-head .name::before{content:'▸ ';}
  .fv-col.acc.collapsed .fv-accs,.fv-col.acc.collapsed .fv-movs{display:none;}
  .fv-accs{padding:10px 12px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--fv-line);}
  .fv-acc{border:1px solid var(--fv-line);border-radius:9px;padding:9px 12px;display:flex;justify-content:space-between;align-items:center;background:var(--fv-bg);}
  .fv-acc .an{font-weight:600;font-size:13px;}
  .fv-acc .ab{font-size:11.5px;color:var(--fv-muted);}
  .fv-acc .av{font-weight:800;font-size:14px;white-space:nowrap;}
  .fv-movs{padding:8px 12px 12px;}
  .fv-movs .mh{font-size:11px;letter-spacing:.4px;color:var(--fv-muted);text-transform:uppercase;padding:6px 2px;}
  .fv-mov{display:flex;justify-content:space-between;gap:8px;padding:7px 2px;border-bottom:1px solid var(--fv-line);font-size:12.5px;}
  .fv-mov:last-child{border-bottom:none;}
  .fv-mov .md{color:var(--fv-muted);white-space:nowrap;}
  .fv-mov .mt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .fv-mov .ma{font-weight:700;white-space:nowrap;}
  .fv-mov .ma.plus{color:#146c43;}.fv-mov .ma.minus{color:#b02a37;}
  .fv-empty{color:var(--fv-muted);text-align:center;padding:14px;font-size:12.5px;}
  @media(max-width:1200px){.fv-cols:not(.stack):not(.single){grid-template-columns:repeat(2,1fr);}}
  @media(max-width:820px){.fv-cols{grid-template-columns:1fr;}.fv-summary{grid-template-columns:1fr;}.fv-filters{gap:8px;}}
  `;
  function injectStyles() { if (document.getElementById('fv-styles')) return; const s = document.createElement('style'); s.id = 'fv-styles'; s.textContent = CSS; document.head.appendChild(s); }

  function buildHTML() {
    const addBtns = S.readOnly ? '' :
      `<button class="fv-btn fv-btn-primary" onclick="FinanceView._add('op')">＋ Операция</button>
       <button class="fv-btn fv-btn-light" onclick="FinanceView._add('acct')">+ Счёт</button>`;
    return `
    <div class="fv-filters">
      <button class="fv-chip on" data-c="all"     onclick="FinanceView.setCat('all')">Все</button>
      <button class="fv-chip"    data-c="poverka" onclick="FinanceView.setCat('poverka')">📋 Поверка</button>
      <button class="fv-chip"    data-c="sale"    onclick="FinanceView.setCat('sale')">💰 Продажа</button>
      <button class="fv-chip"    data-c="other"   onclick="FinanceView.setCat('other')">📄 Прочие</button>
      <button class="fv-chip"    data-c="branch"  onclick="FinanceView.setCat('branch')">🏢 Филиалы</button>
      <span class="fv-sep"></span>
      <label>с</label><input type="date" id="fv-d1" onchange="FinanceView.load()">
      <label>по</label><input type="date" id="fv-d2" onchange="FinanceView.load()">
      <span style="flex:1;"></span>
      ${addBtns}
      <button class="fv-btn fv-btn-light" onclick="FinanceView.doExport()">⬇ Экспорт</button>
    </div>
    <div class="fv-summary">
      <div class="fv-scard"><div class="lbl">💼 Касса — по фильтру</div><div class="val" id="fv-total">0 ₸</div></div>
      <div class="fv-scard in"><div class="lbl">↓ Приходы за период</div><div class="val" id="fv-inc">0 ₸</div></div>
      <div class="fv-scard out"><div class="lbl">↑ Расходы за период</div><div class="val" id="fv-exp">0 ₸</div></div>
    </div>
    <div class="fv-cols${S.stack ? ' stack' : ''}" id="fv-cols"></div>`;
  }

  function mount(root, opts) {
    opts = opts || {};
    S.root = typeof root === 'string' ? document.getElementById(root) : root;
    if (!S.root) return;
    S.readOnly = !!opts.readOnly; S.stack = !!opts.stack; S.api = opts.api || '/api/v2/finance'; S.hooks = opts;
    injectStyles();
    S.root.classList.add('fv-view');
    S.root.innerHTML = buildHTML();
    const d1 = S.root.querySelector('#fv-d1'), d2 = S.root.querySelector('#fv-d2');
    const d = new Date(); d.setDate(d.getDate() - 60);
    d1.value = d.toISOString().slice(0, 10); d2.value = today();
    load();
  }

  async function load() {
    const r = S.root; if (!r) return;
    const from = (r.querySelector('#fv-d1') || {}).value || '', to = (r.querySelector('#fv-d2') || {}).value || '';
    try {
      const res = await fetch(`${S.api}?from=${from}&to=${to}`, { cache: 'no-store' });
      if (res.status === 401) { location.href = '/login'; return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      S.accounts = Array.isArray(j.accounts) ? j.accounts : [];
      S.ops = Array.isArray(j.operations) ? j.operations : [];
    } catch (e) { if (S.hooks.onError) S.hooks.onError(e); }
    render();
    if (S.hooks.onLoaded) S.hooks.onLoaded(cashTotal());
  }

  function setCat(c) {
    S.cat = c;
    S.root.querySelectorAll('.fv-chip').forEach(b => b.classList.toggle('on', b.dataset.c === c));
    render();
  }

  function movRow(o) {
    const d = (o.opDate || '').slice(0, 10), dd = d.slice(8, 10) + '.' + d.slice(5, 7);
    const plus = movSign(o) > 0, acc = o.accountName || (S.accounts.find(a => a.id === o.accountId) || {}).name || '';
    return `<div class="fv-mov"><span class="md">${dd}</span>
      <span class="mt">${esc(o.name)} · <b>${esc(acc)}</b></span>
      <span class="ma ${plus ? 'plus' : 'minus'}">${plus ? '+' : '−'}${fmt(Math.abs(Number(o.amount) || 0))}</span></div>`;
  }
  function render() {
    const r = S.root; if (!r) return;
    const cs = cats();
    const cols = r.querySelector('#fv-cols');
    cols.className = 'fv-cols' + (S.stack ? ' stack' : (S.cat !== 'all' ? ' single' : ''));
    cols.innerHTML = cs.map(c => {
      const accs = S.accounts.filter(a => (a.section || 'other') === c);
      const total = accs.reduce((s, a) => s + (Number(a.balance) || 0), 0);
      const movs = S.ops.filter(o => secOf(o.accountId) === c).sort((a, b) => String(b.opDate).localeCompare(String(a.opDate)));
      const acc = S.stack ? ' acc' + (S.collapsed[c] ? ' collapsed' : '') : '';
      const headClick = S.stack ? ` onclick="FinanceView._toggle('${c}')"` : '';
      return `<div class="fv-col${acc}" data-c="${c}">
        <div class="fv-col-head"${headClick}><span class="name">${SECTIONS[c]}</span><span class="total">${fmt(total)}</span></div>
        <div class="fv-accs">${accs.length ? accs.map(a => `
          <div class="fv-acc"><div><div class="an">${esc(a.icon || '')} ${esc(a.name)}</div><div class="ab">${BANK[a.category] || ''}</div></div>
          <div class="av">${fmt(a.balance)}</div></div>`).join('') : '<div class="fv-empty">Нет счетов</div>'}</div>
        <div class="fv-movs"><div class="mh">Движения за период · ${movs.length}</div>
          ${movs.length ? movs.map(movRow).join('') : '<div class="fv-empty">Нет движений за период</div>'}</div>
      </div>`;
    }).join('');
    const visMovs = S.ops.filter(o => cs.includes(secOf(o.accountId)));
    const visAccs = S.accounts.filter(a => cs.includes(a.section || 'other'));
    const set = (id, v) => { const e = r.querySelector('#' + id); if (e) e.textContent = v; };
    set('fv-total', fmt(visAccs.reduce((s, a) => s + (Number(a.balance) || 0), 0)));
    set('fv-inc', fmt(visMovs.filter(o => o.opType === 'Приход').reduce((s, o) => s + (Number(o.amount) || 0), 0)));
    set('fv-exp', fmt(visMovs.filter(o => o.opType !== 'Приход').reduce((s, o) => s + (Number(o.amount) || 0), 0)));
  }

  function doExport() {
    const cs = cats();
    const movs = S.ops.filter(o => cs.includes(secOf(o.accountId))).sort((a, b) => String(b.opDate).localeCompare(String(a.opDate)));
    const secN = { poverka: 'Поверка', sale: 'Продажа', other: 'Прочие', branch: 'Филиалы' };
    const csvEsc = v => { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [['Дата', 'Категория', 'Счёт', 'Операция', 'Тип', 'Сумма'].join(';')];
    movs.forEach(o => lines.push([o.opDate, secN[secOf(o.accountId)] || '', (o.accountName || ''), o.name, o.opType, movSign(o) * (Number(o.amount) || 0)].map(csvEsc).join(';')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    const r = S.root;
    a.download = `Финансы_${(r.querySelector('#fv-d1') || {}).value || ''}_${(r.querySelector('#fv-d2') || {}).value || ''}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  const cashTotal = () => S.accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);

  window.FinanceView = {
    mount, load, setCat, render, doExport,
    _add: (w) => { if (w === 'op' && S.hooks.onAddOp) S.hooks.onAddOp(); if (w === 'acct' && S.hooks.onAddAcct) S.hooks.onAddAcct(); },
    _toggle: (c) => { S.collapsed[c] = !S.collapsed[c]; render(); },
    get accounts() { return S.accounts; },
    cashTotal,
  };
})();
