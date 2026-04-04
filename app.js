/**
 * app.js — PizarraLab Frontend
 *
 * ARQUITECTURA:
 * - Supabase client  → solo para Auth (login/register/session)
 * - fetch('/api/*')  → todas las operaciones de datos
 *
 * Las credenciales de la DB nunca tocan el frontend.
 * El Service Key de Supabase vive solo en Vercel env vars.
 */

// ── Config ────────────────────────────────────────────────
// SUPABASE_ANON_KEY es una clave pública — seguro tenerla en frontend
// Solo se usa para autenticación, NO para acceder a datos
const SUPABASE_URL      = 'https://oqfdstzfvgdxnzmsotim.supabase.co';       // reemplaza esto
const SUPABASE_ANON_KEY = 'sb_publishable_FL9Od8OjI_zGQloYIep-dw_Cn7c_XpC';  // reemplaza esto
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ─────────────────────────────────────────────────
let tasks       = [];
let currentUser = null;
let weekOffset  = 0;
let monthOffset = 0;
let dragId      = null;
let modalDay    = null;
const notifiedSet = new Set(); // evita duplicar notificaciones

// ── Constants ─────────────────────────────────────────────
const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
                   'Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const STATUS_LABELS = {
  todo:       'Por hacer',
  inprogress: 'En progreso',
  review:     'En revisión',
  done:       'Hecho'
};
const TAG_LABELS = {
  work:     '💼 Trabajo',
  personal: '🎯 Personal',
  urgent:   '🔥 Urgente',
  idea:     '💡 Idea'
};

// ═══════════════════════════════════════════════════════════
// THEMES
// ═══════════════════════════════════════════════════════════

function changeTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('pizarralab_theme', theme);
}

function loadSavedTheme() {
  const savedTheme = localStorage.getItem('pizarralab_theme') || 'legacy';
  document.body.setAttribute('data-theme', savedTheme);
  
  // Sincronizar el selector visualmente si existe
  const select = document.getElementById('themeSelect');
  if (select) select.value = savedTheme;
}

// Ejecutar inmediatamente para evitar parpadeos al cargar
loadSavedTheme();

// ═══════════════════════════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════════════════════════

/**
 * Wrapper para fetch que añade el JWT del usuario actual.
 * Lanza un Error si la respuesta no es OK.
 */
async function apiFetch(url, options = {}) {
  const { data: { session } } = await _supabase.auth.getSession();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
      ...(options.headers || {})
    }
  });
  if (res.status === 204) return null; // DELETE exitoso
  const json = await res.json().catch(() => ({ error: 'Respuesta inválida del servidor' }));
  if (!res.ok) throw new Error(json.error || `Error HTTP ${res.status}`);
  return json;
}

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════

function toggleAuthForms() {
  const l = document.getElementById('loginForm');
  const r = document.getElementById('registerForm');
  const isLogin = l.style.display !== 'none';
  l.style.display = isLogin ? 'none' : 'block';
  r.style.display = isLogin ? 'block' : 'none';
}
//CAMBIO 25/03/2026 avbx4ch2
function showApp(user) {
  currentUser = user;
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('appMain').style.display = 'block';
  updateDaySelect();
  loadAndRender();
  
  // CAMBIO: Comprobación de seguridad para navegadores móviles
  if ('Notification' in window && Notification.permission === 'granted' && notifsActive) {
    activateNotifs();
  } else {
    updateNotifBtn(false);
  }
}

function showAuth() {
  currentUser = null;
  tasks = [];
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('appMain').style.display = 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = e.target.querySelector('[type="submit"]');
  btn.textContent = '...'; btn.disabled = true;
  try {
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    showApp(data.user);
  } catch (err) {
    showToast('Error al iniciar sesión: ' + err.message, 'error');
  } finally {
    btn.textContent = 'Entrar'; btn.disabled = false;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = e.target.querySelector('[type="submit"]');
  btn.textContent = '...'; btn.disabled = true;
  try {
    const email    = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) throw error;
    showToast('¡Registro exitoso! Revisa tu email para confirmar.', 'success');
    toggleAuthForms();
  } catch (err) {
    showToast('Error en el registro: ' + err.message, 'error');
  } finally {
    btn.textContent = 'Registrarse'; btn.disabled = false;
  }
}

