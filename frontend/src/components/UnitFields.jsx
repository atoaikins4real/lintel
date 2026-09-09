// The input sections for a single apartment/unit, without any wizard chrome.
//
// Extracted so the standalone unit wizard (/units/onboard) and the unified
// "add a property + its units" flow render the SAME fields the same way,
// instead of two copies drifting apart. Purely presentational: it owns no
// state — the parent passes `form`, a `set(patch)` updater and a
// `toggleFeature(value)` toggler, exactly the shape both callers already use.
import PhotoUploader from './PhotoUploader.jsx';
import { NumField, ComboField, ChipGroup } from './WizardShell.jsx';
import Field, { TextField } from './Field.jsx';
import {
  UNIT_TYPES, UNIT_CLASSES, FURNISHING, UNIT_FEATURES,
  GLASS_PANEL_TYPES, WOOD_COLOURS, JOINERY_MATERIALS, FLOORING_TYPES, CEILING_TYPES,
} from '../data/specs.js';

// The blank unit draft. Kept here so every caller starts from one definition
// (the create/update field list must not drift — that's how photo_urls got
// dropped once before).
export const EMPTY_UNIT = {
  unit_code: '', unit_type: 'apartment', class: 'standard', description: '', status: 'vacant',
  bedrooms: '', bathrooms: '', ensuite_bathrooms: '', halls: '', kitchens: '',
  rooms: '', balconies: '', store_rooms: '', staircases: '', storeys: '',
  floor_area: '', floor_area_unit: 'sqm', floor_number: '',
  glass_panel_type: '', wood_colour: '', joinery_material: '',
  flooring_type: '', ceiling_type: '', wall_colour: '', view_orientation: '',
  furnishing: '', has_air_conditioning: false, features: [],
  base_rate_short: '', base_rate_long: '',
  listing_type: 'rent', sale_price: '', sale_status: 'available',
  photo_urls: [], photo_url: '',
};

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <div className="lx-eyebrow">{title}</div>
      {children}
    </div>
  );
}

