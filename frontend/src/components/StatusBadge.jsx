// Generic pill for lease / payment / fault / unit statuses. Maps a status
// string to one of the theme-aware semantic pill classes (see index.css),
// so these read correctly in both light and dark themes.
const STYLES = {
  // leases
  active: 'pill-ok',
  completed: 'bg-stone/10 text-stone',
  cancelled: 'pill-danger',
  pending: 'pill-warn',
  // payments
  paid: 'pill-ok',
  partial: 'pill-warn',
  late: 'pill-danger',
  refunded: 'pill-info',
  // faults
  open: 'pill-danger',
  in_progress: 'pill-warn',
  resolved: 'pill-ok',
  // units
  vacant: 'bg-stone/10 text-stone',
  occupied: 'pill-ok',
  maintenance: 'pill-warn',
  off_market: 'pill-danger',
};

const LABELS = { resolved: 'Fixed', in_progress: 'In progress' };

export default function StatusBadge({ status }) {
  const style = STYLES[status] || 'bg-stone/10 text-stone';
  const label = LABELS[status] || String(status).replace(/_/g, ' ');
  return <span className={`pill capitalize ${style}`}>{label}</span>;
}
