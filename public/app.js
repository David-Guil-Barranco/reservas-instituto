'use strict';

// ── Horario ───────────────────────────────────────────────────────────────────
const SLOTS = [
  { id: 1, start: '08:00', end: '09:00' },
  { id: 2, start: '09:00', end: '10:00' },
  { id: 3, start: '10:00', end: '11:00' },
  // recreo entre slot 3 y 4
  { id: 4, start: '11:30', end: '12:30' },
  { id: 5, start: '12:30', end: '13:30' },
  { id: 6, start: '13:30', end: '14:30' },
];

// Tabs: cada uno agrupa uno o varios resource_id del servidor
// Se define después de cargar /api/resources
const TABS = [
  {
    id:        'carritos',
    label:     'Carritos de portátiles',
    resources: ['carrito-1', 'carrito-2', 'carrito-3'],
  },
  { id: 'biblioteca', label: 'Biblioteca',          resources: ['biblioteca'] },
  { id: 'aula-info',  label: 'Aula de Informática',  resources: ['aula-info']  },
  { id: 'sum',        label: 'SUM',                  resources: ['sum']         },
];

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
const DAY_LONG  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MONTHS    = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ── Sesión de administrador ───────────────────────────────────────────────────
const ADMIN_PW = sessionStorage.getItem('adminPw') || '';
const IS_ADMIN = !!ADMIN_PW;


let weekStart    = getMonday(new Date());
let reservations = []; // todas las de la semana, independiente del tab
let activeTab    = TABS[0];
let pending      = null;

// Labels de los recursos cargados del servidor (resource_id → label)
let resourceLabels = {};