async function handleLogout() {
  await _supabase.auth.signOut();
  showAuth();
}

async function checkInitialSession() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (session) showApp(session.user);
  else showAuth();
}


// ═══════════════════════════════════════════════════════════
// MOSTRAR CONTRASEÑA
// ═══════════════════════════════════════════════════════════

function togglePasswordVisibility() {
  // Ahora sí estamos apuntando al ID correcto de tu HTML
  const passInput = document.getElementById('loginPassword');
  
  if (passInput) {
    if (passInput.type === 'password') {
      passInput.type = 'text';
    } else {
      passInput.type = 'password';
    }
  }
}


// ═══════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════

async function loadAndRender() {
  setLoading(true);
  try {
    tasks = await apiFetch('/api/tasks');
    renderAll();
  } catch (err) {
    showToast('Error cargando tareas: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function addTask() {
  const text = document.getElementById('taskInput').value.trim();
  if (!text) { document.getElementById('taskInput').focus(); return; }
  const btn = document.querySelector('.btn-add');
  btn.textContent = '...'; btn.disabled = true;
  try {
    const task = await apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        text,
        tag:    document.getElementById('tagSelect').value,
        status: document.getElementById('statusSelect').value,
        day:    document.getElementById('daySelect').value || null,
        time:   document.getElementById('timeInput').value || null,
        done:   false,
        // CAMBIO: Enviar la preferencia de alerta
        alert_time: parseInt(document.getElementById('alertSelect').value)
      })
    });
    tasks.unshift(task);
    document.getElementById('taskInput').value = '';
    document.getElementById('timeInput').value = '';
    renderAll();
    showToast('Tarea añadida', 'success');
  } catch (err) {
    showToast('Error añadiendo tarea: ' + err.message, 'error');
  } finally {
    btn.textContent = '+ Añadir'; btn.disabled = false;
  }
}

async function addTaskFromModal() {
  const text = document.getElementById('modalInput').value.trim();
  const time = document.getElementById('modalTimeInput').value || null;
  if (!text || !modalDay) return;
  try {
    const task = await apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ text, tag: 'work', status: 'todo', day: modalDay, time, done: false })
    });
    tasks.unshift(task);
    document.getElementById('modalInput').value = '';
    document.getElementById('modalTimeInput').value = '';
    renderAll();
    renderModalBody();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function toggleDone(id) {
  const t = tasks.find(t => t.id == id); if (!t) return;
  const newDone   = !t.done;
  const newStatus = newDone ? 'done' : (t.status === 'done' ? 'todo' : t.status);
  // Optimistic update
  t.done = newDone; t.status = newStatus;
  renderAll(); if (modalDay) renderModalBody();
  try {
    await apiFetch(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ done: newDone, status: newStatus })
    });
  } catch (err) {
    showToast('Error sincronizando: ' + err.message, 'error');
    await loadAndRender(); // rollback
  }
}

async function deleteTask(id) {
  tasks = tasks.filter(t => t.id != id);
  renderAll(); if (modalDay) renderModalBody();
  try {
    await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
  } catch (err) {
    showToast('Error borrando tarea: ' + err.message, 'error');
    await loadAndRender();
  }
}

async function changeStatus(id, status) {
  const t = tasks.find(t => t.id == id); if (!t) return;
  t.status = status; t.done = status === 'done';
  renderAll(); if (modalDay) renderModalBody();
  try {
    await apiFetch(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status, done: status === 'done' })
    });
  } catch (err) {
    showToast('Error actualizando estado: ' + err.message, 'error');
    await loadAndRender();
  }
}

