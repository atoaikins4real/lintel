// OTA / iCal calendar sync. A listing can subscribe to external .ics feeds
// (Airbnb, Booking.com, …); syncing pulls their busy dates into
// l_external_bookings, which then block the listing in Lintel so it can't be
// double-booked. In return, each listing exposes its own busy calendar at a
// public token URL (see routes/public.js) that the OTAs subscribe to.
const express = require('express');
const { supabase } = require('../config/supabase');
const { requireRole } = require('../middleware/auth');
const { parseIcs, normaliseFeedUrl } = require('../utils/ical');

const router = express.Router();
const txt = (v) => { const s = String(v ?? '').trim(); return s || null; };

// Confirm a unit belongs to the caller's company; returns it (with token) or null.
async function ownUnit(unitId, companyId) {
  const { data } = await supabase
    .from('l_units').select('id, unit_code, ical_token')
    .eq('id', unitId).eq('company_id', companyId).maybeSingle();
  return data || null;
}

// GET /api/calendars?unit_id= — the feeds for a listing, each with a count of
// the busy ranges it has imported, plus the listing's public export path.
router.get('/', async (req, res, next) => {
  try {
    const unitId = req.query.unit_id;
    if (!unitId) return res.status(400).json({ error: 'unit_id is required' });
    const unit = await ownUnit(unitId, req.user.company_id);
    if (!unit) return res.status(404).json({ error: 'Listing not found' });

    const [{ data: feeds }, { data: blocks }] = await Promise.all([
      supabase.from('l_calendar_feeds').select('*').eq('company_id', req.user.company_id).eq('unit_id', unitId).order('created_at', { ascending: true }),
      supabase.from('l_external_bookings').select('feed_id').eq('company_id', req.user.company_id).eq('unit_id', unitId),
    ]);
    const counts = {};
    for (const b of blocks || []) counts[b.feed_id] = (counts[b.feed_id] || 0) + 1;

    res.json({
      feeds: (feeds || []).map((f) => ({ ...f, block_count: counts[f.id] || 0 })),
      export_path: `/api/public/calendar/${unit.ical_token}.ics`,
    });
  } catch (err) { next(err); }
});

// POST /api/calendars — add an external feed to a listing.
router.post('/', requireRole('manager'), async (req, res, next) => {
  try {
    const unit = await ownUnit(req.body.unit_id, req.user.company_id);
    if (!unit) return res.status(404).json({ error: 'Listing not found' });
    const url = normaliseFeedUrl(req.body.url);
    if (!url) return res.status(400).json({ error: 'Enter a valid public calendar (.ics) link' });

    const { data, error } = await supabase
      .from('l_calendar_feeds')
      .insert({ company_id: req.user.company_id, unit_id: unit.id, name: txt(req.body.name), url })
      .select().single();
    if (error) throw error;
    res.status(201).json({ ...data, block_count: 0 });
  } catch (err) { next(err); }
});

// DELETE /api/calendars/:id — remove a feed (its imported blocks cascade away).
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('l_calendar_feeds').delete()
      .eq('id', req.params.id).eq('company_id', req.user.company_id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/calendars/:id/sync — fetch the feed, replace its imported blocks.
router.post('/:id/sync', requireRole('manager'), async (req, res, next) => {
  try {
    const { data: feed } = await supabase
      .from('l_calendar_feeds').select('*')
      .eq('id', req.params.id).eq('company_id', req.user.company_id).maybeSingle();
    if (!feed) return res.status(404).json({ error: 'Feed not found' });

    const url = normaliseFeedUrl(feed.url);
    let status = 'ok';
    let events = [];
    if (!url) {
      status = 'error: unsafe or invalid URL';
    } else {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/calendar, text/plain, */*' } });
        clearTimeout(timer);
        if (!resp.ok) {
          status = `error: feed returned ${resp.status}`;
        } else {
          const text = await resp.text();
          events = parseIcs(text).filter((e) => e.check_in && e.check_out);
        }
      } catch (e) {
        status = `error: ${String(e && e.message ? e.message : e).slice(0, 120)}`;
      }
    }

    if (status === 'ok') {
      // Replace this feed's blocks wholesale — simplest correct re-sync.
      await supabase.from('l_external_bookings').delete()
        .eq('feed_id', feed.id).eq('company_id', req.user.company_id);
      if (events.length) {
        const rows = events.map((e) => ({
          company_id: req.user.company_id, unit_id: feed.unit_id, feed_id: feed.id,
          uid: e.uid || null, summary: e.summary || null, check_in: e.check_in, check_out: e.check_out,
        }));
        const { error: insErr } = await supabase.from('l_external_bookings').insert(rows);
        if (insErr) status = `error: ${insErr.message}`;
      }
    }

    const { data: updated } = await supabase
      .from('l_calendar_feeds')
      .update({ last_synced_at: new Date().toISOString(), last_status: status, last_event_count: status === 'ok' ? events.length : null })
      .eq('id', feed.id).eq('company_id', req.user.company_id)
      .select().single();

    res.json({ ...(updated || feed), block_count: status === 'ok' ? events.length : undefined, synced: status === 'ok', status });
  } catch (err) { next(err); }
});

module.exports = router;
