import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getUnit, getUnitPerformance, getExpenses, getRenovations, getFaults } from '../api/client.js';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

export default function UnitDetail() {
  const { id } = useParams();
  const [unit, setUnit] = useState(null);
  const [perf, setPerf] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [renovations, setRenovations] = useState([]);
  const [faults, setFaults] = useState([]);

  useEffect(() => {
    getUnit(id).then(setUnit);
    getUnitPerformance(id).then(setPerf);
    getExpenses({ unit_id: id }).then(setExpenses);
    getRenovations({ unit_id: id }).then(setRenovations);
    getFaults({ unit_id: id }).then(setFaults);
  }, [id]);

  if (!unit) return <div className="text-stone">Loading&hellip;</div>;

  return (
    <div>
      {unit.photo_url ? (
        <div className="h-48 sm:h-64 w-full rounded-2xl overflow-hidden mb-5">
          <img src={unit.photo_url} alt={unit.unit_code} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-48 sm:h-64 w-full rounded-2xl bg-gradient-to-br from-ink to-ink-soft mb-5" />
      )}
      <div className="flex items-center gap-3 mb-1">
        <span className="lx-eyebrow">{unit.class}</span>
        <StatusBadge status={unit.status} />
      </div>
      <p className="text-stone text-sm mb-6">{unit.property_name}{unit.city ? ` · ${unit.city}` : ''}</p>

      {perf && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <StatCard label="Revenue" value={`GHS ${Number(perf.revenue).toLocaleString()}`} />
          <StatCard label="Costs" value={`GHS ${Number(perf.total_costs).toLocaleString()}`} />
          <StatCard label="Net Yield" value={`GHS ${Number(perf.net_yield).toLocaleString()}`} />
          <StatCard label="Occupancy" value={`${perf.occupancy_rate}%`} />
          <StatCard label="Open Faults" value={perf.open_faults} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <ListSection title="Expenses" items={expenses} render={(e) => `${e.expense_date} · ${e.category} · GHS ${e.amount}`} />
        <ListSection
          title="Renovations"
          items={renovations}
          render={(r) => `${r.description} · GHS ${r.cost}${r.rate_before && r.rate_after ? ` · GHS ${r.rate_before} → GHS ${r.rate_after}` : ''}`}
        />
        <ListSection title="Faults" items={faults} render={(f) => `${f.reported_date} · ${f.description} · ${f.severity} · ${f.status}`} />
      </div>
    </div>
  );
}

function ListSection({ title, items, render }) {
  return (
    <div className="lx-card p-5 sm:p-6">
      <div className="font-serif text-lg text-ink mb-4">{title}</div>
      {items.length ? (
        <ul className="space-y-2.5 text-sm">
          {items.map((item) => (
            <li key={item.id} className="border-b border-line/70 pb-2.5 last:border-0">{render(item)}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone">None recorded.</p>
      )}
    </div>
  );
}
