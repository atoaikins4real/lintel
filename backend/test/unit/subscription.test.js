// The `evaluate` function is the single source of truth for subscription
// standing — the same logic drives both write-enforcement and the warning
// banner, so the UI can never disagree with what the API will do. It takes an
// explicit `today` so these tests are deterministic (no clock dependence).
const { evaluate, GRACE_DAYS } = require('../../src/middleware/subscription');

const TODAY = '2026-08-24';

describe('evaluate', () => {
  it('no subscription row => ok and writable (don\'t punish a gap in our own data)', () => {
    expect(evaluate(null, TODAY)).toMatchObject({ state: 'ok', writable: true });
  });

  it('cancelled => not writable, but records stay readable', () => {
    const r = evaluate({ status: 'cancelled' }, TODAY);
    expect(r.state).toBe('cancelled');
    expect(r.writable).toBe(false);
    expect(r.reason).toMatch(/cancelled/i);
  });

  it('a status with no relevant date never expires (absence != non-payment)', () => {
    expect(evaluate({ status: 'trial', trial_ends_on: null }, TODAY)).toMatchObject({ state: 'ok', writable: true });
    expect(evaluate({ status: 'active', renews_on: null }, TODAY)).toMatchObject({ state: 'ok', writable: true });
  });

  it('comfortably ahead of renewal => ok', () => {
    const r = evaluate({ status: 'active', renews_on: '2026-12-31' }, TODAY);
    expect(r.state).toBe('ok');
    expect(r.writable).toBe(true);
    expect(r.days_left).toBeGreaterThan(7);
  });

  it('within 7 days of the due date => due_soon (still writable)', () => {
    const r = evaluate({ status: 'active', renews_on: '2026-08-29' }, TODAY); // +5 days
    expect(r.state).toBe('due_soon');
    expect(r.writable).toBe(true);
    expect(r.days_left).toBe(5);
  });

  it('just past due but inside the grace window => grace (still writable)', () => {
    const r = evaluate({ status: 'active', renews_on: '2026-08-20' }, TODAY); // 4 days overdue
    expect(r.state).toBe('grace');
    expect(r.writable).toBe(true);
    expect(r.grace_days_left).toBe(GRACE_DAYS - 4);
  });

  it('the last day of grace is still writable; the day after is not', () => {
    const lastGraceDay = evaluate({ status: 'active', renews_on: '2026-08-17' }, TODAY); // exactly GRACE_DAYS overdue
    expect(lastGraceDay.writable).toBe(true);
    expect(lastGraceDay.state).toBe('grace');

    const afterGrace = evaluate({ status: 'active', renews_on: '2026-08-16' }, TODAY); // GRACE_DAYS+1 overdue
    expect(afterGrace.writable).toBe(false);
    expect(afterGrace.state).toBe('lapsed');
  });

  it('an expired trial past grace => trial_expired, not writable, with a trial-specific message', () => {
    const r = evaluate({ status: 'trial', trial_ends_on: '2026-08-01' }, TODAY);
    expect(r.state).toBe('trial_expired');
    expect(r.writable).toBe(false);
    expect(r.reason).toMatch(/trial/i);
  });
});
