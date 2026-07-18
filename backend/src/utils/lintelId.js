const { supabase } = require('../config/supabase');

/**
 * Generates the next Lintel ID for a given year, e.g. LNT-2026-0001.
 * Uses the tenant_id_counters table as an atomic-ish counter.
 * (For very high concurrency, wrap this in a Postgres function with
 * `select ... for update`. Fine for MVP volumes.)
 */
async function generateLintelId(date = new Date()) {
  const year = date.getFullYear();

  const { data: existing, error: fetchError } = await supabase
    .from('l_tenant_id_counters')
    .select('*')
    .eq('year', year)
    .maybeSingle();

  if (fetchError) throw fetchError;

  let nextSeq;
  if (existing) {
    nextSeq = existing.last_seq + 1;
    const { error: updateError } = await supabase
      .from('l_tenant_id_counters')
      .update({ last_seq: nextSeq })
      .eq('year', year);
    if (updateError) throw updateError;
  } else {
    nextSeq = 1;
    const { error: insertError } = await supabase
      .from('l_tenant_id_counters')
      .insert({ year, last_seq: nextSeq });
    if (insertError) throw insertError;
  }

  const padded = String(nextSeq).padStart(4, '0');
  return `LNT-${year}-${padded}`;
}

module.exports = { generateLintelId };
