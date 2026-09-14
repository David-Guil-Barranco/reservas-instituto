'use strict';

// ── Horario ───────────────────────────────────────────────────────────────────
const SLOTS = [
  { id: 1, start: '08:30', end: '09:30' },
  { id: 2, start: '09:30', end: '10:30' },
  { id: 3, start: '10:30', end: '11:30' },
  // recreo 11:30 - 12:00
  { id: 4, start: '12:00', end: '13:00' },
  { id: 5, start: '13:00', end: '14:00' },
  { id: 6, start: '14:00', end: '15:00' },
];

let TABS = [
  {
    id:        'carritos',
    label:     'Carritos / Chromebooks',
    resources: ['chromebooks', 'carro-grande', 'carro-pequeno'],
  },
  { id: 'biblioteca', label: 'Biblioteca',          resources: ['biblioteca'] },
  { id: 'aula-info',  label: 'Aula de Informática',  resources: ['aula-info']  },
  { id: 'sum',        label: 'SUM',                  resources: ['sum']         },
];

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
const DAY_LONG  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MONTHS    = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre'];

let currentWeekStart = getMonday(new Date());
let currentTab       = TABS[0];
let resourceLabels   = {};
let reservations     = [];
let pending          = null; 
let IS_ADMIN         = !!sessionStorage.getItem('adminPw');

function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  dt.setDate(diff);
  dt.setHours(0,0,0,0);
  return dt;
}

function formatDateISO(d) {
  return d.toISOString().split('T')[0];
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function apiFetch(method, url, body = null) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(url, opts);
    return await res.json();
  } catch (err) {
    return { error: 'Error de conexión.' };
  }
}

// ── Inicialización ────────────────────────────────────────────────────────────
async function bootstrap() {
  setupAdminIndicator();
  const data = await apiFetch('GET', '/api/resources');
  if (!data.error) resourceLabels = data;
  
  buildTabs();
  await init();
}

function buildTabs() {
  const nav = document.getElementById('tab-bar');
  nav.innerHTML = '';
  TABS.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (tab.id === currentTab.id ? ' active' : '');
    btn.textContent = tab.label;
    btn.onclick = async () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = tab;
      render();
    };
    nav.appendChild(btn);
  });
}

async function init() {
  await loadReservations();
  render();
}

