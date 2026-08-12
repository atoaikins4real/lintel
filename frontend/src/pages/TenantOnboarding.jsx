import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createTenant, getTenant, updateTenant,
  addTenantContact, deleteTenantContact,
  addTenantOccupant, deleteTenantOccupant,
  addTenantVehicle, deleteTenantVehicle,
  completeOnboarding, readApiError,
} from '../api/client.js';
import PhotoUploader from '../components/PhotoUploader.jsx';

// Guided tenant intake. Step 1 creates the tenant record (so a Lintel ID
// exists to hang everything else off); later steps attach to it, which
// means a half-finished onboarding is resumable rather than lost.
const STEPS = ['Identity', 'Documents', 'Emergency contact', 'Occupants', 'Vehicles', 'Review'];

const ID_TYPES = ['Ghana Card', 'Passport', 'Driver’s licence', 'Voter ID', 'Other'];

export default function TenantOnboarding() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();

  const [tenantId, setTenantId] = useState(routeId || null);
  const [step, setStep] = useState(0);
  const [tenant, setTenant] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [identity, setIdentity] = useState({
    first_name: '', last_name: '', email: '', phone: '', nationality: '', date_of_birth: '',
  });
  const [docs, setDocs] = useState({
    id_document_type: '', id_document_number: '', id_document_expiry: '',
    id_document_front_url: '', id_document_back_url: '', photo_url: '',
  });
  const [contact, setContact] = useState({ name: '', relationship: '', phone: '', email: '', address: '', is_next_of_kin: true });
  const [occupant, setOccupant] = useState({ full_name: '', relationship: '', date_of_birth: '' });
  const [vehicle, setVehicle] = useState({ plate_number: '', make: '', model: '', colour: '', parking_slot: '' });

  const refresh = (tid) =>
    getTenant(tid).then((t) => {
      setTenant(t);
      setIdentity((s) => ({
        ...s,
        first_name: t.first_name || '', last_name: t.last_name || '', email: t.email || '',
        phone: t.phone || '', nationality: t.nationality || '', date_of_birth: t.date_of_birth || '',
      }));
      setDocs((s) => ({
        ...s,
        id_document_type: t.id_document_type || '', id_document_number: t.id_document_number || '',
        id_document_expiry: t.id_document_expiry || '', id_document_front_url: t.id_document_front_url || '',
        id_document_back_url: t.id_document_back_url || '', photo_url: t.photo_url || '',
      }));
      return t;
    });

  useEffect(() => {
    if (routeId) refresh(routeId).catch((err) => setError(readApiError(err, 'load this tenant')));
  }, [routeId]);

  const saveIdentity = async () => {
    setError('');
    setSaving(true);
    try {
      if (!tenantId) {
        const created = await createTenant(identity);
        setTenantId(created.id);
        await refresh(created.id);
      } else {
        await updateTenant(tenantId, identity);
        await refresh(tenantId);
      }
      setStep(1);
    } catch (err) {
      setError(readApiError(err, 'save these details'));
    } finally {
      setSaving(false);
    }
  };

  const saveDocs = async () => {
    setError('');
    setSaving(true);
    try {
      await updateTenant(tenantId, docs);
      await refresh(tenantId);
      setStep(2);
    } catch (err) {
      setError(readApiError(err, 'save the documents'));
    } finally {
      setSaving(false);
    }
  };

  const addChild = async (kind) => {
    setError('');
    setSaving(true);
    try {
      if (kind === 'contact') {
        await addTenantContact(tenantId, contact);
        setContact({ name: '', relationship: '', phone: '', email: '', address: '', is_next_of_kin: false });
      } else if (kind === 'occupant') {
        await addTenantOccupant(tenantId, occupant);
        setOccupant({ full_name: '', relationship: '', date_of_birth: '' });
      } else {
        await addTenantVehicle(tenantId, vehicle);
        setVehicle({ plate_number: '', make: '', model: '', colour: '', parking_slot: '' });
      }
      await refresh(tenantId);
    } catch (err) {
      setError(readApiError(err, `add that ${kind}`));
    } finally {
      setSaving(false);
    }
  };

  const removeChild = async (kind, childId) => {
    setError('');
    try {
      if (kind === 'contact') await deleteTenantContact(tenantId, childId);
      else if (kind === 'occupant') await deleteTenantOccupant(tenantId, childId);
      else await deleteTenantVehicle(tenantId, childId);
      await refresh(tenantId);
    } catch (err) {
      setError(readApiError(err, 'remove that'));
    }
  };

  const finish = async () => {
    setError('');
    setSaving(true);
    try {
      await completeOnboarding(tenantId);
      navigate(`/tenants/${tenantId}`);
    } catch (err) {
      setError(readApiError(err, 'complete onboarding'));
    } finally {
      setSaving(false);
    }
  };

  const canAdvance = step === 0 ? identity.first_name && identity.last_name : Boolean(tenantId);

  return (
    <div className="max-w-3xl">
      {/* Step indicator */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            disabled={i > 0 && !tenantId}
            onClick={() => setStep(i)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition ${
              i === step
                ? 'bg-ink text-white font-medium'
                : i < step
                ? 'bg-gold/10 text-gold'
                : 'bg-panel text-stone-light'
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {tenant?.lintel_id && (
        <p className="text-xs text-stone mb-4">
          Lintel ID <span className="text-ink font-medium">{tenant.lintel_id}</span> — saved. You can leave and
          come back to finish this.
        </p>
      )}

      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      {/* 1 — Identity */}
      {step === 0 && (
        <section className="lx-card p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-serif text-lg text-ink">Who is the tenant?</h2>
            <p className="text-xs text-stone">Name is all that&apos;s required to create the record — the rest can follow.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="First name" className="lx-input"
              value={identity.first_name} onChange={(e) => setIdentity({ ...identity, first_name: e.target.value })} />
            <input required placeholder="Last name" className="lx-input"
              value={identity.last_name} onChange={(e) => setIdentity({ ...identity, last_name: e.target.value })} />
            <input placeholder="Email" className="lx-input"
              value={identity.email} onChange={(e) => setIdentity({ ...identity, email: e.target.value })} />
            <input placeholder="Phone" className="lx-input"
              value={identity.phone} onChange={(e) => setIdentity({ ...identity, phone: e.target.value })} />
            <div>
              <label className="block text-xs text-stone mb-1">Date of birth</label>
              <input type="date" className="lx-input"
                value={identity.date_of_birth} onChange={(e) => setIdentity({ ...identity, date_of_birth: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-stone mb-1">Nationality</label>
              <input placeholder="e.g. Ghanaian" className="lx-input"
                value={identity.nationality} onChange={(e) => setIdentity({ ...identity, nationality: e.target.value })} />
            </div>
          </div>
          <button onClick={saveIdentity} disabled={saving || !canAdvance} className="lx-btn-primary">
            {saving ? 'Saving…' : tenantId ? 'Save & continue' : 'Create tenant & continue'}
          </button>
        </section>
      )}

      {/* 2 — Documents */}
      {step === 1 && (
        <section className="lx-card p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-serif text-lg text-ink">Identity documents</h2>
            <p className="text-xs text-stone">Upload clear photos — these are stored against the tenant for verification.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select className="lx-select" value={docs.id_document_type}
              onChange={(e) => setDocs({ ...docs, id_document_type: e.target.value })}>
              <option value="">Document type…</option>
              {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input placeholder="Document number" className="lx-input"
              value={docs.id_document_number} onChange={(e) => setDocs({ ...docs, id_document_number: e.target.value })} />
            <div>
              <label className="block text-xs text-stone mb-1">Expiry date</label>
              <input type="date" className="lx-input"
                value={docs.id_document_expiry} onChange={(e) => setDocs({ ...docs, id_document_expiry: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <DocSlot label="Tenant photo" url={docs.photo_url}
              onUpload={(u) => setDocs({ ...docs, photo_url: u })}
              onClear={() => setDocs({ ...docs, photo_url: '' })} />
            <DocSlot label="ID — front" url={docs.id_document_front_url}
              onUpload={(u) => setDocs({ ...docs, id_document_front_url: u })}
              onClear={() => setDocs({ ...docs, id_document_front_url: '' })} />
            <DocSlot label="ID — back" url={docs.id_document_back_url}
              onUpload={(u) => setDocs({ ...docs, id_document_back_url: u })}
              onClear={() => setDocs({ ...docs, id_document_back_url: '' })} />
          </div>

          <div className="flex gap-2">
            <button onClick={saveDocs} disabled={saving} className="lx-btn-primary">
              {saving ? 'Saving…' : 'Save & continue'}
            </button>
            <button onClick={() => setStep(2)} className="lx-btn-ghost">Skip for now</button>
          </div>
        </section>
      )}

      {/* 3 — Emergency contact */}
      {step === 2 && (
        <ChildStep
          title="Emergency contact & next of kin"
          hint="At least one person to reach if something happens."
          items={tenant?.contacts || []}
          renderItem={(c) => `${c.name}${c.relationship ? ` (${c.relationship})` : ''} · ${[c.phone, c.email].filter(Boolean).join(' · ') || 'no contact details'}${c.is_next_of_kin ? ' · next of kin' : ''}`}
          onRemove={(cid) => removeChild('contact', cid)}
          onAdd={() => addChild('contact')}
          canAdd={Boolean(contact.name.trim())}
          saving={saving}
          onNext={() => setStep(3)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input placeholder="Full name" className="lx-input"
              value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <input placeholder="Relationship (e.g. sister)" className="lx-input"
              value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} />
            <input placeholder="Phone" className="lx-input"
              value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            <input placeholder="Email" className="lx-input"
              value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            <input placeholder="Address" className="lx-input sm:col-span-2"
              value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} />
            <label className="flex items-center gap-2 text-xs text-stone sm:col-span-2">
              <input type="checkbox" className="rounded border-line accent-ink"
                checked={contact.is_next_of_kin}
                onChange={(e) => setContact({ ...contact, is_next_of_kin: e.target.checked })} />
              This person is the next of kin
            </label>
          </div>
        </ChildStep>
      )}

      {/* 4 — Occupants */}
      {step === 3 && (
        <ChildStep
          title="Other occupants"
          hint="Everyone else who will be living in the unit."
          items={tenant?.occupants || []}
          renderItem={(o) => `${o.full_name}${o.relationship ? ` (${o.relationship})` : ''}${o.date_of_birth ? ` · born ${o.date_of_birth}` : ''}`}
          onRemove={(cid) => removeChild('occupant', cid)}
          onAdd={() => addChild('occupant')}
          canAdd={Boolean(occupant.full_name.trim())}
          saving={saving}
          onNext={() => setStep(4)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input placeholder="Full name" className="lx-input"
              value={occupant.full_name} onChange={(e) => setOccupant({ ...occupant, full_name: e.target.value })} />
            <input placeholder="Relationship" className="lx-input"
              value={occupant.relationship} onChange={(e) => setOccupant({ ...occupant, relationship: e.target.value })} />
            <div>
              <label className="block text-xs text-stone mb-1">Date of birth</label>
              <input type="date" className="lx-input"
                value={occupant.date_of_birth} onChange={(e) => setOccupant({ ...occupant, date_of_birth: e.target.value })} />
            </div>
          </div>
        </ChildStep>
      )}

      {/* 5 — Vehicles */}
      {step === 4 && (
        <ChildStep
          title="Vehicles"
          hint="Used for parking allocation and gate access."
          items={tenant?.vehicles || []}
          renderItem={(v) => `${v.plate_number} · ${[v.colour, v.make, v.model].filter(Boolean).join(' ') || 'no details'}${v.parking_slot ? ` · slot ${v.parking_slot}` : ''}`}
          onRemove={(cid) => removeChild('vehicle', cid)}
          onAdd={() => addChild('vehicle')}
          canAdd={Boolean(vehicle.plate_number.trim())}
          saving={saving}
          onNext={() => setStep(5)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input placeholder="Plate number" className="lx-input"
              value={vehicle.plate_number} onChange={(e) => setVehicle({ ...vehicle, plate_number: e.target.value })} />
            <input placeholder="Make" className="lx-input"
              value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} />
            <input placeholder="Model" className="lx-input"
              value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} />
            <input placeholder="Colour" className="lx-input"
              value={vehicle.colour} onChange={(e) => setVehicle({ ...vehicle, colour: e.target.value })} />
            <input placeholder="Parking slot" className="lx-input"
              value={vehicle.parking_slot} onChange={(e) => setVehicle({ ...vehicle, parking_slot: e.target.value })} />
          </div>
        </ChildStep>
      )}

      {/* 6 — Review */}
      {step === 5 && tenant && (
        <section className="lx-card p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-serif text-lg text-ink">Review</h2>
            <p className="text-xs text-stone">Anything blank can still be filled in later from the tenant&apos;s page.</p>
          </div>

          <ReviewRow label="Name" value={`${tenant.first_name} ${tenant.last_name}`} />
          <ReviewRow label="Lintel ID" value={tenant.lintel_id} />
          <ReviewRow label="Contact" value={[tenant.email, tenant.phone].filter(Boolean).join(' · ')} />
          <ReviewRow label="Date of birth" value={tenant.date_of_birth} />
          <ReviewRow label="ID document" value={[tenant.id_document_type, tenant.id_document_number].filter(Boolean).join(' · ')} />
          <ReviewRow
            label="Documents on file"
            value={[
              tenant.photo_url && 'photo',
              tenant.id_document_front_url && 'ID front',
              tenant.id_document_back_url && 'ID back',
            ].filter(Boolean).join(', ')}
          />
          <ReviewRow label="Emergency contacts" value={`${tenant.contacts?.length || 0} recorded`} />
          <ReviewRow label="Other occupants" value={`${tenant.occupants?.length || 0} recorded`} />
          <ReviewRow label="Vehicles" value={`${tenant.vehicles?.length || 0} recorded`} />

          <div className="flex gap-2 pt-2">
            <button onClick={finish} disabled={saving} className="lx-btn-primary">
              {saving ? 'Finishing…' : 'Complete onboarding'}
            </button>
            <button onClick={() => navigate(`/tenants/${tenantId}`)} className="lx-btn-ghost">
              Finish later
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function DocSlot({ label, url, onUpload, onClear }) {
  return (
    <div>
      <div className="lx-eyebrow mb-1.5">{label}</div>
      {url ? (
        <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-line mb-1.5">
          <img src={url} alt={label} className="w-full h-full object-cover" />
          <button
            type="button" onClick={onClear}
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink/70 text-white text-xs flex items-center justify-center"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="aspect-[4/3] rounded-lg border border-dashed border-line bg-panel/50 flex items-center justify-center text-[11px] text-stone-light mb-1.5">
          Not uploaded
        </div>
      )}
      <PhotoUploader onUploaded={(urls) => onUpload(urls[0])} label="Upload" />
    </div>
  );
}

function ChildStep({ title, hint, items, renderItem, onRemove, onAdd, canAdd, saving, onNext, children }) {
  return (
    <section className="lx-card p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="font-serif text-lg text-ink">{title}</h2>
        <p className="text-xs text-stone">{hint}</p>
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 text-sm bg-panel/60 rounded-lg px-3 py-2">
              <span className="flex-1 min-w-0 text-ink">{renderItem(item)}</span>
              <button
                type="button" onClick={() => onRemove(item.id)}
                className="text-xs text-stone hover:text-rose-700 shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {children}

      <div className="flex gap-2">
        <button type="button" onClick={onAdd} disabled={saving || !canAdd} className="lx-btn-gold">
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button type="button" onClick={onNext} className="lx-btn-ghost">
          {items.length ? 'Continue' : 'Skip for now'}
        </button>
      </div>
    </section>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex items-start gap-3 text-sm border-b border-line/70 pb-2.5 last:border-0">
      <span className="text-stone w-40 shrink-0">{label}</span>
      <span className={value ? 'text-ink' : 'text-stone-light'}>{value || 'Not provided'}</span>
    </div>
  );
}