async function clearDone() {
  const toDelete = tasks.filter(t => t.done || t.status === 'done').map(t => t.id);
  if (!toDelete.length) return;
  tasks = tasks.filter(t => !t.done && t.status !== 'done');
  renderAll();
  try {
    await Promise.all(toDelete.map(id => apiFetch(`/api/tasks/${id}`, { method: 'DELETE' })));
    showToast(`${toDelete.length} tarea(s) eliminada(s)`, 'info');
  } catch (err) {
    showToast('Error al limpiar: ' + err.message, 'error');
    await loadAndRender();
  }
}

async function drop(e, target, ctx) {
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if (dragId === null) return;
  const t = tasks.find(t => t.id == dragId); if (!t) return;
  let fields = {};
  if (ctx === 'weekly') { t.day = target; fields = { day: target }; }
  else { t.status = target; t.done = target === 'done'; fields = { status: target, done: t.done }; }
  renderAll();
  try {
    await apiFetch(`/api/tasks/${dragId}`, { method: 'PUT', body: JSON.stringify(fields) });
  } catch (err) {
    showToast('Error moviendo tarea: ' + err.message, 'error');
    await loadAndRender();
  }
}

async function dropDay(key) {
  if (dragId === null) return;
  const t = tasks.find(t => t.id == dragId); if (!t) return;
  t.day = key; renderAll();
  try {
    await apiFetch(`/api/tasks/${dragId}`, { method: 'PUT', body: JSON.stringify({ day: key }) });
  } catch (err) {
    showToast('Error moviendo tarea: ' + err.message, 'error');
    await loadAndRender();
  }
}

function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' }));
  a.download = `pizarralab-${dateKey(new Date())}.json`;
  a.click();
}

// ═══════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════

function renderAll() { renderStats(); renderWeekly(); renderMonthly(); renderKanban(); }

function renderStats() {
  const tot  = tasks.length;
  const done = tasks.filter(t => t.done || t.status === 'done').length;
  const prog = tasks.filter(t => t.status === 'inprogress').length;
  const urg  = tasks.filter(t => t.tag === 'urgent' && !t.done).length;
  document.getElementById('statsBar').innerHTML = `
    <div class="stat-item"><div class="stat-val">${tot}</div><div class="stat-label">Total</div></div>
    <div class="stat-divider"></div>
    <div class="stat-item"><div class="stat-val" style="color:var(--green)">${done}</div><div class="stat-label">Hechas</div></div>
    <div class="stat-divider"></div>
    <div class="stat-item"><div class="stat-val">${prog}</div><div class="stat-label">En progreso</div></div>
    <div class="stat-divider"></div>
    <div class="stat-item"><div class="stat-val" style="color:var(--accent2)">${urg}</div><div class="stat-label">Urgentes</div></div>
    <div class="stat-divider"></div>
    <div class="stat-item">
      <div class="stat-val">${tot ? Math.round(done/tot*100) : 0}<span style="font-size:.8rem;color:var(--muted)">%</span></div>
      <div class="stat-label">Progreso</div>
    </div>`;
}

function renderWeekly() {
  const dates = getWeekDates(weekOffset);
  document.getElementById('weekLabel').textContent =
    `${dates[0].getDate()} ${dates[0].toLocaleString('es',{month:'short'})} — ` +
    `${dates[6].getDate()} ${dates[6].toLocaleString('es',{month:'short',year:'numeric'})}`;
  const grid = document.getElementById('weekGrid'); grid.innerHTML = '';
  dates.forEach((d, i) => {
    const key = dateKey(d);
    const dt  = sortByTime(tasks.filter(t => t.day === key));
    const col = document.createElement('div');
    col.className = `day-col${isToday(d) ? ' today' : ''}`;
    col.ondragover  = e => dragOver(e);
    col.ondragleave = dragLeave;
    col.ondrop      = e => drop(e, key, 'weekly');
    col.innerHTML   = `
      <div class="day-header">
        <div class="day-name">${DAYS[i]}</div>
        <div class="day-date">${String(d.getDate()).padStart(2,'0')}</div>
      </div>
      <div class="day-tasks">${dt.length ? '' : '<div class="empty-hint">vacío</div>'}</div>`;
    dt.forEach(t => col.querySelector('.day-tasks').appendChild(buildCard(t)));
    grid.appendChild(col);
  });
}

