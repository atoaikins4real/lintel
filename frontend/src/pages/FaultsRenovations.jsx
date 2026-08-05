import { useEffect, useState } from 'react';
import { getFaults, createFault, getRenovations, createRenovation, getUnits } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

const emptyFault = { unit_id: '', description: '', severity: 'low', caused_by: 'unknown', reported_date: '', cost: '' };
const emptyReno = { unit_id: '', description: '', cost: '', start_date: '', end_date: '', rate_before: '', rate_after: '' };

export default function FaultsRenovations() {
  const { canEdit } = useAuth();
  const { money } = useSettings();
  const [units, setUnits] = useState([]);
  const [faults, setFaults] = useState([]);
  const [renovations, setRenovations] = useState([]);
  const [faultForm, setFaultForm] = useState(emptyFault);
  const [renoForm, setRenoForm] = useState(emptyReno);
  const [showFaultForm, setShowFaultForm] = useState(false);
  const [showRenoForm, setShowRenoForm] = useState(false);

  useEffect(() => {
    getUnits().then(setUnits);
    getFaults().then(setFaults);
    getRenovations().then(setRenovations);
  }, []);

  const unitLabel = (id) => units.find((u) => u.id === id)?.unit_code || id;

  const submitFault = async (e) => {
    e.preventDefault();
    await createFault(faultForm);
    setFaultForm(emptyFault);
    setShowFaultForm(false);
    getFaults().then(setFaults);
  };

  const submitReno = async (e) => {
    e.preventDefault();
    await createRenovation(renoForm);
    setRenoForm(emptyReno);
    setShowRenoForm(false);
    getRenovations().then(setRenovations);
  };

  return (
    <div>
      <p className="text-stone text-sm mb-6">What broke, what it cost, and what it did to the unit&apos;s rate.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="font-serif text-xl text-ink">Faults</div>
            {canEdit && (
              <button onClick={() => setShowFaultForm((s) => !s)} className="lx-btn-ghost !px-3 !py-1.5 text-xs">
                {showFaultForm ? 'Cancel' : '+ Log Fault'}
              </button>
            )}
          </div>
          {canEdit && showFaultForm && (
            <form onSubmit={submitFault} className="lx-card p-5 mb-4 space-y-3">
              <select required className="lx-select" value={faultForm.unit_id}
                onChange={(e) => setFaultForm({ ...faultForm, unit_id: e.target.value })}>
                <option value="">Select unit…</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
              </select>
              <input required placeholder="Description" className="lx-input"
                value={faultForm.description} onChange={(e) => setFaultForm({ ...faultForm, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <select className="lx-select" value={faultForm.severity}
                  onChange={(e) => setFaultForm({ ...faultForm, severity: e.target.value })}>
                  <option value="low">Low</option><option value="medium">Medium</option>
                  <option value="high">High</option><option value="critical">Critical</option>
                </select>
                <select className="lx-select" value={faultForm.caused_by}
                  onChange={(e) => setFaultForm({ ...faultForm, caused_by: e.target.value })}>
                  <option value="unknown">Unknown</option><option value="tenant">Tenant</option>
                  <option value="wear_and_tear">Wear & tear</option><option value="external">External</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" className="lx-input"
                  value={faultForm.reported_date} onChange={(e) => setFaultForm({ ...faultForm, reported_date: e.target.value })} />
                <input type="number" placeholder="Repair cost" className="lx-input"
                  value={faultForm.cost} onChange={(e) => setFaultForm({ ...faultForm, cost: e.target.value })} />
              </div>
              <button className="lx-btn-gold w-full sm:w-auto">Log Fault</button>
            </form>
          )}
          <ul className="space-y-2.5">
            {faults.map((f) => (
              <li key={f.id} className="lx-card p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-ink text-sm">{unitLabel(f.unit_id)}</span>
                  <StatusBadge status={f.status} />
                </div>
                <div className="text-sm text-ink/80">{f.description}</div>
                <div className="text-stone text-xs mt-1">
                  {f.reported_date} · {f.severity} · caused by {f.caused_by.replace('_', ' ')}{f.cost ? ` · ${money(f.cost)}` : ''}
                </div>
              </li>
            ))}
            {faults.length === 0 && <p className="text-stone text-sm">No faults logged.</p>}
          </ul>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="font-serif text-xl text-ink">Renovations</div>
            {canEdit && (
              <button onClick={() => setShowRenoForm((s) => !s)} className="lx-btn-ghost !px-3 !py-1.5 text-xs">
                {showRenoForm ? 'Cancel' : '+ Log Renovation'}
              </button>
            )}
          </div>
          {canEdit && showRenoForm && (
            <form onSubmit={submitReno} className="lx-card p-5 mb-4 space-y-3">
              <select required className="lx-select" value={renoForm.unit_id}
                onChange={(e) => setRenoForm({ ...renoForm, unit_id: e.target.value })}>
                <option value="">Select unit…</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
              </select>
              <input required placeholder="Description (e.g. kitchen upgrade)" className="lx-input"
                value={renoForm.description} onChange={(e) => setRenoForm({ ...renoForm, description: e.target.value })} />
              <input type="number" required placeholder="Cost" className="lx-input"
                value={renoForm.cost} onChange={(e) => setRenoForm({ ...renoForm, cost: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" className="lx-input"
                  value={renoForm.start_date} onChange={(e) => setRenoForm({ ...renoForm, start_date: e.target.value })} />
                <input type="date" className="lx-input"
                  value={renoForm.end_date} onChange={(e) => setRenoForm({ ...renoForm, end_date: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Rate before" className="lx-input"
                  value={renoForm.rate_before} onChange={(e) => setRenoForm({ ...renoForm, rate_before: e.target.value })} />
                <input type="number" placeholder="Rate after" className="lx-input"
                  value={renoForm.rate_after} onChange={(e) => setRenoForm({ ...renoForm, rate_after: e.target.value })} />
              </div>
              <button className="lx-btn-gold w-full sm:w-auto">Log Renovation</button>
            </form>
          )}
          <ul className="space-y-2.5">
            {renovations.map((r) => (
              <li key={r.id} className="lx-card p-4">
                <div className="font-medium text-ink text-sm mb-1">{unitLabel(r.unit_id)}</div>
                <div className="text-sm text-ink/80">{r.description}</div>
                <div className="text-stone text-xs mt-1">
                  {money(r.cost)}{r.rate_before && r.rate_after ? ` · ${money(r.rate_before)} → ${money(r.rate_after)}` : ''}
                </div>
              </li>
            ))}
            {renovations.length === 0 && <p className="text-stone text-sm">No renovations logged.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
