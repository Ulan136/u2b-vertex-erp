/* Общий модуль мобильных кабинетов (/master, /director):
   — экран «Задачи» (Мои / Поставленные мной, статусы, срок, комментарии, создание),
   — колокольчик уведомлений с поллингом,
   — единый механизм комментариев (задачи и заявки).
   Стили и разметка инъектируются скриптом → одинаковый вид в обоих кабинетах. */
(function () {
  'use strict';
  const API = { me:'/api/v2/me', users:'/api/v2/users', tasks:'/api/v2/tasks', comments:'/api/v2/comments', notif:'/api/v2/notifications' };
  const S = { me:null, users:[], userById:{}, tasks:[], tab:'mine', tasksAllowed:true, notif:{unread:0, items:[]}, onOpenTasks:null };
  const ROLE = { admin:'Администратор', director:'Директор', accountant:'Бухгалтер', manager:'Менеджер', master:'Мастер' };
  const ST = {
    new:        { l:'Новая',   c:'#4b5563', bg:'#f3f4f6' },
    accepted:   { l:'Принята', c:'#1d4ed8', bg:'#dbeafe' },
    in_progress:{ l:'В работе', c:'#b45309', bg:'#fef3c7' },
    done:       { l:'Готова',  c:'#065f46', bg:'#d1fae5' },
  };
  const NEXT = { new:{to:'accepted',label:'✋ Принять'}, accepted:{to:'in_progress',label:'▶ В работу'}, in_progress:{to:'done',label:'✅ Готова'} };

  const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const todayStr = () => { const n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); };
  const fmtDate = v => v ? String(v).slice(0,10).split('-').reverse().join('.') : '—';
  const userName = id => (S.userById[id] && S.userById[id].name) || '—';

  function ccToast(m){
    let t=document.getElementById('cc-toast');
    if(!t){ t=document.createElement('div'); t.id='cc-toast'; t.className='cc-toast'; document.body.appendChild(t); }
    t.textContent=m; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2500);
  }
  async function jfetch(url, opts){
    const r = await fetch(url, Object.assign({cache:'no-store'}, opts||{}));
    if(r.status===401){ location.href='/login'; throw new Error('auth'); }
    return r;
  }

  // ── styles ──────────────────────────────────────────────────
  const CSS = `
  .cc-toast{position:fixed;left:50%;bottom:calc(78px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:#111827;color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;font-weight:500;z-index:2000;display:none;max-width:90%;text-align:center;}
  .cc-toast.show{display:block;}
  .cc-seg{display:flex;gap:8px;padding:10px 14px 4px;}
  .cc-seg button{flex:1;padding:9px;border-radius:10px;border:1.5px solid #e5e7eb;background:#fff;font-size:13px;font-weight:700;color:#6b7280;cursor:pointer;font-family:inherit;}
  .cc-seg button.on{background:#eff6ff;border-color:#1a56db;color:#1a56db;}
  .cc-list{padding:6px 14px 12px;}
  .cc-task{background:#fff;border:1.5px solid #e5e7eb;border-radius:14px;padding:12px 13px;margin-bottom:9px;box-shadow:0 1px 3px rgba(0,0,0,.05);}
  .cc-task.overdue{border-color:#fca5a5;background:#fff6f6;}
  .cc-task-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:5px;}
  .cc-task-title{font-size:14px;font-weight:700;color:#111827;line-height:1.3;}
  .cc-badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap;flex-shrink:0;}
  .cc-row{font-size:12px;color:#6b7280;margin-top:3px;display:flex;align-items:center;gap:5px;}
  .cc-row.due-over{color:#dc2626;font-weight:700;}
  .cc-actions{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;}
  .cc-btn{flex:1 1 46%;border:none;border-radius:9px;padding:9px;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;}
  .cc-btn:active{transform:scale(.97);}
  .cc-b-primary{background:#1a56db;color:#fff;}
  .cc-b-soft{background:#eef2ff;color:#4338ca;}
  .cc-b-del{background:#fef2f2;color:#dc2626;}
  .cc-empty{text-align:center;color:#9ca3af;padding:26px 16px;font-size:14px;}
  .cc-fab{position:absolute;right:16px;bottom:calc(76px + env(safe-area-inset-bottom,0px));width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;border:none;font-size:26px;box-shadow:0 6px 20px rgba(26,86,219,.4);cursor:pointer;z-index:40;display:flex;align-items:center;justify-content:center;}
  /* модалки/шиты */
  .cc-ov{display:none;position:fixed;inset:0;z-index:1500;background:rgba(0,0,0,.5);align-items:flex-end;justify-content:center;}
  .cc-ov.open{display:flex;}
  .cc-sheet{width:100%;max-width:520px;background:#fff;border-radius:20px 20px 0 0;max-height:86vh;display:flex;flex-direction:column;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));}
  .cc-sheet-h{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e5e7eb;}
  .cc-sheet-h .t{font-size:15px;font-weight:800;}
  .cc-x{background:#f3f4f6;border:none;color:#6b7280;font-size:13px;font-weight:700;padding:6px 12px;border-radius:20px;cursor:pointer;}
  .cc-sheet-b{overflow-y:auto;padding:14px 16px;flex:1;}
  .cc-fld{margin-bottom:12px;}
  .cc-fld label{display:block;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;}
  .cc-inp{width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:11px 12px;font-size:14px;color:#111827;outline:none;font-family:inherit;background:#fff;}
  .cc-inp:focus{border-color:#1a56db;}
  textarea.cc-inp{min-height:64px;resize:vertical;}
  .cc-save{width:100%;background:#1a56db;color:#fff;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;}
  .cc-cmt{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:9px 11px;margin-bottom:8px;}
  .cc-cmt-h{display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-bottom:3px;}
  .cc-cmt-t{font-size:13px;color:#111827;white-space:pre-wrap;word-break:break-word;}
  .cc-foot{display:flex;gap:8px;padding:10px 16px;border-top:1px solid #e5e7eb;}
  .cc-foot input{flex:1;border:1.5px solid #e5e7eb;border-radius:10px;padding:11px 12px;font-size:14px;outline:none;font-family:inherit;}
  .cc-foot button{border:none;background:#1a56db;color:#fff;border-radius:10px;padding:0 16px;font-weight:700;cursor:pointer;}
  /* колокольчик */
  .cc-bell{position:relative;background:none;border:none;font-size:20px;cursor:pointer;padding:4px;line-height:1;}
  .cc-bell .dot{position:absolute;top:-3px;right:-3px;background:#dc2626;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;line-height:16px;border-radius:9px;text-align:center;padding:0 3px;}
  .cc-npanel{display:none;position:fixed;top:calc(48px + env(safe-area-inset-top,0px));right:8px;width:min(340px,92vw);max-height:70vh;overflow-y:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.2);z-index:1600;}
  .cc-npanel.open{display:block;}
  .cc-nitem{padding:11px 13px;border-bottom:1px solid #f3f4f6;cursor:pointer;}
  .cc-nitem.unread{background:#eff6ff;}
  .cc-nitem .nt{font-size:13px;font-weight:600;color:#111827;}
  .cc-nitem .nd{font-size:10px;color:#9ca3af;margin-top:2px;}
  .cc-nhead{display:flex;justify-content:space-between;align-items:center;padding:10px 13px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:800;}
  .cc-nhead button{background:none;border:none;color:#1a56db;font-size:12px;font-weight:700;cursor:pointer;}
  .cc-nav-badge{position:absolute;top:-6px;right:-10px;background:#dc2626;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;line-height:16px;border-radius:8px;text-align:center;padding:0 3px;}
  .cc-bell-mount{display:inline-flex;align-items:center;gap:2px;}
  .cc-ref{background:none;border:none;font-size:17px;cursor:pointer;padding:4px;line-height:1;}
  .cc-ref.spin{animation:cc-spin .8s linear infinite;}
  @keyframes cc-spin{to{transform:rotate(360deg);}}
  /* pull-to-refresh */
  .cc-pull{position:fixed;top:0;left:0;right:0;height:0;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;z-index:1250;pointer-events:none;transition:height .12s ease;}
  .cc-pull-inner{width:34px;height:34px;margin-bottom:8px;border-radius:50%;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;font-size:17px;transition:background .15s;}
  .cc-pull.ready .cc-pull-inner{background:#1a56db;color:#fff;}
  .cc-pull.busy .cc-pull-inner{animation:cc-spin .8s linear infinite;}
  `;
  function injectStyles(){ if(document.getElementById('cc-styles'))return; const s=document.createElement('style'); s.id='cc-styles'; s.textContent=CSS; document.head.appendChild(s); }

  // ── modals markup ───────────────────────────────────────────
  function injectModals(){
    if(document.getElementById('cc-task-modal'))return;
    const wrap=document.createElement('div');
    wrap.innerHTML = `
    <div class="cc-ov" id="cc-task-modal" onclick="if(event.target===this)CabinetCommon._closeTask()">
      <div class="cc-sheet">
        <div class="cc-sheet-h"><span class="t">➕ Новая задача</span><button class="cc-x" onclick="CabinetCommon._closeTask()">Отмена</button></div>
        <div class="cc-sheet-b">
          <div class="cc-fld"><label>Название *</label><input class="cc-inp" id="cc-t-title" placeholder="Что нужно сделать"></div>
          <div class="cc-fld"><label>Описание</label><textarea class="cc-inp" id="cc-t-desc" placeholder="Подробности…"></textarea></div>
          <div class="cc-fld"><label>Срок</label><input class="cc-inp" id="cc-t-due" type="date"></div>
          <div class="cc-fld"><label>Исполнитель *</label><select class="cc-inp" id="cc-t-assignee"></select></div>
          <button class="cc-save" onclick="CabinetCommon._saveTask()">💾 Создать задачу</button>
        </div>
      </div>
    </div>
    <div class="cc-ov" id="cc-cmt-modal" onclick="if(event.target===this)CabinetCommon._closeComments()">
      <div class="cc-sheet">
        <div class="cc-sheet-h"><span class="t" id="cc-cmt-title">💬 Комментарии</span><button class="cc-x" onclick="CabinetCommon._closeComments()">Готово</button></div>
        <div class="cc-sheet-b" id="cc-cmt-body"></div>
        <div class="cc-foot"><input id="cc-cmt-input" placeholder="Написать комментарий…" onkeydown="if(event.key==='Enter')CabinetCommon._sendComment()"><button onclick="CabinetCommon._sendComment()">➤</button></div>
      </div>
    </div>`;
    document.body.appendChild(wrap);
  }

  // ── data ────────────────────────────────────────────────────
  async function loadUsers(){
    try{ const r=await jfetch(API.users); S.users=r.ok?await r.json():[]; }catch(e){ S.users=[]; }
    S.userById={}; S.users.forEach(u=>S.userById[u.id]=u);
  }
  async function loadTasks(){
    try{
      const r=await fetch(API.tasks,{cache:'no-store'});
      if(r.status===403){ S.tasksAllowed=false; S.tasks=[]; return; }
      if(r.status===401){ location.href='/login'; return; }
      S.tasksAllowed=true; S.tasks = r.ok ? await r.json() : [];
    }catch(e){ S.tasks=[]; }
  }

  const myTasks = () => S.tasks.filter(t=>t.assigneeId===S.me.id);
  const byMe    = () => S.tasks.filter(t=>t.createdBy===S.me.id);
  const isOverdue = t => t.dueDate && t.status!=='done' && String(t.dueDate).slice(0,10) < todayStr();
  const myActiveCount = () => myTasks().filter(t=>t.status!=='done').length;

  // ── tasks render ────────────────────────────────────────────
  function taskCard(t, mine){
    const st = ST[t.status]||ST.new;
    const over = isOverdue(t);
    const who = mine ? ('от ' + esc(userName(t.createdBy))) : ('→ ' + esc(t.assigneeName||userName(t.assigneeId)));
    const nx = mine ? NEXT[t.status] : null;
    const acts = [];
    if(nx) acts.push(`<button class="cc-btn cc-b-primary" onclick="CabinetCommon._setStatus('${t.id}','${nx.to}')">${nx.label}</button>`);
    acts.push(`<button class="cc-btn cc-b-soft" onclick="CabinetCommon.openComments('task','${t.id}','Задача')">💬 Коммент.${t._cc?(' ('+t._cc+')'):''}</button>`);
    if(!mine && t.createdBy===S.me.id) acts.push(`<button class="cc-btn cc-b-del" onclick="CabinetCommon._delTask('${t.id}')">🗑 Удалить</button>`);
    return `<div class="cc-task${over?' overdue':''}">
      <div class="cc-task-top"><div class="cc-task-title">${esc(t.title)}</div><span class="cc-badge" style="background:${st.bg};color:${st.c};">${st.l}</span></div>
      <div class="cc-row">${who}</div>
      ${t.description?`<div class="cc-row">📝 ${esc(t.description)}</div>`:''}
      <div class="cc-row ${over?'due-over':''}">📅 ${fmtDate(t.dueDate)}${over?' · просрочено':''}</div>
      <div class="cc-actions">${acts.join('')}</div>
    </div>`;
  }
  function renderTasks(){
    const el=document.getElementById('cc-tasks'); if(!el)return;
    if(!S.tasksAllowed){ el.innerHTML=`<div class="cc-empty">🔒 Нет доступа к задачам</div>`; return; }
    const list = S.tab==='mine' ? myTasks() : byMe();
    const mine = S.tab==='mine';
    el.innerHTML = `
      <div class="cc-seg">
        <button class="${mine?'on':''}" onclick="CabinetCommon._tab('mine')">Мои (${myTasks().length})</button>
        <button class="${!mine?'on':''}" onclick="CabinetCommon._tab('by')">Поставленные мной (${byMe().length})</button>
      </div>
      <div class="cc-list">${list.length ? list.map(t=>taskCard(t,mine)).join('') : `<div class="cc-empty">${mine?'Задач для вас нет':'Вы пока не ставили задач'}</div>`}</div>
      <button class="cc-fab" onclick="CabinetCommon._openTask()" title="Новая задача">＋</button>`;
    loadCounts();
  }
  async function loadCounts(){
    try{ const r=await fetch(API.comments+'/counts?entityType=task',{cache:'no-store'}); if(!r.ok)return;
      const m={}; (await r.json()).forEach(c=>m[c.entityId]=c.count);
      S.tasks.forEach(t=>t._cc=m[t.id]||0);
      const el=document.getElementById('cc-tasks'); if(el && S.tab!=null){ /* re-render badges lazily */ }
    }catch(e){}
  }

  // ── create task ─────────────────────────────────────────────
  function openTask(){
    const sel=document.getElementById('cc-t-assignee');
    sel.innerHTML = `<option value="">— выберите —</option>` + S.users.map(u=>`<option value="${u.id}">${esc(u.name)}${u.role?' · '+(ROLE[u.role]||u.role):''}</option>`).join('');
    document.getElementById('cc-t-title').value='';
    document.getElementById('cc-t-desc').value='';
    document.getElementById('cc-t-due').value='';
    document.getElementById('cc-task-modal').classList.add('open');
  }
  function closeTask(){ document.getElementById('cc-task-modal').classList.remove('open'); }
  async function saveTask(){
    const title=document.getElementById('cc-t-title').value.trim();
    const assigneeId=document.getElementById('cc-t-assignee').value;
    if(!title){ ccToast('⚠️ Введите название'); return; }
    if(!assigneeId){ ccToast('⚠️ Выберите исполнителя'); return; }
    const body={ title, description:document.getElementById('cc-t-desc').value.trim()||null, dueDate:document.getElementById('cc-t-due').value||null, assigneeId };
    try{
      const r=await fetch(API.tasks,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(r.status===403){ ccToast('🔒 Нет доступа'); return; }
      if(!r.ok) throw new Error('HTTP '+r.status);
      closeTask(); await loadTasks(); renderTasks(); updateBadges(); ccToast('✅ Задача создана');
    }catch(e){ ccToast('⚠️ '+e.message); }
  }
  async function setStatus(id,to){
    try{
      const r=await fetch(API.tasks+'/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:to})});
      if(!r.ok) throw new Error('HTTP '+r.status);
      await loadTasks(); renderTasks(); updateBadges();
      ccToast(to==='done'?'✅ Готова':to==='accepted'?'✋ Принята':'▶ В работе');
    }catch(e){ ccToast('⚠️ '+e.message); }
  }
  async function delTask(id){
    if(!confirm('Удалить задачу?'))return;
    try{ const r=await fetch(API.tasks+'/'+id,{method:'DELETE'}); if(!r.ok)throw new Error('HTTP '+r.status);
      await loadTasks(); renderTasks(); updateBadges(); ccToast('🗑 Удалено');
    }catch(e){ ccToast('⚠️ '+e.message); }
  }

  // ── comments (generic: task / order) ────────────────────────
  let cmtCtx={type:null,id:null};
  function openComments(type,id,title){
    cmtCtx={type,id};
    document.getElementById('cc-cmt-title').textContent='💬 '+(title||'Комментарии');
    document.getElementById('cc-cmt-body').innerHTML='<div class="cc-empty">Загрузка…</div>';
    document.getElementById('cc-cmt-modal').classList.add('open');
    loadComments();
  }
  function closeComments(){ document.getElementById('cc-cmt-modal').classList.remove('open'); }
  async function loadComments(){
    try{
      const r=await fetch(`${API.comments}?entityType=${cmtCtx.type}&entityId=${cmtCtx.id}`,{cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const items=await r.json();
      const b=document.getElementById('cc-cmt-body');
      b.innerHTML = items.length ? items.map(c=>`<div class="cc-cmt"><div class="cc-cmt-h"><span>${esc(c.authorName||'—')}</span><span>${new Date(c.createdAt).toLocaleString('ru-KZ',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span></div><div class="cc-cmt-t">${esc(c.text)}</div></div>`).join('') : '<div class="cc-empty">Комментариев пока нет</div>';
      b.scrollTop=b.scrollHeight;
    }catch(e){ document.getElementById('cc-cmt-body').innerHTML='<div class="cc-empty">⚠️ '+esc(e.message)+'</div>'; }
  }
  async function sendComment(){
    const inp=document.getElementById('cc-cmt-input'); const text=inp.value.trim(); if(!text)return; inp.value='';
    try{
      const r=await fetch(API.comments,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entityType:cmtCtx.type,entityId:cmtCtx.id,text})});
      if(!r.ok) throw new Error('HTTP '+r.status);
      await loadComments();
      if(cmtCtx.type==='task'){ const t=S.tasks.find(x=>x.id===cmtCtx.id); if(t) t._cc=(t._cc||0)+1; renderTasks(); }
    }catch(e){ ccToast('⚠️ '+e.message); inp.value=text; }
  }

  // ── bell / notifications ────────────────────────────────────
  function renderBell(){
    const hosts=document.querySelectorAll('.cc-bell-mount'); if(!hosts.length)return;
    hosts.forEach(h=>{ h.innerHTML = `<button class="cc-ref" onclick="CabinetCommon.refresh()" title="Обновить">🔄</button><button class="cc-bell" onclick="CabinetCommon._toggleBell(event)">🔔<span class="dot cc-bell-dot" style="display:none;">0</span></button>`; });
    if(!document.getElementById('cc-npanel')){
      const p=document.createElement('div'); p.className='cc-npanel'; p.id='cc-npanel'; document.body.appendChild(p);
      document.addEventListener('click',(e)=>{ const pn=document.getElementById('cc-npanel'); if(pn && pn.classList.contains('open') && !pn.contains(e.target) && !e.target.closest('.cc-bell-mount')) pn.classList.remove('open'); });
    }
  }
  function renderNotif(){
    document.querySelectorAll('.cc-bell-dot').forEach(dot=>{ dot.style.display=S.notif.unread>0?'':'none'; dot.textContent=S.notif.unread>99?'99+':S.notif.unread; });
    const p=document.getElementById('cc-npanel'); if(!p)return;
    const items=S.notif.items||[];
    p.innerHTML = `<div class="cc-nhead"><span>Уведомления</span>${S.notif.unread?'<button onclick="CabinetCommon._readAll()">Прочитать все</button>':''}</div>`+
      (items.length ? items.map(n=>`<div class="cc-nitem${n.isRead?'':' unread'}" onclick="CabinetCommon._openNotif('${n.id}','${esc(n.link||'')}')"><div class="nt">${esc(n.title)}</div><div class="nd">${new Date(n.createdAt).toLocaleString('ru-KZ',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div></div>`).join('') : '<div class="cc-empty">Нет уведомлений</div>');
  }
  async function pollNotif(){
    try{ const r=await fetch(API.notif,{cache:'no-store'}); if(!r.ok)return; S.notif=await r.json(); renderNotif(); }catch(e){}
  }
  function toggleBell(e){ if(e)e.stopPropagation(); const p=document.getElementById('cc-npanel'); if(p){ p.classList.toggle('open'); if(p.classList.contains('open')) renderNotif(); } }
  async function openNotif(id, link){
    try{ await fetch(`${API.notif}/${id}/read`,{method:'PATCH'}); }catch(e){}
    const p=document.getElementById('cc-npanel'); if(p)p.classList.remove('open');
    await pollNotif();
    // задачные уведомления → открыть экран задач
    if(/task|задач/i.test(link||'') || link==='tasks'){ if(S.onOpenTasks) S.onOpenTasks(); }
    else if(S.onOpenTasks && (link==='' || link==null)) { /* ничего */ }
  }
  async function readAll(){ try{ await fetch(API.notif+'/read-all',{method:'POST'}); }catch(e){} await pollNotif(); }

  // ── badges ──────────────────────────────────────────────────
  function updateBadges(){
    const b=document.getElementById('cc-tasks-badge'); if(b){ const n=myActiveCount(); b.style.display=n?'':'none'; b.textContent=n; }
  }

  // ── refresh (кнопка 🔄 + pull-to-refresh) ────────────────────
  let refreshing=false;
  function setRefreshing(on){
    refreshing=on;
    document.querySelectorAll('.cc-ref').forEach(b=>b.classList.toggle('spin',on));
    const p=document.getElementById('cc-pull'); if(p) p.classList.toggle('busy',on);
  }
  async function refresh(){
    if(refreshing) return; setRefreshing(true);
    try{
      const own = S.onRefresh ? Promise.resolve().then(S.onRefresh) : Promise.resolve();
      await Promise.all([
        loadTasks().then(()=>{ updateBadges(); if(isTasksVisible()) renderTasks(); }),
        own, pollNotif(),
      ]);
      ccToast('🔄 Обновлено');
    }catch(e){}
    setRefreshing(false);
  }
  function scrollableAncestor(el){
    for(let n=el; n && n!==document.body; n=n.parentElement){
      const st=getComputedStyle(n);
      if(/(auto|scroll)/.test(st.overflowY) && n.scrollHeight>n.clientHeight+2) return n;
    }
    return null;
  }
  function setupPull(){
    if(document.getElementById('cc-pull')) return;
    const p=document.createElement('div'); p.id='cc-pull'; p.className='cc-pull';
    p.innerHTML=`<div class="cc-pull-inner">↓</div>`; document.body.appendChild(p);
    let startY=0, pulling=false, ready=false, sc=null;
    const TH=100;
    document.addEventListener('touchstart', e=>{
      if(refreshing || e.touches.length!==1){ pulling=false; return; }
      sc = scrollableAncestor(e.target);
      startY = e.touches[0].clientY;
      pulling = !sc || sc.scrollTop<=0;   // тянем только когда список уже сверху
    }, {passive:true});
    document.addEventListener('touchmove', e=>{
      if(!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if(dy<=0){ p.style.height='0'; return; }
      if(sc && sc.scrollTop>0){ pulling=false; p.style.height='0'; return; }
      e.preventDefault();
      const h=Math.min(dy*0.5, 80); p.style.height=h+'px';
      ready = dy>TH; p.classList.toggle('ready', ready);
      p.querySelector('.cc-pull-inner').textContent = ready ? '↑' : '↓';
    }, {passive:false});
    const end=()=>{ if(!pulling)return; pulling=false; p.style.height='0'; p.classList.remove('ready'); if(ready){ ready=false; refresh(); } };
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
  }

  // ── init ────────────────────────────────────────────────────
  async function init(opts){
    opts=opts||{};
    injectStyles(); injectModals(); setupPull();
    S.onOpenTasks = opts.onOpenTasks || null;
    S.onRefresh = opts.onRefresh || null;
    S.me = opts.me || null;
    if(!S.me){ try{ const r=await jfetch(API.me); S.me=await r.json(); }catch(e){} }
    if(!S.me) return;
    renderBell();
    await Promise.all([loadUsers(), loadTasks()]);
    updateBadges(); pollNotif();
    setInterval(()=>{ loadTasks().then(()=>{ updateBadges(); if(document.getElementById('cc-tasks') && isTasksVisible()) renderTasks(); }); pollNotif(); }, 30000);
  }
  function isTasksVisible(){ const el=document.getElementById('cc-tasks'); if(!el)return false; const scr=el.closest('.screen,.scr'); return scr ? (scr.classList.contains('active')||scr.classList.contains('on')) : true; }

  window.CabinetCommon = {
    init, renderTasks, openComments, refresh,
    _tab:(t)=>{ S.tab=t; renderTasks(); },
    _openTask:openTask, _closeTask:closeTask, _saveTask:saveTask,
    _setStatus:setStatus, _delTask:delTask,
    _closeComments:closeComments, _sendComment:sendComment,
    _toggleBell:toggleBell, _openNotif:openNotif, _readAll:readAll,
    get me(){ return S.me; },
  };
})();
