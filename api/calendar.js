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
        ics += "BEGIN:VEVENT\r\n";
        ics += `UID:${t.id}@pizarralab\r\n`;
        ics += `DTSTAMP:${dtstamp}\r\n`;

        const [yyyy, mm, dd] = t.day.split('-');

        if (t.time) {
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

        // 🚨 FILTRO ANTI-APPLE: Escapar comas, punto y coma, y cortar textos largos
        let safeText = t.text.replace(/\n/g, ' ').replace(/,/g, '\\,').replace(/;/g, '\\;');
        if (safeText.length > 60) safeText = safeText.substring(0, 60) + '...';

        ics += `SUMMARY:${safeText}\r\n`;
        ics += `STATUS:${t.done ? 'COMPLETED' : 'NEEDS-ACTION'}\r\n`;
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
