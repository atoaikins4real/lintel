import { useSettings } from '../context/SettingsContext.jsx';

// Warns before enforcement bites, and explains the read-only state if it
// already has. Mirrors backend/src/middleware/subscription.js — if you
// change the grace period or states there, change them here too.
const GRACE_DAYS = 7;

function evaluate(subscription) {
  if (!subscription) return null;
  const { status, trial_ends_on, renews_on } = subscription;

  if (status === 'cancelled') {
    return {
      tone: 'blocked',
      message: 'This subscription has been cancelled. Your records are still readable, but nothing new can be added until it is reactivated.',
    };
  }

  const dueDate = status === 'trial' ? trial_ends_on : renews_on;
  if (!dueDate) return null;

  const daysLeft = Math.round((new Date(dueDate) - new Date(new Date().toISOString().slice(0, 10))) / 86400000);

  if (daysLeft > 7) return null;

  if (daysLeft >= 0) {
    return {
      tone: 'warn',
      message:
        status === 'trial'
          ? `Your free trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Contact Lintel to choose a plan and keep adding records.`
          : `Your subscription renews in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
    };
  }

  const overdue = -daysLeft;
  if (overdue <= GRACE_DAYS) {
    const left = GRACE_DAYS - overdue;
    return {
      tone: 'warn',
      message: `Your subscription was due ${overdue} day${overdue === 1 ? '' : 's'} ago. You have ${left} day${
        left === 1 ? '' : 's'
      } left before new records are paused — everything stays readable either way.`,
    };
  }

  return {
    tone: 'blocked',
    message:
      status === 'trial'
        ? 'Your free trial has ended. Everything is still readable, but new records are paused until you choose a plan.'
        : 'This subscription is past due. Everything is still readable, but new records are paused until the balance is settled.',
  };
}

export default function SubscriptionBanner() {
  const { settings } = useSettings();
  const state = evaluate(settings?.subscription);
  if (!state) return null;

  const styles =
    state.tone === 'blocked'
      ? 'bg-rose-50 border-rose-200 text-rose-800'
      : 'bg-amber-50 border-amber-200 text-amber-800';

  return (
    <div className={`border rounded-xl px-4 py-3 text-sm mb-5 ${styles}`}>
      {state.message}
    </div>
  );
}
