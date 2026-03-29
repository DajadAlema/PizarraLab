import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Obtenemos el ID del usuario desde la URL secreta
  const { user } = req.query;
  if (!user) return res.status(400).send('ID de usuario requerido');

  // Buscamos solo las tareas de este usuario que tengan fecha asignada
  const { data: tasks, error } = await supabase
    .from('tareas')
    .select('*')
    .eq('user_id', user)
    .not('day', 'is', null);

  if (error) return res.status(500).send('Error en la base de datos');

  // Construimos el archivo de calendario
  // 1. Cabeceras estrictas para Apple
  let ics = "BEGIN:VCALENDAR\r\n";
  ics += "VERSION:2.0\r\n";
  ics += "PRODID:-//PizarraLab//ES\r\n";
  ics += "CALSCALE:GREGORIAN\r\n";
  ics += "METHOD:PUBLISH\r\n";          // Obligatorio para iOS
  ics += "X-WR-CALNAME:PizarraLab\r\n"; // El iPhone tomará este nombre automáticamente
  ics += "X-PUBLISHED-TTL:PT1H\r\n";    // Le pedimos al iPhone que se actualice cada hora

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  tasks.forEach(t => {
    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${t.id}@pizarralab\r\n`;
    ics += `DTSTAMP:${dtstamp}\r\n`;

    const [yyyy, mm, dd] = t.day.split('-');

    if (t.time) {
      const [hh, min] = t.time.split(':');
      const startDate = `${yyyy}${mm}${dd}T${hh}${min}00`;
      
      let endDateObj = new Date(yyyy, mm - 1, dd, hh, min);
      endDateObj.setHours(endDateObj.getHours() + 1);
      const endDate = `${endDateObj.getFullYear()}${pad(endDateObj.getMonth()+1)}${pad(endDateObj.getDate())}T${pad(endDateObj.getHours())}${pad(endDateObj.getMinutes())}00`;

      ics += `DTSTART:${startDate}\r\n`;
      ics += `DTEND:${endDate}\r\n`;
    } else {
      const startDate = `${yyyy}${mm}${dd}`;
      let endDateObj = new Date(yyyy, mm - 1, dd);
      endDateObj.setDate(endDateObj.getDate() + 1);
      const endDate = `${endDateObj.getFullYear()}${pad(endDateObj.getMonth()+1)}${pad(endDateObj.getDate())}`;

      ics += `DTSTART;VALUE=DATE:${startDate}\r\n`;
      ics += `DTEND;VALUE=DATE:${endDate}\r\n`;
    }

    // 2. Limpieza de texto: Quitamos saltos de línea (Enters) que rompen el calendario
    const cleanText = t.text.replace(/\n/g, ' ').trim();
    
    ics += `SUMMARY:${cleanText}\r\n`;
    ics += `STATUS:${t.done ? 'COMPLETED' : 'NEEDS-ACTION'}\r\n`;
    ics += "END:VEVENT\r\n";
  });

  ics += "END:VCALENDAR\r\n";

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="pizarralab.ics"');
  res.status(200).send(ics);
}