function renderMonthly() {
  const {cells, label} = getMonthCells(monthOffset);
  document.getElementById('monthLabel').textContent = label;
  const grid = document.getElementById('monthGrid'); grid.innerHTML = '';
  DAYS.forEach(d => {
    const h = document.createElement('div'); h.className = 'month-dow'; h.textContent = d; grid.appendChild(h);
  });
  cells.forEach(({date, current}) => {
    const key = dateKey(date);
    const dt  = sortByTime(tasks.filter(t => t.day === key));
    const cell = document.createElement('div');
    cell.className = `month-day${!current?' other-month':''}${isToday(date)?' today':''}`;
    if (current) {
      cell.onclick    = () => openModal(key, date);
      cell.ondragover = e => { e.preventDefault(); cell.classList.add('drag-over'); };
      cell.ondragleave= () => cell.classList.remove('drag-over');
      cell.ondrop     = e => { e.preventDefault(); cell.classList.remove('drag-over'); dropDay(key); };
    }
    const num = document.createElement('div'); num.className = 'month-day-num'; num.textContent = date.getDate();
    cell.appendChild(num);
    const pills = document.createElement('div'); pills.className = 'month-pills';
    const MAX = 3;
    dt.slice(0, MAX).forEach(t => {
      const p = document.createElement('div');
      p.className  = `month-pill tag-${t.tag}${t.done?' is-done':''}`;
      p.textContent = (t.time ? t.time + ' · ' : '') + t.text;
      pills.appendChild(p);
    });
    if (dt.length > MAX) {
      const m = document.createElement('div'); m.className = 'month-more';
      m.textContent = `+${dt.length - MAX} más`; pills.appendChild(m);
    }
    cell.appendChild(pills); grid.appendChild(cell);
  });
}

function renderKanban() {
  ['todo','inprogress','review','done'].forEach(s => {
    const list = tasks.filter(t => t.status === s);
    const cont = document.getElementById(`tasks-${s}`);
    cont.innerHTML = list.length ? '' : '<div class="empty-hint">vacío</div>';
    list.forEach(t => cont.appendChild(buildCard(t)));
    document.getElementById(`cnt-${s}`).textContent = list.length;
  });
}

