// Shared vocabulary for property and apartment specifications.
// Defined once so the onboarding wizards, the detail pages and the public
// showcase always label and order things the same way.

export const PROPERTY_TYPES = [
  { value: 'apartment_block', label: 'Apartment block' },
  { value: 'estate', label: 'Estate' },
  { value: 'standalone_house', label: 'Standalone house' },
  { value: 'townhouse_complex', label: 'Townhouse complex' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed_use', label: 'Mixed use' },
];

export const UNIT_TYPES = ['apartment', 'house', 'townhouse', 'studio'];
export const UNIT_CLASSES = ['standard', 'premium', 'luxury'];

export const FURNISHING = [
  { value: '', label: 'Not specified' },
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi_furnished', label: 'Semi-furnished' },
  { value: 'fully_furnished', label: 'Fully furnished' },
];

export const STAIRCASE_TYPES = ['Internal', 'External', 'Spiral', 'Internal & external', 'None (single storey)'];
export const GLASS_PANEL_TYPES = ['Clear single-glazed', 'Tinted', 'Double-glazed', 'Tinted double-glazed', 'Frosted', 'Sliding glass doors', 'Floor-to-ceiling'];
export const WOOD_COLOURS = ['Natural oak', 'Walnut', 'Mahogany', 'Teak', 'Wenge', 'White', 'Grey', 'Ebony'];
export const JOINERY_MATERIALS = ['Solid wood', 'MDF', 'Plywood', 'Aluminium', 'uPVC', 'Steel'];
export const FLOORING_TYPES = ['Ceramic tiles', 'Porcelain tiles', 'Marble', 'Terrazzo', 'Hardwood', 'Laminate', 'Vinyl', 'Polished concrete'];
export const CEILING_TYPES = ['POP', 'Gypsum', 'Suspended', 'Plain plaster', 'Wood panelled', 'Coffered'];
export const ROOFING_TYPES = ['Aluminium roofing sheets', 'Clay tiles', 'Concrete slab', 'Asphalt shingles', 'Corrugated iron'];
export const WALL_MATERIALS = ['Sandcrete block', 'Concrete', 'Burnt brick', 'Prefabricated panel', 'Timber frame'];
export const EXTERIOR_FINISHES = ['Painted render', 'Stone cladding', 'Exposed brick', 'Curtain wall', 'Textured paint', 'Wood cladding'];
export const WATER_SOURCES = ['Mains', 'Borehole', 'Mains & borehole', 'Tanker delivery'];
export const POWER_BACKUP = ['None', 'Standby generator', 'Solar', 'Inverter', 'Solar & generator'];

export const AMENITIES = [
  'Borehole', 'Standby generator', 'Gated & walled', '24/7 security', 'CCTV',
  'Swimming pool', 'Gym', 'Elevator', 'Parking', 'Air conditioning',
  'Furnished', 'Backup water tank', 'Playground', 'Waste collection',
];

export const UNIT_FEATURES = [
  'En-suite master', 'Walk-in wardrobe', 'Fitted kitchen', 'Kitchen island',
  'Balcony', 'Private garden', 'Study', 'Laundry room', 'Guest toilet',
  'Water heater', 'Ceiling fans', 'Burglar-proof', 'Smart lock', 'Pet friendly',
];

// The layout counts shown as a grid on the showcase. Keys match the DB.
export const LAYOUT_FIELDS = [
  { key: 'bedrooms', label: 'Bedrooms' },
  { key: 'bathrooms', label: 'Bathrooms' },
  { key: 'ensuite_bathrooms', label: 'En-suites' },
  { key: 'halls', label: 'Halls' },
  { key: 'kitchens', label: 'Kitchens' },
  { key: 'rooms', label: 'Total rooms' },
  { key: 'balconies', label: 'Balconies' },
  { key: 'store_rooms', label: 'Store rooms' },
  { key: 'staircases', label: 'Staircases' },
  { key: 'storeys', label: 'Storeys' },
];

// Finish/fitting fields, rendered as a label/value list.
export const FINISH_FIELDS = [
  { key: 'flooring_type', label: 'Flooring' },
  { key: 'ceiling_type', label: 'Ceiling' },
  { key: 'wood_colour', label: 'Wood colour' },
  { key: 'joinery_material', label: 'Joinery' },
  { key: 'glass_panel_type', label: 'Glass panels' },
  { key: 'wall_colour', label: 'Wall colour' },
  { key: 'view_orientation', label: 'Outlook' },
];

export const BUILDING_FIELDS = [
  { key: 'storeys', label: 'Storeys' },
  { key: 'floors', label: 'Floors' },
  { key: 'staircases', label: 'Staircases' },
  { key: 'staircase_type', label: 'Staircase type' },
  { key: 'year_built', label: 'Year built' },
  { key: 'parking_spaces', label: 'Parking spaces' },
  { key: 'glass_panel_type', label: 'Glass panels' },
  { key: 'exterior_finish', label: 'Exterior finish' },
  { key: 'roofing_type', label: 'Roofing' },
  { key: 'wall_material', label: 'Walls' },
  { key: 'water_source', label: 'Water' },
  { key: 'power_backup', label: 'Power backup' },
];

export function furnishingLabel(value) {
  return FURNISHING.find((f) => f.value === value)?.label || null;
}

/** Formats floor area with its unit, e.g. "120 sqm". */
export function areaLabel(value, unit = 'sqm') {
  if (value === null || value === undefined || value === '') return null;
  return `${Number(value).toLocaleString()} ${unit || 'sqm'}`;
}
