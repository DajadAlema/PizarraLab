/**
 * api/tasks.js
 * GET  /api/tasks  → devuelve todas las tareas del usuario autenticado
 * POST /api/tasks  → crea una nueva tarea
 *
 * El Service Key de Supabase vive aquí (variable de entorno de Vercel)
 * y NUNCA llega al frontend.
 */

const { createClient } = require('@supabase/supabase-js');

// Service key: acceso completo, solo en backend
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Campos de texto que se permiten al crear/actualizar
const VALID_TAGS     = ['work','personal','urgent','idea'];
const VALID_STATUSES = ['todo','inprogress','review','done'];
const TIME_REGEX     = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:MM
const DATE_REGEX     = /^\d{4}-\d{2}-\d{2}$/;       // YYYY-MM-DD

/**
 * Verifica el JWT del header Authorization y devuelve el usuario,
 * o null si el token es inválido / no existe.
 */
async function getAuthUser(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

module.exports = async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Auth ──────────────────────────────────────────────
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  // ── GET ───────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('tareas')
      .select('*')
      .eq('user_id', user.id)
      .order('inserted_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── POST ──────────────────────────────────────────────
  if (req.method === 'POST') {
    // CAMBIO: Recibir alert_time del body 24/03/2026
    const { text, tag, status, day, time, done, alert_time } = req.body || {};

    // Validaciones
    if (!text || typeof text !== 'string' || text.trim().length === 0)
      return res.status(400).json({ error: 'El texto es requerido' });
    if (text.trim().length > 500)
      return res.status(400).json({ error: 'El texto es demasiado largo (máx 500 caracteres)' });
    if (tag && !VALID_TAGS.includes(tag))
      return res.status(400).json({ error: 'Etiqueta inválida' });
    if (status && !VALID_STATUSES.includes(status))
      return res.status(400).json({ error: 'Estado inválido' });
    if (time && !TIME_REGEX.test(time))
      return res.status(400).json({ error: 'Formato de hora inválido (usa HH:MM)' });
    if (day && !DATE_REGEX.test(day))
      return res.status(400).json({ error: 'Formato de fecha inválido (usa YYYY-MM-DD)' });

    const { data, error } = await supabase
      .from('tareas')
      .insert([{
        text:    text.trim(),
        tag:     VALID_TAGS.includes(tag)       ? tag    : 'work',
        status:  VALID_STATUSES.includes(status)? status : 'todo',
        day:     day  || null,
        time:    time || null,
        done:    !!done,
        user_id: user.id,
        // CAMBIO: Guardar el tiempo de alerta (por defecto 15 si no viene) 24/03/2026
        alert_time: alert_time !== undefined ? parseInt(alert_time) : 15
      }])
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data[0]);
  }

  return res.status(405).json({ error: 'Método no permitido' });
};
