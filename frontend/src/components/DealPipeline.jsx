import { useMemo, useState } from 'react';
import { updateInquiryDeal, readApiError } from '../api/client.js';
import { useSettings } from '../context/SettingsContext.jsx';

const STAGES = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'viewing', label: 'Viewing' },
  { key: 'offer', label: 'Offer' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];
const OPEN = ['new', 'contacted', 'viewing', 'offer'];
const stageOf = (i) => i.stage || (i.status === 'approved' ? 'won' : i.status === 'declined' ? 'lost' : 'new');

// Estate-agent deal pipeline — buyer enquiries as a board, New → Won/Lost, with
// pipeline value and won commission at the top. Each card can be moved between
// stages; a won deal records its commission.
export default function DealPipeline({ inquiries, canEdit, onChanged }) {
  const { money } = useSettings();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const byStage = useMemo(() => {
    const m = Object.fromEntries(STAGES.map((s) => [s.key, []]));
    for (const i of inquiries) (m[stageOf(i)] || m.new).push(i);
    return m;
  }, [inquiries]);

  const open = inquiries.filter((i) => OPEN.includes(stageOf(i)));
  const pipelineValue = open.reduce((s, i) => s + Number(i.offer_amount || 0), 0);
  const won = inquiries.filter((i) => stageOf(i) === 'won');
  const wonCommission = won.reduce((s, i) => s + Number(i.commission_amount || 0), 0);

  const move = async (i, stage) => {
    setBusy(i.id); setError('');
    try { await updateInquiryDeal(i.id, { stage }); await onChanged(); }
    catch (e) { setError(readApiError(e, 'move that deal')); }
    finally { setBusy(null); }
  };
  const saveCommission = async (i, v) => {
    setBusy(i.id); setError('');
    try { await updateInquiryDeal(i.id, { commission_amount: v }); await onChanged(); }
    catch (e) { setError(readApiError(e, 'save commission')); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Open deals" value={open.length} />
        <Stat label="Pipeline value" value={money(pipelineValue)} />
        <Stat label="Won commission" value={money(wonCommission)} sub={`${won.length} won`} />
      </div>
      {error && <div className="mb-4 lx-alert lx-alert-danger">{error}</div>}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((s) => (
          <div key={s.key} className="w-64 shrink-0">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className={`lx-eyebrow ${s.key === 'won' ? 'text-emerald-600' : s.key === 'lost' ? 'text-stone' : ''}`}>{s.label}</span>
              <span className="text-xs text-stone">{byStage[s.key].length}</span>
            </div>
            <div className="space-y-2 min-h-[48px] rounded-xl bg-panel/40 p-2">
              {byStage[s.key].map((i) => (
                <div key={i.id} className="lx-card p-3">
                  <div className="text-sm font-medium text-ink truncate">{i.name}</div>
                  <div className="text-xs text-stone truncate">{i.l_units?.unit_code}{i.l_units?.property_name ? ` · ${i.l_units.property_name}` : ''}</div>
                  <div className="text-xs text-stone truncate">{[i.email, i.phone].filter(Boolean).join(' · ') || 'No contact'}</div>
                  {i.offer_amount ? <div className="text-xs text-ink mt-1 font-medium">Offer {money(i.offer_amount)}</div> : null}
                  {s.key === 'won' && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-[11px] text-stone shrink-0">Commission</span>
                      <input type="number" defaultValue={i.commission_amount ?? ''} disabled={!canEdit || busy === i.id}
                        onBlur={(e) => { if (String(e.target.value) !== String(i.commission_amount ?? '')) saveCommission(i, e.target.value); }}
                        className="lx-input !py-1 text-xs w-24" placeholder="0" />
                    </div>
                  )}
                  {canEdit && (
                    <select disabled={busy === i.id} value={s.key} onChange={(e) => move(i, e.target.value)}
                      className="lx-select !py-1 text-xs mt-2 w-full">
                      {STAGES.map((x) => <option key={x.key} value={x.key}>Move to {x.label}</option>)}
                    </select>
                  )}
                </div>
              ))}
              {byStage[s.key].length === 0 && <div className="text-[11px] text-stone px-1 py-2 text-center">—</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="lx-card p-4">
      <div className="lx-eyebrow mb-1">{label}</div>
      <div className="font-sans font-bold text-lg text-ink">{value}</div>
      {sub && <div className="text-xs text-stone mt-0.5">{sub}</div>}
    </div>
  );
}
