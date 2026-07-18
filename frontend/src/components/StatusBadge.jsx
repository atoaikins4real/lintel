// Generic pill for lease / payment / fault statuses, and anything else
// that maps a status string to a semantic color.
const STYLES = {
  // leases
  active: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-stone/10 text-stone',
  cancelled: 'bg-rose-50 text-rose-700',
  pending: 'bg-amber-50 text-amber-700',
  // payments
  paid: 'bg-emerald-50 text-emerald-700',
  partial: 'bg-amber-50 text-amber-700',
  late: 'bg-rose-50 text-rose-700',
  refunded: 'bg-sky-50 text-sky-700',
  // faults
  open: 'bg-rose-50 text-rose-700',
  in_progress: 'bg-amber-50 text-amber-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  // units
  vacant: 'bg-stone/10 text-stone',
  occupied: 'bg-emerald-50 text-emerald-700',
  maintenance: 'bg-amber-50 text-amber-700',
  off_market: 'bg-rose-50 text-rose-700',
};

export default function StatusBadge({ status }) {
  const style = STYLES[status] || 'bg-stone/10 text-stone';
  return <span className={`pill capitalize ${style}`}>{String(status).replace(/_/g, ' ')}</span>;
}
