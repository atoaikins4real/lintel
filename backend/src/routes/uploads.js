// Image uploads to Supabase Storage (bucket: lintel-photos, public-read).
//
// Deliberately accepts a base64 JSON body rather than multipart/form-data:
// parsing multipart inside a serverless function needs an extra dependency
// and careful stream handling, and Netlify Functions cap request bodies at
// roughly 6 MB anyway. The frontend resizes/compresses each image on the
// client before sending (see frontend/src/utils/image.js), so payloads
// land well under that.
const express = require('express');
const { supabase } = require('../config/supabase');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const BUCKET = 'lintel-photos';
const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// Generous ceiling as a backstop — the client should be sending far less.
const MAX_BYTES = 5 * 1024 * 1024;

// POST /api/uploads/photo  { data: "<base64>", contentType: "image/jpeg" }
router.post('/photo', requireRole('manager', 'finance'), async (req, res, next) => {
  try {
    const { data, contentType } = req.body;

    if (!data) return res.status(400).json({ error: 'No image data received' });
    if (!ALLOWED[contentType]) {
      return res.status(400).json({ error: 'Unsupported image type — use JPEG, PNG or WebP' });
    }

    // Tolerate a full data URL ("data:image/jpeg;base64,....") as well as
    // a bare base64 string.
    const base64 = String(data).includes(',') ? String(data).split(',').pop() : String(data);

    let buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      return res.status(400).json({ error: 'Image data was not valid base64' });
    }
    if (!buffer.length) return res.status(400).json({ error: 'Image data was empty' });
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: 'Image is too large — please use one under 5 MB' });
    }

    const ext = ALLOWED[contentType];
    const path = `units/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (uploadErr) throw uploadErr;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    res.status(201).json({ url: pub.publicUrl });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
