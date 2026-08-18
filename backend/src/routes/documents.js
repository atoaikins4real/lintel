// DOCUMENTS
//
// Signed lease agreements, receipts, inspection reports — attached to a
// lease, tenant, unit or property.
//
// Stored in a PRIVATE bucket, unlike unit photos. A signed tenancy
// agreement contains personal data and must not be readable by anyone who
// happens to have the URL, so downloads go through short-lived signed
// URLs minted per request after the caller's company has been checked.
const express = require('express');
const { supabase } = require('../config/supabase');
const { gateMutations, requireRole } = require('../middleware/auth');
const { blank } = require('../utils/sanitize');

const router = express.Router();
router.use(gateMutations);

const BUCKET = 'lintel-documents';
const KINDS = ['lease_agreement', 'id_document', 'receipt', 'inspection', 'invoice', 'other'];
const OWNERS = ['lease_id', 'tenant_id', 'unit_id', 'property_id'];
const MAX_BYTES = 15 * 1024 * 1024;
const SIGNED_URL_TTL = 300; // seconds — long enough to click, short enough to matter

// GET /api/documents?lease_id=&tenant_id=&unit_id=&property_id=
router.get('/', async (req, res, next) => {
  try {
    let query = supabase
      .from('l_documents')
      .select('*')
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: false });

    for (const owner of OWNERS) {
      if (req.query[owner]) query = query.eq(owner, req.query[owner]);
    }

    const { data, error } = await query;
    if (error) throw error;

    // file_url is a storage path, not something usable directly. Strip it
    // so it can't be mistaken for a working link.
    res.json((data || []).map(({ file_url, ...doc }) => doc));
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/download — mints a short-lived signed URL.
router.get('/:id/download', async (req, res, next) => {
  try {
    const { data: doc } = await supabase
      .from('l_documents')
      .select('file_url, title')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_url, SIGNED_URL_TTL);
    if (error) throw error;

    res.json({ url: data.signedUrl, expires_in: SIGNED_URL_TTL, title: doc.title });
  } catch (err) {
    next(err);
  }
});

// POST /api/documents — base64 upload, same approach as photos (see
// routes/uploads.js for why multipart isn't used here).
router.post('/', async (req, res, next) => {
  try {
    const { data: fileData, filename, mime_type, title, kind } = req.body;

    if (!fileData) return res.status(400).json({ error: 'No file received' });
    if (!title?.trim()) return res.status(400).json({ error: 'Give the document a title' });
    if (kind && !KINDS.includes(kind)) {
      return res.status(400).json({ error: `Kind must be one of: ${KINDS.join(', ')}` });
    }

    const owners = OWNERS.filter((o) => blank(req.body[o]));
    if (owners.length === 0) {
      return res.status(400).json({ error: 'Attach the document to a lease, tenant, unit or property' });
    }

    // Confirm every referenced record belongs to this company before
    // storing anything.
    const tableFor = {
      lease_id: 'l_leases',
      tenant_id: 'l_tenants',
      unit_id: 'l_units',
      property_id: 'l_properties',
    };
    for (const owner of owners) {
      const { data: found } = await supabase
        .from(tableFor[owner])
        .select('id')
        .eq('id', req.body[owner])
        .eq('company_id', req.user.company_id)
        .maybeSingle();
      if (!found) return res.status(404).json({ error: `${owner.replace('_id', '')} not found` });
    }

    const base64 = String(fileData).includes(',') ? String(fileData).split(',').pop() : String(fileData);
    let buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      return res.status(400).json({ error: 'File data was not valid base64' });
    }
    if (!buffer.length) return res.status(400).json({ error: 'File was empty' });
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: 'File is too large — please use one under 15 MB' });
    }

    const safeName = String(filename || 'document')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .slice(-60);
    // Path is namespaced by company so nothing is guessable across
    // tenants even at the storage layer.
    const path = `${req.user.company_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mime_type || 'application/octet-stream', upsert: false });
    if (uploadErr) throw uploadErr;

    const payload = {
      title: title.trim(),
      kind: kind || 'other',
      file_url: path,
      mime_type: blank(mime_type),
      size_bytes: buffer.length,
      notes: blank(req.body.notes),
      uploaded_by: req.user.id,
    };
    for (const owner of OWNERS) payload[owner] = blank(req.body[owner]);

    const { data, error } = await supabase
      .from('l_documents')
      .insert({ ...payload, company_id: req.user.company_id })
      .select()
      .single();
    if (error) throw error;

    const { file_url, ...safe } = data;
    res.status(201).json(safe);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/documents/:id — manager only. Removes the stored file too,
// so deleting a record doesn't leave the document sitting in the bucket.
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { data: doc } = await supabase
      .from('l_documents')
      .select('file_url')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const { error } = await supabase
      .from('l_documents')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id);
    if (error) throw error;

    // Best-effort: an orphaned file is untidy, a failed delete would be
    // worse, so this doesn't block the response.
    supabase.storage
      .from(BUCKET)
      .remove([doc.file_url])
      .catch((e) => console.error('Document file removal failed:', e?.message || e));

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