function buildCard(task) {
  const card = document.createElement('div');
  card.className  = `task-card${task.done ? ' done-card' : ''}`;
  card.draggable  = true;
  card.dataset.id = task.id;
  card.ondragstart = e => {
    dragId = task.id;
    setTimeout(() => card.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
  };
  card.ondragend = () => { card.classList.remove('dragging'); dragId = null; };

  const opts      = Object.entries(STATUS_LABELS)
    .map(([v,l]) => `<option value="${v}"${task.status===v?' selected':''}>${l}</option>`).join('');
  const timeBadge = task.time ? `<span class="time-badge">🕐 ${task.time}</span>` : '';

  card.innerHTML = `
    <div class="task-top">
      <div class="task-check${task.done?' checked':''}" onclick="toggleDone('${task.id}')">${task.done?'✓':''}</div>
      <span class="task-text">${esc(task.text)}</span>
      <button class="task-edit" onclick="openEditModal('${task.id}')">✎</button>
      <button class="task-del" onclick="deleteTask('${task.id}')">✕</button>
    </div>
    <div class="task-meta">
      <span class="tag tag-${task.tag}">${TAG_LABELS[task.tag]}</span>
      ${timeBadge}
      <select class="status-badge" onchange="changeStatus('${task.id}',this.value)">${opts}</select>
    </div>`;
  return card;
}

function esc(s) {
  return s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
}

// ═══════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════

function openModal(key, date) {
  modalDay = key;
  const dow = (date.getDay()+6)%7;
  document.getElementById('modalTitle').textContent =
    `${DAYS[dow]} ${date.getDate()} ${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
  renderModalBody();
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('modalInput').focus(), 100);
}

function renderModalBody() {
  const body = document.getElementById('modalBody');
  const dt   = sortByTime(tasks.filter(t => t.day === modalDay));
  body.innerHTML = '';
  if (!dt.length) {
    body.innerHTML = '<div class="modal-empty">Sin tareas este día.<br>¡Añade una abajo!</div>';
    return;
  }
  dt.forEach(t => body.appendChild(buildCard(t)));
}

function closeModalBg(e) { if (e.target === document.getElementById('modalOverlay')) closeModalDirect(); }
function closeModalDirect() { document.getElementById('modalOverlay').classList.remove('open'); modalDay = null; }

// Funciones para Editar Tareas
// 25/03/2026 avbx4ch2

function openEditModal(id) {
  const t = tasks.find(x => x.id == id);
  if (!t) return;
  
  // Llenar el formulario con los datos actuales
  document.getElementById('editTaskId').value = t.id;
  document.getElementById('editText').value = t.text;
  document.getElementById('editTime').value = t.time || '';
  document.getElementById('editDate').value = t.day || '';
  document.getElementById('editTag').value = t.tag || 'work';
  document.getElementById('editStatus').value = t.status || 'todo';
  document.getElementById('editAlert').value = t.alert_time !== undefined ? t.alert_time : 15;
  
  // Mostrar el modal
  document.getElementById('editModalOverlay').classList.add('open');
}

function closeEditModal() { document.getElementById('editModalOverlay').classList.remove('open'); }
function closeEditModalBg(e) { if (e.target === document.getElementById('editModalOverlay')) closeEditModal(); }

async function saveEditTask() {
  const id = document.getElementById('editTaskId').value;
  const text = document.getElementById('editText').value.trim();
  if (!text) return;

  const btn = document.querySelector('#editModalOverlay .btn-auth');
  btn.textContent = 'Guardando...'; btn.disabled = true;

  const updates = {
    text: text,
    time: document.getElementById('editTime').value || null,
    day: document.getElementById('editDate').value || null,
    tag: document.getElementById('editTag').value,
    status: document.getElementById('editStatus').value,
    alert_time: parseInt(document.getElementById('editAlert').value)
  };

  // Actualización optimista (cambiamos la UI antes de que responda el servidor)
  const t = tasks.find(x => x.id == id);
  if (t) { Object.assign(t, updates); }
  renderAll();
  closeEditModal();

  try {
    await apiFetch(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    showToast('Tarea actualizada correctamente', 'success');
  } catch (err) {
    showToast('Error al actualizar: ' + err.message, 'error');
    await loadAndRender(); // Revertimos si hay error en DB
  } finally {
    btn.textContent = 'Guardar Cambios'; btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
// NAVIGATION & VIEW
// ═══════════════════════════════════════════════════════════

function changeWeek(dir)  { weekOffset  += dir; updateDaySelect(); renderAll(); }
function goToday()        { weekOffset   = 0;   updateDaySelect(); renderAll(); }
function changeMonth(dir) { monthOffset += dir; renderAll(); }
function goTodayMonth()   { monthOffset  = 0;   renderAll(); }

function switchView(v, btn) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`view-${v}`).classList.add('active');
  btn.classList.add('active');
}

// ═══════════════════════════════════════════════════════════
// DRAG & DROP
// ═══════════════════════════════════════════════════════════

function dragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function dragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

// ═══════════════════════════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════════════════════════

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function isToday(d) { return dateKey(d) === dateKey(new Date()); }

function sortByTime(arr) {
  return [...arr].sort((a,b) => (a.time||'99:99').localeCompare(b.time||'99:99'));
}

function getWeekDates(off = 0) {
  const now = new Date(), dow = now.getDay(), mon = new Date(now);
  mon.setDate(now.getDate() - ((dow+6)%7) + off*7);
  return Array.from({length:7}, (_,i) => {
    const d = new Date(mon); d.setDate(mon.getDate()+i); return d;
  });
}

function getMonthCells(off = 0) {
  const now  = new Date();
  const base = new Date(now.getFullYear(), now.getMonth()+off, 1);
  const y = base.getFullYear(), m = base.getMonth();
  const first = new Date(y,m,1), last = new Date(y,m+1,0);
  const startDow = (first.getDay()+6)%7;
  const cells = [];
  for (let i = startDow-1; i >= 0; i--)         cells.push({date: new Date(y,m,-i),   current:false});
  for (let d = 1; d <= last.getDate(); d++)      cells.push({date: new Date(y,m,d),    current:true});
  const rem = (7 - cells.length%7)%7;
  for (let i = 1; i <= rem; i++)                 cells.push({date: new Date(y,m+1,i),  current:false});
  return {cells, label: `${MONTHS_ES[m]} ${y}`};
}

function updateDaySelect() {
  const sel = document.getElementById('daySelect');
  sel.innerHTML = '<option value="">— Sin día —</option>';
  getWeekDates(weekOffset).forEach((d, i) => {
    const o = document.createElement('option');
    o.value = dateKey(d);
    o.textContent = `${DAYS[i]} ${d.getDate()}`;
    sel.appendChild(o);
  });
}

// ═══════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

//-- Cambio para activacion/desactivacion de las notificaciones
//-- 25/03/2026 avbx4ch2

let notifInterval = null;
// Leemos si el usuario las tenía activadas en su visita anterior
let notifsActive = localStorage.getItem('pizarralab_notifs') === 'true';

async function toggleNotifications() {
  if (!('Notification' in window)) {
    showToast('Tu navegador no soporta notificaciones', 'error'); return;
  }

  // Si están activas, las apagamos
  if (notifsActive) {
    notifsActive = false;
    localStorage.setItem('pizarralab_notifs', 'false');
    if (notifInterval) { clearInterval(notifInterval); notifInterval = null; }
    updateNotifBtn(false);
    showToast('Notificaciones silenciadas 🔕', 'info');
  } 
  // Si están apagadas, intentamos prenderlas
  else {
    if (Notification.permission === 'granted') {
      activateNotifs();
      showToast('Notificaciones activadas 🔔', 'success');
    } else if (Notification.permission !== 'denied') {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        activateNotifs();
        showToast('¡Notificaciones activadas! 🔔', 'success');
      } else {
        showToast('Permiso de notificaciones denegado', 'error');
      }
    } else {
      showToast('Permiso bloqueado por el navegador', 'error');
    }
  }
}

function activateNotifs() {
  notifsActive = true;
  localStorage.setItem('pizarralab_notifs', 'true');
  updateNotifBtn(true);
  startNotificationChecker();
}

function updateNotifBtn(active) {
  const btn = document.getElementById('notifBtn');
  if (active) {
    btn.classList.add('active');
    btn.title = 'Silenciar notificaciones';
  } else {
    btn.classList.remove('active');
    btn.title = 'Activar notificaciones';
  }
}

function startNotificationChecker() {
  if (notifInterval) clearInterval(notifInterval);
  checkUpcomingTasks();                                   
  notifInterval = setInterval(checkUpcomingTasks, 60000); 
}

//-------- 25/03/2026

function checkUpcomingTasks() {
  // CAMBIO: Si no existe 'Notification' o no hay permisos, cancelamos silenciosamente
  if (!('Notification' in window) || Notification.permission !== 'granted' || !notifsActive) return;
  
  const now         = new Date();
  const todayKey    = dateKey(now);
  const currentMins = now.getHours() * 60 + now.getMinutes();

  tasks.forEach(task => {
    if (!task.time || task.day !== todayKey || task.done) return;
    
    const alertTime = task.alert_time !== undefined ? task.alert_time : 15;
    if (alertTime === -1) return;

    const [h, m] = task.time.split(':').map(Number);
    const taskMins = h * 60 + m;
    const diff     = taskMins - currentMins;
    
    // Aviso según la preferencia
    const keyAlert = `${task.id}-alert-${alertTime}`;
    if (diff === alertTime && !notifiedSet.has(keyAlert)) {
      notifiedSet.add(keyAlert);
      const timeStr = alertTime === 0 ? "ahora" : `en ${alertTime} min`;
      triggerRichNotification(`⏰ Tarea ${timeStr}`, `"${task.text}" a las ${task.time}`, keyAlert, task.id);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════

function showToast(msg, type = 'info') {
  const old = document.getElementById('toast');
  if (old) old.remove();
  const toast = document.createElement('div');
  toast.id        = 'toast';
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function setLoading(on) {
  let bar = document.getElementById('loadingBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'loadingBar'; bar.className = 'loading-bar';
    document.body.prepend(bar);
  }
  if (on) bar.classList.add('active');
  else    bar.classList.remove('active');
}

// ═══════════════════════════════════════════════════════════
// SERVICE WORKER (PWA)
// ═══════════════════════════════════════════════════════════

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(err => console.warn('Service Worker no registrado:', err));
  });
}

/**
 * CAMBIO: Funciones para notificaciones interactivas y comunicación con Service Worker
 * FECHA: 24/05/2026
 */

// Lanza una notificación con botones usando el Service Worker
function triggerRichNotification(title, body, tag, taskId) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body: body,
        icon: '/icon-192.png',
        tag: tag,
        data: { taskId: taskId }, // Guardamos el ID para saber qué tarea modificar
        actions: [
          { action: 'done', title: '✓ Marcar hecho' },
          { action: 'snooze', title: '⏰ Posponer 15m' }
        ],
        vibrate: [200, 100, 200]
      });
    });
  }
}

// Función para sumar 15 minutos a la hora de una tarea
async function snoozeTask(id) {
  const t = tasks.find(x => x.id == id);
  if (!t || !t.time) return;
  
  const [h, m] = t.time.split(':').map(Number);
  let date = new Date();
  date.setHours(h, m + 15);
  
  const newTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  t.time = newTime;
  
  renderAll(); // Actualización visual optimista
  
  try {
    await apiFetch(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify({ time: newTime }) });
    showToast('Tarea pospuesta 15 min ⏰', 'info');
  } catch (err) {
    showToast('Error al posponer', 'error');
    await loadAndRender(); // Revertir si falla
  }
}

// Escuchar los mensajes que nos manda el sw.js cuando se hace clic en un botón
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    const { type, action, taskId } = event.data;
    
    if (type === 'NOTIF_ACTION' && taskId) {
      if (action === 'done') {
        toggleDone(taskId);
        showToast('¡Tarea completada desde la notificación! ✓', 'success');
      } else if (action === 'snooze') {
        snoozeTask(taskId);
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════
// SYNC CALENDAR (Suscripción Automática)
// ═══════════════════════════════════════════════════════════
// avbx4ch2  28/03/2026
function exportICS() {
  if (!currentUser || !currentUser.id) {
    showToast('Error: No se encontró el usuario', 'error');
    return;
  }
  
  // Extraemos el dominio sin el https://
  const host = window.location.host; 
  const randomKey = Math.random().toString(36).substring(7);
  const syncUrl = `webcal://${host}/api/calendar.ics?user=${currentUser.id}&v=${randomKey}`;
  
  // Esto obligará al iPhone a abrir la app de Calendario al instante
  window.location.href = syncUrl;
  
  // Como plan B, mostramos el enlace 1 segundo después por si acaso
  setTimeout(() => {
    prompt("Si tu calendario no se abrió solo, copia este enlace (asegúrate de que diga webcal):", syncUrl);
  }, 1000);
}
// ── Init ──────────────────────────────────────────────────
checkInitialSession();
