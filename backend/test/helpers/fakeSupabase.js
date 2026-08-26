// A controllable, in-memory stand-in for the Supabase service-role client.
//
// The whole backend reaches the database through exactly one seam —
// `require('../config/supabase').supabase` — so replacing that single module
// (via vi.mock) with this fake lets the real Express routes, middleware and
// billing logic run end-to-end without a live database or any network.
//
// It mimics the small slice of the supabase-js query builder the codebase
// actually uses: chainable filters (.eq/.in/.lt/...), terminal .single() /
// .maybeSingle(), await-able queries, and .insert/.update/.delete/.select.
// A test registers a handler per table that inspects the built query and
// returns { data, error, count }; every query is also recorded so a test can
// assert *how* a table was queried (e.g. that a company_id filter was
// applied — the multi-tenant isolation guarantee).
//
// This module is a singleton on purpose: the vi.hoisted() require in a test
// file and the plain require in its body resolve to the same instance, so the
// handlers a test registers are the ones the mocked module serves.

const state = {
  handlers: {}, // table -> (ctx) => { data?, error?, count? }
  calls: [], // every resolved query context, in order
  defaults: {}, // per-table handlers that survive reset() (e.g. the auth read)
};

function resolve(ctx) {
  state.calls.push(ctx);
  // A per-test handler wins; otherwise fall back to a registered default.
  const handler = state.handlers[ctx.table] || state.defaults[ctx.table];
  let result = null;
  if (typeof handler === 'function') result = handler(ctx);
  else if (handler && typeof handler === 'object') result = handler;
  result = result || {};
  return {
    data: result.data !== undefined ? result.data : null,
    error: result.error !== undefined ? result.error : null,
    count: result.count !== undefined ? result.count : null,
  };
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.method = undefined; // set by select/insert/update/delete/upsert
    this.filters = []; // [ [op, col, val], ... ]
    this.payload = undefined;
    this.selectArg = undefined;
    this.selectOpts = undefined;
    this._isSingle = false;
    this._isMaybeSingle = false;
  }

  _ctx() {
    return {
      table: this.table,
      method: this.method || 'select',
      filters: this.filters,
      payload: this.payload,
      select: this.selectArg,
      selectOpts: this.selectOpts,
      single: this._isSingle,
      maybeSingle: this._isMaybeSingle,
      // convenience: filter value by column for the first matching op
      eqValue: (col) => {
        const f = this.filters.find((x) => x[0] === 'eq' && x[1] === col);
        return f ? f[2] : undefined;
      },
      hasFilter: (op, col) => this.filters.some((x) => x[0] === op && x[1] === col),
    };
  }

  // Writes / reads
  select(arg, opts) {
    if (this.method === undefined) this.method = 'select';
    this.selectArg = arg;
    this.selectOpts = opts;
    return this;
  }
  insert(payload) { this.method = 'insert'; this.payload = payload; return this; }
  update(payload) { this.method = 'update'; this.payload = payload; return this; }
  upsert(payload) { this.method = 'upsert'; this.payload = payload; return this; }
  delete() { this.method = 'delete'; return this; }

  // Filters (all chainable, all recorded)
  eq(col, val) { this.filters.push(['eq', col, val]); return this; }
  neq(col, val) { this.filters.push(['neq', col, val]); return this; }
  in(col, val) { this.filters.push(['in', col, val]); return this; }
  lt(col, val) { this.filters.push(['lt', col, val]); return this; }
  lte(col, val) { this.filters.push(['lte', col, val]); return this; }
  gt(col, val) { this.filters.push(['gt', col, val]); return this; }
  gte(col, val) { this.filters.push(['gte', col, val]); return this; }
  is(col, val) { this.filters.push(['is', col, val]); return this; }
  contains(col, val) { this.filters.push(['contains', col, val]); return this; }
  or(expr) { this.filters.push(['or', expr]); return this; }

  // No-ops for shaping — they don't change which rows the fake returns.
  order() { return this; }
  limit() { return this; }
  range() { return this; }

  // Terminals
  maybeSingle() { this._isMaybeSingle = true; return Promise.resolve(resolve(this._ctx())); }
  single() { this._isSingle = true; return Promise.resolve(resolve(this._ctx())); }

  // Awaiting a builder that never called .single()/.maybeSingle()
  then(onFulfilled, onRejected) {
    return Promise.resolve(resolve(this._ctx())).then(onFulfilled, onRejected);
  }
  catch(onRejected) {
    return Promise.resolve(resolve(this._ctx())).catch(onRejected);
  }
}

// Storage stub — a couple of routes (uploads, documents) touch it. Enough to
// not throw; the storage paths aren't the focus of these tests.
const storageBucket = {
  upload: async () => ({ data: { path: 'fake/path' }, error: null }),
  remove: async () => ({ data: null, error: null }),
  getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/fake' } }),
  createSignedUrl: async () => ({ data: { signedUrl: 'https://example.test/signed' }, error: null }),
};

const supabase = {
  from(table) { return new QueryBuilder(table); },
  storage: { from() { return storageBucket; } },
};

module.exports = {
  supabase,
  /** Register a per-table handler: (ctx) => { data?, error?, count? } */
  table(name, handler) { state.handlers[name] = handler; },
  /** A per-table handler that survives reset() — used for the auth read that
   *  now happens on every authenticated request. A per-test `table()` still
   *  overrides it. */
  setDefault(name, handler) { state.defaults[name] = handler; },
  /** Clear per-test handlers and the call log (defaults are kept). beforeEach. */
  reset() { state.handlers = {}; state.calls = []; },
  /** Every resolved query, in order. */
  calls() { return state.calls; },
  /** Recorded queries against one table. */
  callsTo(name) { return state.calls.filter((c) => c.table === name); },
};