async function loadReservations() {
  const ws = formatDateISO(currentWeekStart);
  const data = await apiFetch('GET', `/api/reservations?weekStart=${ws}`);
  if (!data.error) {
    reservations = data;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderHeader() {
  const dEnd = new Date(currentWeekStart);
  dEnd.setDate(dEnd.getDate() + 4);
  const lbl = document.getElementById('week-label');
  
  const m1 = MONTHS[currentWeekStart.getMonth()];
  const m2 = MONTHS[dEnd.getMonth()];
  
  if (m1 === m2) {
    lbl.textContent = `${currentWeekStart.getDate()} - ${dEnd.getDate()} de ${m1}`;
  } else {
    lbl.textContent = `${currentWeekStart.getDate()} de ${m1} - ${dEnd.getDate()} de ${m2}`;
  }

  for (let i = 0; i < 5; i++) {
    const th = document.getElementById('th-day-' + i);
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    th.innerHTML = `${DAY_SHORT[i]}<br><span style="font-weight:normal;font-size:0.9em">${d.getDate()}</span>`;
  }
}

function renderBody() {
  const tbody = document.getElementById('cal-body');
  tbody.innerHTML = '';

  const isMulti = currentTab.resources.length > 1;

  SLOTS.forEach((slot, idx) => {
    if (idx === 3) {
      const tr = document.createElement('tr');
      tr.className = 'break-row';
      const td0 = document.createElement('td');
      td0.className = 'time-cell'; td0.textContent = '11:30 – 12:00';
      tr.appendChild(td0);
      for (let i = 0; i < 5; i++) {
        const td = document.createElement('td'); td.textContent = 'Recreo';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    const tr = document.createElement('tr');
    
    const tdTime = document.createElement('td');
    tdTime.className = 'time-cell';
    tdTime.innerHTML = `<strong>${slot.id}ª Hora</strong><br>${slot.start} - ${slot.end}`;
    tr.appendChild(tdTime);

    for (let i = 0; i < 5; i++) {
      const td = document.createElement('td');
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      const dStr = formatDateISO(d);

      const cell = document.createElement('div');
      cell.className = 'cell-content';
      if (isMulti) cell.classList.add('multi-res');

      currentTab.resources.forEach(resId => {
        const resv = reservations.find(r => r.date === dStr && r.slot === slot.id && r.resource_id === resId);
        
        const pill = document.createElement('div');
        pill.className = 'res-pill ' + (resv ? 'taken' : 'free');
        if (!isMulti) pill.classList.add('single');
        if (resv && resv.is_block) pill.classList.add('is-block');

        if (resv) {
          if (resv.is_block) {
             pill.innerHTML = `<strong>🔒 ${escHtml(resv.teacher_name)}</strong><br>${escHtml(resv.group_name)}`;
          } else {
             pill.innerHTML = `<strong>${escHtml(resv.teacher_name)}</strong><br>${escHtml(resv.group_name)}`;
          }
          if (isMulti) pill.title = resourceLabels[resId] || resId;
          
          pill.addEventListener('click', () => {
            if (IS_ADMIN) openAdminCancelModal(resv);
            else openCancelModal(resv);
          });
        } else {
          pill.innerHTML = isMulti ? `<em>${escHtml(resourceLabels[resId] || resId)}</em>` : `<em>Libre</em>`;
          pill.addEventListener('click', () => openReserveModal(dStr, slot, resId));
        }

        cell.appendChild(pill);
      });

      td.appendChild(cell);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });
}

function renderNavButtons() {
  document.getElementById('btn-prev').onclick = async () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    await init();
  };
  document.getElementById('btn-next').onclick = async () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    await init();
  };
}

// ── Modal UI ──────────────────────────────────────────────────────────────────
const modalEl   = document.getElementById('modal');
const modalBody = document.getElementById('modal-content');

function showModal(html) {
  modalBody.innerHTML = html;
  modalEl.classList.remove('hidden');
}
function hideModal() {
  modalEl.classList.add('hidden');
  modalBody.innerHTML = '';
  pending = null;
}
document.getElementById('modal-x').onclick = hideModal;

function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

// ── Reservar ──────────────────────────────────────────────────────────────────
function openReserveModal(date, slot, resourceId) {
  pending = { action: 'reserve', date, slotId: slot.id, resourceId };
  const d     = new Date(date + 'T00:00:00');
  const label = resourceLabels[resourceId] || resourceId;
  showModal(`
    <h3>Reservar – ${escHtml(label)}</h3>
    <p class="modal-sub">${DAY_LONG[d.getDay()]} ${d.getDate()} | ${slot.start}-${slot.end}</p>
    <label>Nombre del profesor
      <input type="text" id="m-name" autocomplete="name" placeholder="Nombre Apellido">
    </label>
    <label>Grupo / clase
      <input type="text" id="m-group" placeholder="Ej: 3ºA ESO">
    </label>
    
    ${IS_ADMIN ? `
      <label style="margin-top: 15px; display: flex; align-items: center; gap: 8px; cursor: pointer; background: #f3f4f6; padding: 10px; border-radius: 6px;">
        <input type="checkbox" id="m-is-block">
        <strong style="color: #b91c1c;">🔒 Bloquear franja para todo el curso</strong>
      </label>
    ` : `
      <label>PIN de seguridad (4 dígitos)
        <input type="password" id="m-pin" placeholder="••••" maxlength="4" pattern="d{4}">
      </label>
    `}
    
    <p class="modal-err" id="m-err"></p>
    <div class="modal-btns">
      <button class="btn btn-ghost" id="m-back">Cancelar</button>
      <button class="btn btn-primary" id="m-ok">Reservar</button>
    </div>
  `);
  document.getElementById('m-back').onclick = hideModal;
  document.getElementById('m-ok').onclick   = submitReserve;
  
  if (IS_ADMIN) {
     const check = document.getElementById('m-is-block');
     check.onchange = () => {
         if(check.checked) {
             document.getElementById('m-group').value = 'BLOQUEO FIJO';
         } else {
             document.getElementById('m-group').value = '';
         }
     }
  }
}

async function submitReserve() {
  const name  = document.getElementById('m-name').value.trim();
  const group = document.getElementById('m-group').value.trim();
  
  let pin = '';
  let is_block = false;
  if (IS_ADMIN) {
     is_block = document.getElementById('m-is-block').checked;
  } else {
     pin = document.getElementById('m-pin').value.trim();
  }

  showErr('m-err', '');
  
  if (!name || !group || (!pin && !is_block && !IS_ADMIN)) {
    return showErr('m-err', 'Rellena todos los campos.');
  }
  
  const btn = document.getElementById('m-ok');
  btn.disabled = true; btn.textContent = 'Reservando...';
  
  const payload = {
    date: pending.date, slot: pending.slotId,
    resource_id: pending.resourceId,
    teacher_name: name, group_name: group, pin,
    is_block, admin_password: IS_ADMIN ? sessionStorage.getItem('adminPw') : undefined
  };
  
  const res = await apiFetch('POST', '/api/reservations', payload);
  btn.disabled = false; btn.textContent = 'Reservar';
  
  if (res.error) showErr('m-err', res.error);
  else {
    hideModal();
    await loadReservations();
    render();
  }
}

// ── Cancelar ──────────────────────────────────────────────────────────────────
function openCancelModal(resv) {
  pending = { action: 'cancel', id: resv.id };
  const d = new Date(resv.date + 'T00:00:00');
  showModal(`
    <h3>Cancelar reserva</h3>
    <p class="modal-sub">${DAY_LONG[d.getDay()]} ${d.getDate()} | Tramo ${resv.slot}</p>
    <p>Profesor: <strong>${escHtml(resv.teacher_name)}</strong></p>
    <label style="margin-top:15px">Introduce tu PIN (4 dígitos) para cancelar
      <input type="password" id="c-pin" placeholder="••••" maxlength="4">
    </label>
    <p class="modal-err" id="c-err"></p>
    <div class="modal-btns">
      <button class="btn btn-ghost" id="c-back">Volver</button>
      <button class="btn btn-danger" id="c-ok">Cancelar reserva</button>
    </div>
  `);
  document.getElementById('c-back').onclick = hideModal;
  document.getElementById('c-ok').onclick   = submitCancel;
}

async function submitCancel() {
  const pin = document.getElementById('c-pin').value.trim();
  if (!pin) return showErr('c-err', 'Introduce el PIN.');
  
  const btn = document.getElementById('c-ok');
  btn.disabled = true; btn.textContent = 'Borrando...';
  
  const res = await apiFetch('DELETE', `/api/reservations/${pending.id}`, { pin });
  btn.disabled = false; btn.textContent = 'Cancelar reserva';
  
  if (res.error) showErr('c-err', res.error);
  else {
    hideModal();
    await loadReservations();
    render();
  }
}

// ── Admin ─────────────────────────────────────────────────────────────────────
function setupAdminIndicator() {
  const container = document.getElementById('topbar-right');
  if (IS_ADMIN) {
    container.innerHTML = `
      <div class="admin-indicator">
        <span class="admin-badge">Modo Admin</span>
        <button class="btn btn-ghost" id="btn-logout" style="padding:4px 8px; font-size:0.8rem">Salir</button>
      </div>
    `;
    document.getElementById('btn-logout').onclick = () => {
      sessionStorage.removeItem('adminPw');
      window.location.reload();
    };
  } else {
    container.innerHTML = `<button class="btn btn-ghost" id="btn-admin-login">Admin</button>`;
    document.getElementById('btn-admin-login').onclick = openAdminLogin;
  }
}

function openAdminLogin() {
  showModal(`
    <h3>Modo Administrador</h3>
    <p class="modal-sub">Acceso exclusivo para coordinación</p>
    <label>Contraseña
      <input type="password" id="a-pw">
    </label>
    <p class="modal-err" id="a-err"></p>
    <div class="modal-btns">
      <button class="btn btn-ghost" id="a-back">Volver</button>
      <button class="btn btn-primary" id="a-ok">Entrar</button>
    </div>
  `);
  document.getElementById('a-back').onclick = hideModal;
  document.getElementById('a-ok').onclick = async () => {
    const pw = document.getElementById('a-pw').value;
    const res = await apiFetch('GET', `/api/admin/reservations?password=${encodeURIComponent(pw)}`);
    if (res.error) {
      showErr('a-err', res.error);
    } else {
      sessionStorage.setItem('adminPw', pw);
      window.location.reload();
    }
  };
}

function openAdminCancelModal(resv) {
  pending = { action: 'admin_cancel', id: resv.id };
  const d = new Date(resv.date + 'T00:00:00');
  const typeText = resv.is_block ? '<strong style="color:red">BLOQUEO FIJO DEL CURSO</strong>' : 'reserva';
  showModal(`
    <h3>Admin - Borrar ${resv.is_block ? 'Bloqueo' : 'Reserva'}</h3>
    <p class="modal-sub">${DAY_LONG[d.getDay()]} ${d.getDate()} | Tramo ${resv.slot}</p>
    <p>Estás a punto de borrar la ${typeText} de <strong>${escHtml(resv.teacher_name)}</strong>.</p>
    <p class="modal-err" id="ac-err"></p>
    <div class="modal-btns">
      <button class="btn btn-ghost" id="ac-back">Volver</button>
      <button class="btn btn-danger" id="ac-ok">Borrar definitivamente</button>
    </div>
  `);
  document.getElementById('ac-back').onclick = hideModal;
  document.getElementById('ac-ok').onclick = async () => {
    const btn = document.getElementById('ac-ok');
    btn.disabled = true; btn.textContent = 'Borrando...';
    
    const res = await apiFetch('DELETE', `/api/admin/reservations/${pending.id}`, { 
      password: sessionStorage.getItem('adminPw') 
    });
    
    if (res.error) {
      btn.disabled = false; btn.textContent = 'Borrar definitivamente';
      showErr('ac-err', res.error);
    } else {
      hideModal();
      await loadReservations();
      render();
    }
  };
}

bootstrap();
