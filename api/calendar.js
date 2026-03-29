import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { user } = req.query;
    if (!user) return res.status(400).send('Falta ID de usuario');

    const { data: tasks, error } = await supabase
      .from('tareas')
      .select('*')
      .eq('user_id', user)
      .not('day', 'is', null);

    if (error) throw error;

    let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//PizarraLab//ES\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:PizarraLab\r\nX-PUBLISHED-TTL:PT1H\r\n";
    
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

    if (tasks && tasks.length > 0) {
      tasks.forEach(t => {
        // 🚨 LA SOLUCIÓN: Si la fecha no es exactamente YYYY-MM-DD, nos la saltamos para no romper Apple
        if (!t.day || !/^\d{4}-\d{2}-\d{2}$/.test(t.day)) return;

        ics += "BEGIN:VEVENT\r\n";
        ics += `UID:${t.id}@pizarralab\r\n`;
        ics += `DTSTAMP:${dtstamp}\r\n`;

        const [yyyy, mm, dd] = t.day.split('-');

        // También validamos que la hora (si tiene) esté bien escrita
        if (t.time && /^\d{2}:\d{2}$/.test(t.time)) {
          const [hh, min] = t.time.split(':');
          ics += `DTSTART:${yyyy}${mm}${dd}T${hh}${min}00\r\n`;
          let endD = new Date(yyyy, mm - 1, dd, hh, min);
          endD.setHours(endD.getHours() + 1);
          ics += `DTEND:${endD.getFullYear()}${pad(endD.getMonth()+1)}${pad(endD.getDate())}T${pad(endD.getHours())}${pad(endD.getMinutes())}00\r\n`;
        } else {
          let endD = new Date(yyyy, mm - 1, dd);
          endD.setDate(endD.getDate() + 1);
          ics += `DTSTART;VALUE=DATE:${yyyy}${mm}${dd}\r\n`;
          ics += `DTEND;VALUE=DATE:${endD.getFullYear()}${pad(endD.getMonth()+1)}${pad(endD.getDate())}\r\n`;
        }

        // Filtro anti-Apple para textos
        let safeText = (t.text || 'Tarea').replace(/\n/g, ' ').replace(/,/g, '\\,').replace(/;/g, '\\;');
        if (safeText.length > 60) safeText = safeText.substring(0, 60) + '...';

        // Si la tarea ya está hecha, le ponemos una palomita visual en el título
        const prefix = t.done ? '✅ ' : '';
        ics += `SUMMARY:${prefix}${safeText}\r\n`;
        
        // ¡Cero estados! Directo al final del evento
        ics += "END:VEVENT\r\n";
      });
    }

    ics += "END:VCALENDAR\r\n";

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="pizarralab.ics"');
    res.status(200).send(ics);
  } catch (err) {
    res.status(500).send("Error interno");
  }
}
