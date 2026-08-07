// Fills a brand-new company workspace with realistic sample data, so a
// prospect who signs up lands in a working system instead of a set of
// empty tables. Everything here is clearly fictional and belongs solely
// to the new company — it's isolated like any other company's data, and
// they can delete it once they add their own.
const { supabase } = require('../config/supabase');

const PHOTO = (id) => `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`;

const DEMO_UNITS = [
  {
    unit_code: 'DEMO - Cantonments 2B',
    property_name: 'Cantonments Court',
    unit_type: 'apartment',
    class: 'luxury',
    bedrooms: 2,
    bathrooms: 2,
    city: 'Accra',
    base_rate_short: 950,
    base_rate_long: 12000,
    status: 'occupied',
    photos: ['1759845565036-cbecbcfcb8e2', '1754999809963-79a41e8fb648'],
  },
  {
    unit_code: 'DEMO - Airport Res 4A',
    property_name: 'Airport Residency',
    unit_type: 'apartment',
    class: 'premium',
    bedrooms: 3,
    bathrooms: 2,
    city: 'Accra',
    base_rate_short: 700,
    base_rate_long: 8500,
    status: 'vacant',
    photos: ['1757970326337-95d7cca56fa1', '1763827657709-b1bbc3c4945b'],
  },
  {
    unit_code: 'DEMO - East Legon Villa',
    property_name: 'East Legon Villa',
    unit_type: 'house',
    class: 'luxury',
    bedrooms: 4,
    bathrooms: 3,
    city: 'Accra',
    base_rate_short: 1800,
    base_rate_long: 22000,
    status: 'vacant',
    photos: ['1760473537243-72168ffd273c', '1668911494509-14baf3b42fda'],
  },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Seeds one company's workspace. Best-effort: if anything here fails we
 * log it and move on rather than failing the signup itself — an account
 * with no demo data is far better than a signup that errors out.
 */
async function seedDemoData(companyId) {
  try {
    const { data: units, error: unitErr } = await supabase
      .from('l_units')
      .insert(
        DEMO_UNITS.map((u) => ({
          company_id: companyId,
          unit_code: u.unit_code,
          property_name: u.property_name,
          unit_type: u.unit_type,
          class: u.class,
          bedrooms: u.bedrooms,
          bathrooms: u.bathrooms,
          city: u.city,
          base_rate_short: u.base_rate_short,
          base_rate_long: u.base_rate_long,
          status: u.status,
          photo_url: PHOTO(u.photos[0]),
          photo_urls: u.photos.map(PHOTO),
          notes: 'Sample data — safe to delete.',
        }))
      )
      .select('id, unit_code, base_rate_long');
    if (unitErr) throw unitErr;

    const { data: tenants, error: tenantErr } = await supabase
      .from('l_tenants')
      .insert([
        {
          company_id: companyId,
          lintel_id: `LNT-${new Date().getFullYear()}-0001`,
          first_name: 'Ama',
          last_name: 'Mensah',
          email: 'ama.mensah@example.com',
          phone: '+233 20 000 0001',
          nationality: 'Ghanaian',
          notes: 'Sample data — safe to delete.',
        },
        {
          company_id: companyId,
          lintel_id: `LNT-${new Date().getFullYear()}-0002`,
          first_name: 'Kwesi',
          last_name: 'Boateng',
          email: 'kwesi.boateng@example.com',
          phone: '+233 20 000 0002',
          nationality: 'Ghanaian',
          notes: 'Sample data — safe to delete.',
        },
      ])
      .select('id');
    if (tenantErr) throw tenantErr;

    // Keep the counter consistent with the two tenants just created, so
    // the next real tenant gets LNT-<year>-0003 rather than colliding.
    await supabase
      .from('l_tenant_id_counters')
      .upsert(
        { company_id: companyId, year: new Date().getFullYear(), last_seq: 2 },
        { onConflict: 'company_id,year' }
      );

    const occupied = units.find((u) => u.unit_code.includes('Cantonments')) || units[0];

    const { data: leases, error: leaseErr } = await supabase
      .from('l_leases')
      .insert([
        {
          company_id: companyId,
          tenant_id: tenants[0].id,
          unit_id: occupied.id,
          stay_type: 'long_stay',
          start_date: daysAgo(120),
          end_date: null,
          agreed_rate: occupied.base_rate_long,
          rate_period: 'monthly',
          status: 'active',
          source: 'direct',
        },
      ])
      .select('id, tenant_id, unit_id, agreed_rate');
    if (leaseErr) throw leaseErr;

    const lease = leases[0];
    await supabase.from('l_payments').insert([
      {
        company_id: companyId,
        lease_id: lease.id,
        tenant_id: lease.tenant_id,
        unit_id: lease.unit_id,
        amount: lease.agreed_rate,
        due_date: daysAgo(90),
        payment_date: daysAgo(89),
        status: 'paid',
        method: 'mobile_money',
      },
      {
        company_id: companyId,
        lease_id: lease.id,
        tenant_id: lease.tenant_id,
        unit_id: lease.unit_id,
        amount: lease.agreed_rate,
        due_date: daysAgo(60),
        payment_date: daysAgo(58),
        status: 'paid',
        method: 'bank_transfer',
      },
      {
        company_id: companyId,
        lease_id: lease.id,
        tenant_id: lease.tenant_id,
        unit_id: lease.unit_id,
        amount: lease.agreed_rate,
        due_date: daysAgo(2),
        payment_date: null,
        status: 'pending',
        method: null,
      },
    ]);

    await supabase.from('l_expenses').insert([
      {
        company_id: companyId,
        unit_id: occupied.id,
        category: 'maintenance',
        amount: 450,
        expense_date: daysAgo(45),
        description: 'Plumbing repair — sample data',
      },
      {
        company_id: companyId,
        unit_id: occupied.id,
        category: 'utilities',
        amount: 300,
        expense_date: daysAgo(20),
        description: 'Water and electricity — sample data',
      },
    ]);

    await supabase.from('l_faults').insert([
      {
        company_id: companyId,
        unit_id: occupied.id,
        tenant_id: tenants[0].id,
        description: 'Air conditioning not cooling — sample data',
        severity: 'medium',
        caused_by: 'wear_and_tear',
        reported_date: daysAgo(10),
        status: 'open',
        cost: null,
      },
    ]);

    return true;
  } catch (err) {
    console.error('Demo data seeding failed for company', companyId, err?.message || err);
    return false;
  }
}

module.exports = { seedDemoData };