// ── Utilidades de fecha ───────────────────────────────────────────────────────
function getMonday(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const dow = date.getDay();
  date.setDate(date.getDate() + (dow === 0 ? -6 : 1 - dow));
  return date;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function isToday(d) {
  const t = new Date();
  return d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth() && d.getDate()===t.getDate();
}
function isLocked(d) {
  const today = new Date(); today.setHours(0,0,0,0);
  return d < today || d > addDays(today, 7);
}
function weekRangeLabel(monday) {
  const friday = addDays(monday, 4);
  if (monday.getMonth() === friday.getMonth()) {
    return `${monday.getDate()} – ${friday.getDate()} de ${MONTHS[friday.getMonth()]} de ${friday.getFullYear()}`;
  }
  return `${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${friday.getDate()} ${MONTHS[friday.getMonth()]} ${friday.getFullYear()}`;
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── API ───────────────────────────────────────────────────────────────────────
async function apiFetch(method, url, body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  return (await fetch(url, opts)).json();
}
async function loadReservations() {
  const data = await apiFetch('GET', `/api/reservations?weekStart=${toISO(weekStart)}`);
  reservations = Array.isArray(data) ? data : [];
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function buildTabs() {
  const bar = document.getElementById('tab-bar');
  bar.innerHTML = '';
  TABS.forEach((tab, i) => {
    // Separador visual entre carritos y salas
    if (i === 1) {
      const sep = document.createElement('div');
      sep.className = 'tab-sep';
      bar.appendChild(sep);
    }
    const btn = document.createElement('button');
    btn.className   = 'tab-btn' + (tab === activeTab ? ' active' : '');
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', tab === activeTab);
    btn.addEventListener('click', () => switchTab(tab));
    bar.appendChild(btn);
  });
}

function switchTab(tab) {
  activeTab = tab;
  buildTabs();
  renderBody();
}

// ── Renderizado ───────────────────────────────────────────────────────────────
function getResv(date, slot, resourceId) {
  return reservations.find(r => r.date === date && r.slot === slot && r.resource_id === resourceId);
}

function renderHeader() {
  document.getElementById('week-label').textContent = weekRangeLabel(weekStart);
  for (let i = 0; i < 5; i++) {
    const d  = addDays(weekStart, i);
    const th = document.getElementById(`th-day-${i}`);
    th.textContent = `${DAY_SHORT[i]} ${d.getDate()}`;
    th.className   = isToday(d) ? 'today-hd' : '';
  }
}

function renderNavButtons() {
  const today      = new Date(); today.setHours(0,0,0,0);
  const thisMonday = getMonday(today);
  const max        = addDays(today, 7);
  document.getElementById('btn-prev').disabled = weekStart <= addDays(thisMonday, -7);
  document.getElementById('btn-next').disabled = addDays(weekStart, 7) > max;
}

function renderBody() {
  const tbody    = document.getElementById('cal-body');
  const isSingle = activeTab.resources.length === 1;
  tbody.innerHTML = '';

  SLOTS.forEach((slot, idx) => {
    // Fila del recreo entre slot 3 y 4
    if (idx === 3) {
      const tr = document.createElement('tr');
      tr.className = 'break-row';
      const td0 = document.createElement('td');
      td0.className = 'time-cell'; td0.textContent = '11:00 – 11:30';
      tr.appendChild(td0);
      for (let i = 0; i < 5; i++) {
        const td = document.createElement('td'); td.textContent = 'Recreo';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    const tr = document.createElement('tr');

    // Celda de hora
    const timeTd = document.createElement('td');
    timeTd.className   = 'time-cell';
    timeTd.textContent = `${slot.start} – ${slot.end}`;
    tr.appendChild(timeTd);

    // Celdas de días (lun–vie)
    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      const d       = addDays(weekStart, dayIdx);
      const dateStr = toISO(d);
      const locked  = isLocked(d);

      const td   = document.createElement('td');
      if (isToday(d)) td.classList.add('today-col');

      const cell = document.createElement('div');
      cell.className = 'day-cell';

      activeTab.resources.forEach(resourceId => {
        const resv  = getResv(dateStr, slot.id, resourceId);
        const pill  = document.createElement('div');
        const label = resourceLabels[resourceId] || resourceId;
        // Badge corto para carritos: "C1", "C2", "C3"
        const badge = resourceId.startsWith('carrito-') ? `C${resourceId.slice(-1)}` : label;

        if (locked) {
          pill.className = 'pill locked' + (isSingle ? ' single' : '');
          pill.innerHTML = `<b>${escHtml(badge)}</b><span>—</span>`;
        } else if (resv) {
          const info = `${resv.teacher_name} · ${resv.group_name}`;
          pill.className = 'pill taken' + (isSingle ? ' single' : '');
          pill.title     = info;
          pill.innerHTML = `<b>${escHtml(badge)}</b><span>${escHtml(info)}</span>`;
          pill.addEventListener('click', () => openCancelModal(resv));
        } else {
          pill.className = 'pill free' + (isSingle ? ' single' : '');
          pill.innerHTML = `<b>${escHtml(badge)}</b><span>Libre</span>`;
          pill.addEventListener('click', () => openReserveModal(dateStr, slot, resourceId));
        }

        cell.appendChild(pill);
      });

      td.appendChild(cell);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });
}

function render() {
  renderHeader();
  renderBody();
  renderNavButtons();
}

// ── Modal: reservar ───────────────────────────────────────────────────────────
const modalEl   = document.getElementById('modal');
const modalBody = document.getElementById('modal-content');

function showModal(html) {
  modalBody.innerHTML = html;
  modalEl.classList.remove('hidden');
  modalBody.querySelector('input')?.focus();
}
function hideModal() { modalEl.classList.add('hidden'); pending = null; }
function showErr(id, msg) { const el=document.getElementById(id); if(el){el.textContent=msg;el.style.display='block';} }
function clearErr(id)     { const el=document.getElementById(id); if(el) el.style.display='none'; }

function openReserveModal(date, slot, resourceId) {
  pending = { action: 'reserve', date, slotId: slot.id, resourceId };
  const d     = new Date(date + 'T00:00:00');
  const label = resourceLabels[resourceId] || resourceId;
  showModal(`
    <h3>Reservar – ${escHtml(label)}</h3>
    <p class="modal-sub">${DAY_LONG[d.getDay()]} ${d.getDate()} · ${slot.start}–${slot.end}</p>
    <label>Nombre del profesor
      <input type="text" id="m-name" autocomplete="name" placeholder="Nombre Apellido">
    </label>
    <label>Grupo / clase
      <input type="text" id="m-group" placeholder="Ej: 3ºA ESO">
    </label>
    <label>PIN de seguridad (4 dígitos)
      <input type="password" id="m-pin" placeholder="••••" maxlength="4" pattern="\\d{4}">
    </label>
    <p class="modal-err" id="m-err"></p>
    <div class="modal-btns">
      <button class="btn btn-ghost" id="m-back">Cancelar</button>
      <button class="btn btn-primary" id="m-ok">Reservar</button>
    </div>
  `);
  document.getElementById('m-back').onclick = hideModal;
  document.getElementById('m-ok').onclick   = submitReserve;
  document.getElementById('m-name').addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('m-group').focus(); });
  document.getElementById('m-group').addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('m-pin').focus(); });
  document.getElementById('m-pin').addEventListener('keydown', e => { if (e.key==='Enter') submitReserve(); });
}

async function submitReserve() {
  const name  = document.getElementById('m-name').value.trim();
  const group = document.getElementById('m-group').value.trim();
  const pin   = document.getElementById('m-pin').value.trim();
  clearErr('m-err');
  if (!name)  return showErr('m-err', 'Introduce tu nombre.');
  if (!group) return showErr('m-err', 'Introduce el grupo o clase.');
  if (!/^\d{4}$/.test(pin)) return showErr('m-err', 'El PIN debe ser exactamente 4 números.');
  const btn = document.getElementById('m-ok');
  btn.disabled = true; btn.textContent = 'Reservando…';
  const res = await apiFetch('POST', '/api/reservations', {
    date: pending.date, slot: pending.slotId,
    resource_id: pending.resourceId, teacher_name: name, group_name: group, pin: pin
  });
  btn.disabled = false; btn.textContent = 'Reservar';
  if (res.error) { showErr('m-err', res.error); }
  else { hideModal(); await loadReservations(); render(); }
}

// ── Modal: cancelar (profesores) ──────────────────────────────────────────────
function openCancelModal(resv) {
  // Si es admin, cancelar directamente sin pedir nombre
  if (IS_ADMIN) {
    openAdminCancelModal(resv);
    return;
  }

  pending = { action: 'cancel', id: resv.id };
  const d     = new Date(resv.date + 'T00:00:00');
  const slot  = SLOTS.find(s => s.id === resv.slot);
  const label = resourceLabels[resv.resource_id] || resv.resource_id;
  showModal(`
    <h3>Cancelar reserva</h3>
    <p class="modal-sub">${escHtml(label)} · ${DAY_LONG[d.getDay()]} ${d.getDate()} · ${slot?.start}–${slot?.end}</p>
    <p class="modal-sub" style="font-weight:600;color:var(--gray-700);margin-top:-10px">
      ${escHtml(resv.teacher_name)} &middot; ${escHtml(resv.group_name)}
    </p>
    <label style="margin-top:16px">Introduce tu PIN de 4 dígitos para cancelar
      <input type="password" id="mc-pin" placeholder="••••" maxlength="4">
    </label>
    <p class="modal-err" id="mc-err"></p>
    <div class="modal-btns">
      <button class="btn btn-ghost" id="mc-back">Volver</button>
      <button class="btn btn-danger" id="mc-ok">Cancelar reserva</button>
    </div>
  `);
  document.getElementById('mc-back').onclick = hideModal;
  document.getElementById('mc-ok').onclick   = submitCancel;
  document.getElementById('mc-pin').addEventListener('keydown', e => { if (e.key==='Enter') submitCancel(); });
}

// ── Modal: cancelar (admin, sin verificación de nombre) ───────────────────────
function openAdminCancelModal(resv) {
  pending = { action: 'admin-cancel', id: resv.id };
  const d     = new Date(resv.date + 'T00:00:00');
  const slot  = SLOTS.find(s => s.id === resv.slot);
  const label = resourceLabels[resv.resource_id] || resv.resource_id;
  showModal(`
    <h3>Cancelar reserva</h3>
    <p class="modal-sub">${escHtml(label)} · ${DAY_LONG[d.getDay()]} ${d.getDate()} · ${slot?.start}–${slot?.end}</p>
    <p class="modal-sub" style="font-weight:600;color:var(--gray-700);margin-top:-10px">
      ${escHtml(resv.teacher_name)} &middot; ${escHtml(resv.group_name)}
    </p>
    <p class="modal-err" id="ac-err"></p>
    <div class="modal-btns">
      <button class="btn btn-ghost" id="ac-back">Volver</button>
      <button class="btn btn-danger" id="ac-ok">Cancelar reserva</button>
    </div>
  `);
  document.getElementById('ac-back').onclick = hideModal;
  document.getElementById('ac-ok').onclick   = submitAdminCancel;
}

async function submitAdminCancel() {
  const btn = document.getElementById('ac-ok');
  btn.disabled = true; btn.textContent = 'Cancelando…';
  const res = await apiFetch('DELETE', `/api/admin/reservations/${pending.id}`, { password: ADMIN_PW });
  btn.disabled = false; btn.textContent = 'Cancelar reserva';
  if (res.error) { showErr('ac-err', res.error); }
  else { hideModal(); await loadReservations(); render(); }
}

async function submitCancel() {
  const pin = document.getElementById('mc-pin').value.trim();
  clearErr('mc-err');
  if (!pin) return showErr('mc-err', 'Introduce tu PIN.');
  const btn = document.getElementById('mc-ok');
  btn.disabled = true; btn.textContent = 'Cancelando…';
  const res = await apiFetch('DELETE', `/api/reservations/${pending.id}`, { pin: pin });
  btn.disabled = false; btn.textContent = 'Cancelar reserva';
  if (res.error) { showErr('mc-err', res.error); }
  else { hideModal(); await loadReservations(); render(); }
}

// ── Listeners ─────────────────────────────────────────────────────────────────
document.getElementById('btn-prev').addEventListener('click', () => { weekStart = addDays(weekStart,-7); init(); });
document.getElementById('btn-next').addEventListener('click', () => { weekStart = addDays(weekStart, 7); init(); });
document.getElementById('modal-x').addEventListener('click', hideModal);
modalEl.addEventListener('click', e => { if (e.target === modalEl) hideModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideModal(); });

// ── Botón e indicador de admin ────────────────────────────────────────────────
function setupAdminIndicator() {
  const topbarRight = document.getElementById('topbar-right');
  if (!topbarRight) return;

  if (IS_ADMIN) {
    // Ya autenticado: mostrar badge + botón salir
    topbarRight.innerHTML = `
      <div class="admin-indicator">
        <span class="admin-badge">Modo admin</span>
        <button class="admin-logout" id="btn-admin-logout">Salir</button>
      </div>`;
    document.getElementById('btn-admin-logout').addEventListener('click', () => {
      sessionStorage.removeItem('adminPw');
      window.location.reload();
    });
  } else {
    // No autenticado: botón discreto para activar modo admin
    topbarRight.innerHTML = `<button class="admin-logout" id="btn-admin-enter">Admin</button>`;
    document.getElementById('btn-admin-enter').addEventListener('click', openAdminLoginModal);
  }
}

function openAdminLoginModal() {
  showModal(`
    <h3>Modo administrador</h3>
    <p class="modal-sub">Introduce la contraseña para gestionar todas las reservas.</p>
    <label>Contraseña
      <input type="password" id="al-pw" autocomplete="current-password" placeholder="••••••••">
    </label>
    <p class="modal-err" id="al-err"></p>
    <div class="modal-btns">
      <button class="btn btn-ghost" id="al-back">Cancelar</button>
      <button class="btn btn-primary" id="al-ok">Entrar</button>
    </div>
  `);
  document.getElementById('al-back').onclick = hideModal;
  document.getElementById('al-ok').onclick   = submitAdminLogin;
  document.getElementById('al-pw').addEventListener('keydown', e => { if (e.key === 'Enter') submitAdminLogin(); });
  document.getElementById('al-pw').addEventListener('input', () => clearErr('al-err'));
}

async function submitAdminLogin() {
  const pw  = document.getElementById('al-pw').value;
  clearErr('al-err');
  if (!pw.trim()) { showErr('al-err', 'Introduce la contraseña.'); return; }

  const btn = document.getElementById('al-ok');
  btn.disabled = true; btn.textContent = 'Comprobando…';

  try {
    const res  = await fetch(`/api/admin/reservations?password=${encodeURIComponent(pw)}`);
    const data = await res.json();
    if (data.error) {
      btn.disabled = false; btn.textContent = 'Entrar';
      showErr('al-err', 'Contraseña incorrecta.');
      document.getElementById('al-pw').select();
      return;
    }
    // Contraseña correcta
    sessionStorage.setItem('adminPw', pw);
    hideModal();
    window.location.reload(); // recarga para que IS_ADMIN sea true
  } catch (_) {
    btn.disabled = false; btn.textContent = 'Entrar';
    showErr('al-err', 'Error de conexión.');
  }
}

// ── Inicio ────────────────────────────────────────────────────────────────────
async function init() {
  await loadReservations();
  render();
}

async function bootstrap() {
  setupAdminIndicator();
  const data = await apiFetch('GET', '/api/resources');
  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([id, info]) => { resourceLabels[id] = info.label; });
  }
  buildTabs();
  await init();
}

bootstrap();
