// Fills a brand-new company workspace with realistic sample data, so a
// prospect who signs up lands in a working system instead of a set of
// empty tables. Everything here is clearly fictional and belongs solely
// to the new company — it's isolated like any other company's data, and
// they can delete it once they add their own.
const { supabase } = require('../config/supabase');

const PHOTO = (id) => `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`;

// One property with three apartments inside it. Deliberately kept within
// the Free trial allowance (2 properties, 10 units, 5 tenants) with room
// to spare, so a prospect can add their own without immediately hitting a
// limit — landing at capacity on day one would be a poor first impression.
const DEMO_PROPERTY = {
  name: 'Cantonments Court',
  property_type: 'apartment_block',
  address: '12 Independence Avenue',
  city: 'Accra',
  region: 'Greater Accra',
  country: 'Ghana',
  storeys: 4,
  floors: 4,
  staircases: 2,
  staircase_type: 'Internal',
  year_built: 2019,
  parking_spaces: 12,
  glass_panel_type: 'Tinted double-glazed',
  exterior_finish: 'Painted render',
  roofing_type: 'Concrete slab',
  wall_material: 'Sandcrete block',
  water_source: 'Mains & borehole',
  power_backup: 'Standby generator',
  amenities: ['Borehole', 'Standby generator', 'Gated & walled', '24/7 security', 'Elevator', 'Parking'],
  description: 'Sample property — safe to delete once you add your own.',
  photos: ['1759845565036-cbecbcfcb8e2', '1757970326337-95d7cca56fa1'],
};

const DEMO_UNITS = [
  {
    unit_code: 'DEMO - 2B',
    unit_type: 'apartment',
    class: 'luxury',
    bedrooms: 2, bathrooms: 2, ensuite_bathrooms: 1, halls: 1, kitchens: 1, balconies: 1,
    floor_area: 120, floor_number: 2, storeys: 1,
    flooring_type: 'Porcelain tiles', ceiling_type: 'POP', wood_colour: 'Walnut',
    glass_panel_type: 'Tinted double-glazed', furnishing: 'fully_furnished',
    has_air_conditioning: true,
    features: ['En-suite master', 'Fitted kitchen', 'Balcony', 'Water heater'],
    base_rate_short: 950,
    base_rate_long: 12000,
    status: 'occupied',
    photos: ['1759845565036-cbecbcfcb8e2', '1754999809963-79a41e8fb648'],
  },
  {
    unit_code: 'DEMO - 3A',
    unit_type: 'apartment',
    class: 'premium',
    bedrooms: 3, bathrooms: 2, ensuite_bathrooms: 1, halls: 1, kitchens: 1, balconies: 2,
    floor_area: 150, floor_number: 3, storeys: 1,
    flooring_type: 'Ceramic tiles', ceiling_type: 'Gypsum', wood_colour: 'Natural oak',
    glass_panel_type: 'Double-glazed', furnishing: 'semi_furnished',
    has_air_conditioning: true,
    features: ['Fitted kitchen', 'Balcony', 'Study'],
    base_rate_short: 700,
    base_rate_long: 8500,
    status: 'vacant',
    photos: ['1757970326337-95d7cca56fa1', '1763827657709-b1bbc3c4945b'],
  },
  {
    unit_code: 'DEMO - 4 Penthouse',
    unit_type: 'apartment',
    class: 'luxury',
    bedrooms: 4, bathrooms: 3, ensuite_bathrooms: 2, halls: 2, kitchens: 1, balconies: 2,
    store_rooms: 1, staircases: 1,
    floor_area: 240, floor_number: 4, storeys: 2,
    flooring_type: 'Marble', ceiling_type: 'Coffered', wood_colour: 'Mahogany',
    glass_panel_type: 'Floor-to-ceiling', furnishing: 'fully_furnished',
    has_air_conditioning: true, view_orientation: 'City view',
    features: ['En-suite master', 'Walk-in wardrobe', 'Kitchen island', 'Laundry room', 'Smart lock'],
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
    // The property first — units must belong to one, or they'd be
    // invisible on the Properties page.
    const { photos: propertyPhotos, ...propertyFields } = DEMO_PROPERTY;
    const { data: property, error: propErr } = await supabase
      .from('l_properties')
      .insert({
        ...propertyFields,
        company_id: companyId,
        photo_url: PHOTO(propertyPhotos[0]),
        photo_urls: propertyPhotos.map(PHOTO),
        notes: 'Sample data — safe to delete.',
      })
      .select('id, name')
      .single();
    if (propErr) throw propErr;

    const { data: units, error: unitErr } = await supabase
      .from('l_units')
      .insert(
        DEMO_UNITS.map(({ photos, ...u }) => ({
          ...u,
          company_id: companyId,
          property_id: property.id,
          property_name: property.name,
          city: DEMO_PROPERTY.city,
          photo_url: PHOTO(photos[0]),
          photo_urls: photos.map(PHOTO),
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

    const occupied = units.find((u) => u.unit_code.includes('2B')) || units[0];

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
