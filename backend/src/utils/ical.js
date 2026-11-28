// Minimal iCalendar (RFC 5545) read/write — just enough for OTA calendar sync,
// so we don't pull in a dependency. We only care about VEVENT date ranges.

// Unfold folded lines (a CRLF followed by a space or tab continues the line).
function unfold(text) {
  return String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

// "20261220" or "20261220T140000Z" -> "2026-12-20".
function toISODate(v) {
  const m = String(v || '').match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Parse the VEVENTs out of an .ics string into busy date ranges. iCal all-day
// DTEND is exclusive, which matches our check_out (the day the guest leaves),
// so no off-by-one adjustment is needed.
function parseIcs(text) {
  const s = unfold(text);
  const out = [];
  const blocks = s.split('BEGIN:VEVENT').slice(1);
  for (const b of blocks) {
    const chunk = b.split('END:VEVENT')[0];
    const get = (prop) => {
      const re = new RegExp(`(?:^|\\n)${prop}[^:\\n]*:([^\\n]*)`);
      const m = chunk.match(re);
      return m ? m[1].trim() : null;
    };
    const check_in = toISODate(get('DTSTART'));
    let check_out = toISODate(get('DTEND'));
    if (!check_in) continue;
    if (!check_out || check_out <= check_in) {
      // Some feeds omit DTEND or give a same-day end — treat as a one-night block.
      const d = new Date(`${check_in}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      check_out = d.toISOString().slice(0, 10);
    }
    out.push({ uid: get('UID'), summary: get('SUMMARY'), check_in, check_out });
  }
  return out;
}

const pad = (d) => String(d).replace(/-/g, '');
function esc(v) {
  return String(v || '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

// Build an all-day busy calendar from our reservations. Each row needs id,
// check_in, check_out and an optional summary.
function buildIcs(calName, rows) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lintel//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName || 'Lintel')}`,
  ];
  for (const r of rows) {
    if (!r.check_in || !r.check_out) continue;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:lintel-${r.id}@lintel`);
    lines.push(`DTSTART;VALUE=DATE:${pad(r.check_in)}`);
    lines.push(`DTEND;VALUE=DATE:${pad(r.check_out)}`);
    lines.push(`SUMMARY:${esc(r.summary || 'Booked')}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// Guard against SSRF: only plain http(s) to non-local hosts. webcal:// (common
// from Airbnb) is normalised to https://.
function normaliseFeedUrl(raw) {
  let input = String(raw || '').trim();
  if (/^webcal:\/\//i.test(input)) input = input.replace(/^webcal:\/\//i, 'https://');
  let url;
  try { url = new URL(input); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const h = url.hostname;
  if (
    /^(localhost|0\.0\.0\.0|::1|\[::1\])$/i.test(h) ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.endsWith('.local') || h.endsWith('.internal')
  ) return null;
  return url.toString();
}

module.exports = { parseIcs, buildIcs, normaliseFeedUrl };