export default function UnitFields({ form, set, toggleFeature, currency }) {
  return (
    <div className="space-y-6">
      <Section title="Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Unit reference"
            className="sm:col-span-2"
            hint="e.g. Block A - 4B, or the house name"
            value={form.unit_code}
            onChange={(e) => set({ unit_code: e.target.value })}
          />
          <Field label="Type">
            <select className="lx-select" value={form.unit_type} onChange={(e) => set({ unit_type: e.target.value })}>
              {UNIT_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Class">
            <select className="lx-select" value={form.class} onChange={(e) => set({ class: e.target.value })}>
              {UNIT_CLASSES.map((c) => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description" hint="What a prospect reads on your shared link">
          <textarea
            className="lx-textarea" rows={2}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Layout">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <NumField label="Bedrooms" value={form.bedrooms} onChange={(v) => set({ bedrooms: v })} />
          <NumField label="Bathrooms" value={form.bathrooms} onChange={(v) => set({ bathrooms: v })} />
          <NumField label="En-suites" value={form.ensuite_bathrooms} onChange={(v) => set({ ensuite_bathrooms: v })} />
          <NumField label="Halls / living" value={form.halls} onChange={(v) => set({ halls: v })} />
          <NumField label="Kitchens" value={form.kitchens} onChange={(v) => set({ kitchens: v })} />
          <NumField label="Balconies" value={form.balconies} onChange={(v) => set({ balconies: v })} />
          <NumField label="Store rooms" value={form.store_rooms} onChange={(v) => set({ store_rooms: v })} />
          <NumField label="Total rooms" value={form.rooms} onChange={(v) => set({ rooms: v })} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <NumField label="Storeys (1 = flat, 2 = duplex)" value={form.storeys} onChange={(v) => set({ storeys: v })} />
          <NumField label="Internal staircases" value={form.staircases} onChange={(v) => set({ staircases: v })} />
          <NumField label="Floor number" value={form.floor_number} onChange={(v) => set({ floor_number: v })} />
        </div>
      </Section>

      <Section title="Size">
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <NumField label="Floor area" value={form.floor_area} onChange={(v) => set({ floor_area: v })} placeholder="e.g. 120" />
          <Field label="Unit">
            <select className="lx-select" value={form.floor_area_unit} onChange={(e) => set({ floor_area_unit: e.target.value })}>
              <option value="sqm">sqm</option>
              <option value="sqft">sqft</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Finishes & fittings">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ComboField label="Flooring" value={form.flooring_type} onChange={(v) => set({ flooring_type: v })} options={FLOORING_TYPES} />
          <ComboField label="Ceiling" value={form.ceiling_type} onChange={(v) => set({ ceiling_type: v })} options={CEILING_TYPES} />
          <ComboField label="Wood colour" value={form.wood_colour} onChange={(v) => set({ wood_colour: v })} options={WOOD_COLOURS} />
          <ComboField label="Joinery material" value={form.joinery_material} onChange={(v) => set({ joinery_material: v })} options={JOINERY_MATERIALS} />
          <ComboField label="Glass panels" value={form.glass_panel_type} onChange={(v) => set({ glass_panel_type: v })} options={GLASS_PANEL_TYPES} />
          <ComboField label="Wall colour" value={form.wall_colour} onChange={(v) => set({ wall_colour: v })} options={['White', 'Off-white', 'Grey', 'Beige', 'Cream']} />
          <ComboField label="Outlook / view" value={form.view_orientation} onChange={(v) => set({ view_orientation: v })}
            options={['Sea view', 'Garden facing', 'Street facing', 'Courtyard', 'City view', 'Pool view']} />
          <Field label="Furnishing">
            <select className="lx-select" value={form.furnishing} onChange={(e) => set({ furnishing: e.target.value })}>
              {FURNISHING.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-stone">
          <input type="checkbox" className="rounded border-line accent-ink"
            checked={form.has_air_conditioning}
            onChange={(e) => set({ has_air_conditioning: e.target.checked })} />
          Air conditioning fitted
        </label>
      </Section>

      <Section title="Features">
        <ChipGroup options={UNIT_FEATURES} selected={form.features} onToggle={toggleFeature} />
      </Section>

      <Section title="Pricing & availability">
        <div>
          <label className="block text-xs text-stone mb-1.5">This unit is offered for</label>
          <div className="flex gap-2 flex-wrap">
            {[
              { value: 'rent', label: 'Rent only' },
              { value: 'sale', label: 'Sale only' },
              { value: 'both', label: 'Rent or sale' },
            ].map((o) => (
              <button
                key={o.value} type="button" onClick={() => set({ listing_type: o.value })}
                className={`px-4 py-2 rounded-xl text-sm border transition ${
                  form.listing_type === o.value
                    ? 'border-gold bg-gold/10 text-ink font-medium'
                    : 'border-line text-stone hover:border-stone/40'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {form.listing_type !== 'sale' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NumField label={`Nightly rate (${currency})`} value={form.base_rate_short} onChange={(v) => set({ base_rate_short: v })} />
            <NumField label={`Monthly rate (${currency})`} value={form.base_rate_long} onChange={(v) => set({ base_rate_long: v })} />
          </div>
        )}

        {form.listing_type !== 'rent' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NumField label={`Asking price (${currency})`} value={form.sale_price} onChange={(v) => set({ sale_price: v })} placeholder="e.g. 950000" />
            <Field label="Sale status">
              <select className="lx-select" value={form.sale_status} onChange={(e) => set({ sale_status: e.target.value })}>
                <option value="available">Available</option>
                <option value="under_offer">Under offer</option>
                <option value="sold">Sold</option>
              </select>
            </Field>
          </div>
        )}

        <Field label="Occupancy status" className="sm:max-w-xs">
          <select className="lx-select" value={form.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="vacant">Vacant</option>
            <option value="occupied">Occupied</option>
            <option value="maintenance">Maintenance</option>
            <option value="off_market">Off market (hidden from showcase)</option>
          </select>
        </Field>
      </Section>

      <Section title="Photos">
        <PhotoUploader
          onUploaded={(urls) => set({ photo_urls: [...form.photo_urls, ...urls], photo_url: form.photo_url || urls[0] })}
        />
        {form.photo_urls.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {form.photo_urls.map((url) => (
              <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-line">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button type="button"
                  onClick={() => set({ photo_urls: form.photo_urls.filter((u) => u !== url) })}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink/70 text-white text-xs flex items-center justify-center">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
