const express = require('express');
const serverless = require('serverless-http');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// ── Variables de Entorno y Supabase ───────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'instituto';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("FALTAN VARIABLES DE ENTORNO: SUPABASE_URL y SUPABASE_SERVICE_KEY/SUPABASE_ANON_KEY son obligatorias.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Configuración de Recursos ─────────────────────────────────────────────────
const VALID_RESOURCE_IDS = new Set(['chromebooks', 'carro-grande', 'carro-pequeno', 'biblioteca', 'aula-info', 'sum']);
const RESOURCES = {
  'chromebooks':   { label: 'Chromebooks' },
  'carro-grande':  { label: 'Carro Grande' },
  'carro-pequeno': { label: 'Carro Pequeño' },
  'biblioteca':    { label: 'Biblioteca' },
  'aula-info':     { label: 'Aula de Informática' },
  'sum':           { label: 'Salón de Usos Múltiples (SUM)' }
};

// ── Utilidades ────────────────────────────────────────────────────────────────
function dateIsBookable(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0,0,0,0);
  const diffDays = Math.round((d - today) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 7 && d.getDay() !== 0 && d.getDay() !== 6;
}

// ── Rutas ─────────────────────────────────────────────────────────────────────
const router = express.Router();

router.get('/resources', (req, res) => res.json(RESOURCES));

// GET /api/reservations?weekStart=YYYY-MM-DD
router.get('/reservations', async (req, res) => {
  const { weekStart } = req.query;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.status(400).json({ error: 'weekStart inválido.' });
  }
  const end = new Date(weekStart + 'T00:00:00');
  end.setDate(end.getDate() + 6);
  const endStr = end.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('reservas_instituto')
    .select('*')
    .or(`and(date.gte.${weekStart},date.lte.${endStr}),date.like.WEEKLY-%`)
    .order('slot')
    .order('resource_id');

  if (error) return res.status(500).json({ error: error.message });
  
  const rawData = data || [];
  const regular = [];
  const blocks = [];
  rawData.forEach(r => r.date.startsWith('WEEKLY-') ? blocks.push(r) : regular.push(r));

  // Expandimos los bloqueos fijos a las fechas reales de la semana solicitada
  const merged = [...regular];
  blocks.forEach(b => {
    const dayIndex = parseInt(b.date.split('-')[1], 10); // 1 = Lunes, 5 = Viernes
    const actualDate = new Date(weekStart + 'T00:00:00');
    actualDate.setDate(actualDate.getDate() + (dayIndex - 1));
    const actualDateStr = actualDate.toISOString().split('T')[0];
    
    // Si ya había una reserva normal en ese hueco, se omite porque manda el bloqueo fijo
    const conflictIdx = merged.findIndex(r => r.date === actualDateStr && r.slot === b.slot && r.resource_id === b.resource_id);
    if (conflictIdx !== -1) merged.splice(conflictIdx, 1);

    merged.push({ ...b, date: actualDateStr, is_block: true });
  });

  res.json(merged);
});

// POST /api/reservations
router.post('/reservations', async (req, res) => {
  const { date, slot, resource_id, teacher_name, group_name, pin, is_block, admin_password } = req.body ?? {};
  const name   = (teacher_name ?? '').toString().trim();
  const group  = (group_name   ?? '').toString().trim();
  const pinStr = (pin ?? '').toString().trim();

  if (is_block && admin_password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Solo el administrador puede bloquear franjas fijas.' });
  }

  if (!date || slot == null || !resource_id || !name || !group || (!pinStr && !is_block)) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }
  if (!is_block && !/^\d{4}$/.test(pinStr)) {
    return res.status(400).json({ error: 'El PIN debe tener exactamente 4 dígitos.' });
  }
  if (!VALID_RESOURCE_IDS.has(resource_id)) return res.status(400).json({ error: 'Recurso no válido.' });
  
  if (!is_block && !dateIsBookable(date)) {
    return res.status(400).json({ error: 'Solo puedes reservar dentro de los próximos 7 días lectivos.' });
  }
  if (slot < 1 || slot > 6) return res.status(400).json({ error: 'Tramo no válido.' });

  let saveDate = date;
  let savePin = pinStr;
  
  if (is_block) {
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return res.status(400).json({ error: 'No se puede bloquear fines de semana.' });
    saveDate = 'WEEKLY-' + dayOfWeek;
    savePin = 'ADMIN';
  } else {
    // Comprobar si hay un bloqueo fijo que impida la reserva normal
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const blockDate = 'WEEKLY-' + dayOfWeek;
    const { data: bData } = await supabase
      .from('reservas_instituto')
      .select('id')
      .eq('date', blockDate)
      .eq('slot', slot)
      .eq('resource_id', resource_id)
      .single();
    if (bData) return res.status(409).json({ error: 'Esta franja está bloqueada para todo el curso.' });
  }

  const { data, error } = await supabase
    .from('reservas_instituto')
    .insert([{ date: saveDate, slot, resource_id, teacher_name: name, group_name: group, pin: savePin }])
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') { 
      return res.status(409).json({ error: 'Ese recurso ya está reservado en ese tramo.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
  res.status(201).json({ id: data.id });
});

// DELETE /api/reservations/:id  (Profesor cancela con PIN)
router.delete('/reservations/:id', async (req, res) => {
  const id  = Number(req.params.id);
  const pin = (req.body?.pin ?? '').toString().trim();

  if (!pin) return res.status(400).json({ error: 'PIN requerido.' });

  const { data: row, error: fetchErr } = await supabase
    .from('reservas_instituto')
    .select('pin')
    .eq('id', id)
    .single();

  if (fetchErr || !row) return res.status(404).json({ error: 'Reserva no encontrada.' });
  
  if (row.pin === 'ADMIN') return res.status(403).json({ error: 'Esto es un bloqueo fijo. Solo el administrador puede borrarlo desde el modo Admin.' });
  if (row.pin !== pin) return res.status(403).json({ error: 'PIN incorrecto. No puedes cancelar esta reserva.' });

  const { error: delErr } = await supabase.from('reservas_instituto').delete().eq('id', id);
  if (delErr) return res.status(500).json({ error: 'Error al cancelar.' });
  
  res.json({ ok: true });
});

// ── Rutas de administración ───────────────────────────────────────────────────
router.get('/admin/reservations', async (req, res) => {
  if (req.query.password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Contraseña incorrecta.' });
  
  const { data, error } = await supabase
    .from('reservas_instituto')
    .select('*')
    .order('date', { ascending: false })
    .order('slot')
    .order('resource_id');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.delete('/admin/reservations/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (req.body?.password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Contraseña incorrecta.' });

  const { error } = await supabase.from('reservas_instituto').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.use('/api', router);
app.use(express.static('public'));
module.exports.handler = serverless(app);

if (!process.env.NETLIFY) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor en http://localhost:${PORT} (Conectado a Supabase)`);
  });
}
