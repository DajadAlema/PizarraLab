/**
 * api/tasks/[id].js   ← IMPORTANTE: renombrar este archivo a [id].js
 *
 * PUT    /api/tasks/:id  → actualiza campos de una tarea
 * DELETE /api/tasks/:id  → elimina una tarea
 *
 * Seguridad: siempre filtra por user_id para que un usuario
 * no pueda modificar tareas ajenas.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ALLOWED_FIELDS  = ['text','tag','status','day','time','done', 'alert_time'];
const VALID_TAGS      = ['work','personal','urgent','idea'];
const VALID_STATUSES  = ['todo','inprogress','review','done'];
const TIME_REGEX      = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX      = /^\d{4}-\d{2}-\d{2}$/;

async function getAuthUser(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

/** Valida y sanitiza los campos del body antes de actualizar */
function sanitizeUpdates(body) {
  const updates = {};
  const errors  = [];

  ALLOWED_FIELDS.forEach(f => {
    if (body[f] === undefined) return;
    switch (f) {
      case 'text':
        if (typeof body.text !== 'string' || !body.text.trim())
          { errors.push('Texto inválido'); break; }
        if (body.text.trim().length > 500)
          { errors.push('Texto demasiado largo'); break; }
        updates.text = body.text.trim();
        break;
      case 'tag':
        if (!VALID_TAGS.includes(body.tag)) { errors.push('Etiqueta inválida'); break; }
        updates.tag = body.tag;
        break;
      case 'status':
        if (!VALID_STATUSES.includes(body.status)) { errors.push('Estado inválido'); break; }
        updates.status = body.status;
        break;
      case 'done':
        updates.done = !!body.done;
        break;
      case 'day':
        if (body.day !== null && !DATE_REGEX.test(body.day)) { errors.push('Fecha inválida'); break; }
        updates.day = body.day || null;
        break;
      case 'time':
        if (body.time !== null && !TIME_REGEX.test(body.time)) { errors.push('Hora inválida'); break; }
        updates.time = body.time || null;
        break;
      case 'alert_time':
        updates.alert_time = body.alert_time !== undefined ? parseInt(body.alert_time) : 15;
        break;
    }
  });

  return { updates, errors };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID requerido' });

  // ── PUT ───────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { updates, errors } = sanitizeUpdates(req.body || {});

    if (errors.length)
      return res.status(400).json({ error: errors.join(', ') });
    if (!Object.keys(updates).length)
      return res.status(400).json({ error: 'Sin campos válidos para actualizar' });

    const { data, error } = await supabase
      .from('tareas')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)   // ← ownership check
      .select();

    if (error)         return res.status(500).json({ error: error.message });
    if (!data?.length) return res.status(404).json({ error: 'Tarea no encontrada o sin acceso' });
    return res.status(200).json(data[0]);
  }

  // ── DELETE ────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('tareas')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);  // ← ownership check

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Método no permitido' });
};
