const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const O = require('../ocr.js');
const E = require('../engine.js');
const D = require('../sync.js');

const TODAY = '2026-10-25';
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8');

function acct(partial) {
  return { id: partial.id, name: partial.name, balance: partial.balance, min: partial.min || 0, apr: partial.apr || 0, dueDay: partial.dueDay || null, start: partial.start || partial.balance, type: 'Credit card', ...partial };
}
function card(accountId, fields, extra) {
  return { mode: 'existing', accountId, fields, payment: { on: false }, ...extra };
}
let seq = 0;
const ids = () => 'id-' + (++seq);

test('a screenshot save records one reading, and parsing does not', () => {
  const text = 'Navy Federal\nVisa Signature Flagship Rewards\n•••• 9100\nMinimum Payment $241.01 Due 11/17/2026\nInterest Rate 18.00%\n14 Day Payoff Amount $9,718.43 Through 11/08/2026\n';
  const parsed = O.parseStatement(text, { today: TODAY });
  assert.equal(parsed.snapshots, undefined);
  const review = O.buildReview(parsed, [acct({ id: 'flag', name: 'Navy Federal Flagship 9100', balance: 9000, apr: 18, min: 200, dueDay: 12 })], []);
  assert.equal(review.snapshots, undefined);
  const untouched = O.applyScreenshotUpdate({
    accounts: [acct({ id: 'flag', name: 'Navy Federal Flagship 9100', balance: 9000, apr: 18, min: 200 })],
    payments: [], adjustments: [], snapshots: [{ id: 'kept', accountId: 'flag', month: '2026-09', capturedAt: '2026-09-02T09:00:00', balance: 9500, apr: 18, min: 200, dueDay: 12 }],
  }, [], { capturedAt: '2026-10-25T15:00:00' });
  assert.equal(untouched.snapshots.length, 1);
  assert.equal(untouched.snapshots[0].id, 'kept');

  const saved = O.applyScreenshotUpdate({
    accounts: [acct({ id: 'flag', name: 'Navy Federal Flagship 9100', balance: 9000, apr: 18, min: 200, dueDay: 12 })],
    payments: [], adjustments: [], snapshots: [],
  }, [card('flag', {
    balance: { on: true, value: 9718.43 },
    apr: { on: false, value: 18 },
    minimum: { on: true, value: 241.01 },
    dueDay: { on: true, value: 17 },
  }, { dueDate: '2026-11-17' })], { today: TODAY, capturedAt: '2026-10-25T15:04:00', id: ids });
  assert.equal(saved.snapshots.length, 1);
  assert.equal(saved.snapshots[0].accountId, 'flag');
  assert.equal(saved.snapshots[0].month, '2026-10');
  assert.equal(saved.snapshots[0].capturedAt, '2026-10-25T15:04:00');
  assert.equal(saved.snapshots[0].balance, 9718.43);
  assert.equal(saved.snapshots[0].apr, 18);
  assert.equal(saved.snapshots[0].min, 241.01);
  assert.equal(saved.snapshots[0].dueDay, 17);
  assert.equal(saved.snapshots[0].dueDate, '2026-11-17');
  assert.equal(saved.snapshots[0].creditLimit, undefined);
  assert.equal(saved.adjustments.length, 1);

  const missed = O.applyScreenshotUpdate({ accounts: [], payments: [], adjustments: [], snapshots: [] }, [{
    mode: 'create', name: '', type: 'Credit card', fields: { balance: { on: false, value: '' } }, payment: { on: false },
  }], { capturedAt: '2026-10-25T15:04:00' });
  assert.equal(missed.snapshots.length, 0);
  assert.equal(missed.accounts.length, 0);
});

test('credit limit is stored only when the screenshot reading was kept', () => {
  const state = {
    accounts: [acct({ id: 'lane', name: 'Mission Lane', balance: 1000, apr: 29.99, min: 40, last4: '6529' })],
    payments: [], adjustments: [], snapshots: [],
  };
  const skipped = O.applyScreenshotUpdate(state, [card('lane', {
    balance: { on: true, value: 1219.54 },
    creditLimit: { on: false, value: 1500 },
  })], { capturedAt: '2026-10-25T15:00:00', id: ids });
  assert.equal(skipped.snapshots[0].creditLimit, undefined);
  const kept = O.applyScreenshotUpdate(state, [card('lane', {
    balance: { on: true, value: 1219.54 },
    creditLimit: { on: true, value: 1500 },
  }, { creditLimitRead: true })], { capturedAt: '2026-10-25T15:00:00', id: ids });
  assert.equal(kept.accounts[0].creditLimit, 1500);
  assert.equal(kept.snapshots[0].creditLimit, 1500);
});

test('several readings in one month are kept, and the latest is that month', () => {
  const base = {
    accounts: [acct({ id: 'flag', name: 'Flagship', balance: 9000, apr: 18, min: 200, dueDay: 17 })],
    payments: [], adjustments: [], snapshots: [],
  };
  const first = O.applyScreenshotUpdate(base, [card('flag', { balance: { on: true, value: 9100 } })], { capturedAt: '2026-10-02T09:00:00', id: () => 'oct-early' });
  const second = O.applyScreenshotUpdate(first, [card('flag', { balance: { on: true, value: 8800 }, minimum: { on: true, value: 210 } })], { capturedAt: '2026-10-20T18:30:00', id: () => 'oct-late' });
  const third = O.applyScreenshotUpdate(second, [card('flag', { balance: { on: true, value: 8400 }, apr: { on: true, value: 17.5 } })], { capturedAt: '2026-11-03T08:00:00', id: () => 'nov' });
  assert.equal(third.snapshots.length, 3);
  assert.deepEqual(third.snapshots.map(s => s.month), ['2026-10', '2026-10', '2026-11']);
  const series = E.monthlySeries(third.snapshots, 'flag');
  assert.equal(series.length, 2);
  assert.equal(series[0].id, 'oct-late');
  assert.equal(series[0].balance, 8800);
  assert.equal(series[0].min, 210);
  assert.equal(series[0].balanceChange, null);
  assert.equal(series[1].balance, 8400);
  assert.equal(series[1].min, 210);
  assert.equal(series[1].balanceChange, -400);
  assert.equal(series[1].aprChange, -0.5);
  assert.equal(series[1].minChange, 0);
  assert.equal(E.monthlySeries(third.snapshots, 'other').length, 0);

  const withNewCard = third.snapshots.concat({ id: 'wells', accountId: 'wells', month: '2026-11', capturedAt: '2026-11-03T08:00:00', balance: 5000, apr: 27.99, min: 81, dueDay: 5 });
  const trend = E.screenshotTrend(withNewCard);
  assert.equal(trend.kind, 'change');
  assert.equal(trend.delta, -400);
  assert.equal(trend.shared, 1);
  assert.equal(E.screenshotTrend([{ id: 'only', accountId: 'flag', month: '2026-10', capturedAt: '2026-10-02T09:00:00', balance: 1, apr: 0, min: 0 }]).kind, 'start');
});

test('an old save migrates to an empty reading list and a newer reading survives sync', async () => {
  const aged = D.defaultMigrate({ v: 1, accounts: [{ id: 'a', balance: 10 }], payments: [] });
  assert.equal(aged.v, 4);
  assert.deepEqual(aged.snapshots, []);
  const reading = { id: 's', accountId: 'a', month: '2026-10', capturedAt: '2026-10-25T15:00:00', balance: 10, apr: 18, min: 25, dueDay: 17 };
  const kept = D.defaultMigrate({ v: 3, accounts: [{ id: 'a' }], payments: [], adjustments: [], snapshots: [reading], settings: {} });
  assert.deepEqual(kept.snapshots, [reading]);
  assert.equal(E.normalizeSnapshots([{ accountId: 'a', month: 'nope', capturedAt: '2026-10-25T15:00:00', balance: 1 }, reading]).length, 1);

  function memory() {
    const store = new Map();
    return { store, getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  }
  function clientFor(row) {
    const calls = [];
    return {
      calls,
      auth: { onAuthStateChange() {}, signOut: async () => {} },
      from() {
        return {
          select() { return this; }, eq() { return this; },
          maybeSingle: async () => ({ data: row.current ? JSON.parse(JSON.stringify(row.current)) : null, error: null }),
          upsert: async payload => { calls.push(JSON.parse(JSON.stringify(payload))); row.current = { data: payload.data, updated_at: payload.updated_at }; return { error: null }; },
        };
      },
    };
  }
  const row = { current: null };
  const cloud = clientFor(row);
  let state = { v: 3, accounts: [{ id: 'a', name: 'A', balance: 10, apr: 18, min: 25, start: 10 }], payments: [], adjustments: [], settings: { strategy: 'snowball' } };
  const sync = D.createSync({
    client: cloud, storage: memory(), getState: () => state, applyState: d => { state = d; },
    ask: async () => 'local', debounceMs: 20, now: () => '2026-10-25T15:00:00.000Z',
  });
  assert.equal(await sync.signedIn({ id: 'user-1' }), 'push');
  assert.equal(row.current.data.v, 4);
  assert.deepEqual(row.current.data.snapshots, []);
  state = { ...state, v: 4, snapshots: [reading], accounts: [{ ...state.accounts[0], balance: 8 }] };
  sync.changed();
  await sync.flush();
  assert.equal(row.current.data.snapshots.length, 1);
  assert.equal(row.current.data.snapshots[0].balance, 10);
  assert.equal(row.current.data.accounts[0].balance, 8);
  sync.suspend();

  const local = { v: 4, accounts: [{ id: 'a', balance: 8 }], payments: [], adjustments: [], snapshots: [], settings: {} };
  const cloudDoc = { ...local, snapshots: [reading], _sync: { rev: 3 } };
  const ahead = { uid: 'user-1', lastSynced: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', rev: 2, baseRev: 2 };
  assert.equal(D.decideMerge(local, ahead, { data: cloudDoc, updated_at: '2026-10-20T00:00:00.000Z' }, 'user-1').action, 'pull');
  const twin = { ...local, snapshots: [reading] };
  assert.equal(D.decideMerge(twin, {}, { data: { ...twin }, updated_at: '2026-10-20T00:00:00.000Z' }, 'user-1').action, 'none');
  const other = { ...twin, snapshots: [{ ...reading, balance: 4 }] };
  assert.equal(D.decideMerge(twin, {}, { data: other, updated_at: '2026-10-20T00:00:00.000Z' }, 'user-1').action, 'ask');

  const downRow = { current: { data: cloudDoc, updated_at: '2026-10-20T00:00:00.000Z' } };
  const downCloud = clientFor(downRow);
  let pulled = { accounts: [], payments: [] };
  const down = D.createSync({
    client: downCloud, storage: memory(), getState: () => pulled, applyState: d => { pulled = d; },
    ask: async () => 'cloud', debounceMs: 20,
  });
  assert.equal(await down.signedIn({ id: 'user-1' }), 'pull');
  assert.equal(pulled.snapshots[0].id, 's');
  assert.equal(pulled._sync, undefined);
  down.suspend();
});

test('sample data does not write readings into the real save', () => {
  const storage = { store: new Map(), getItem(k) { return this.store.get(k) ?? null; }, setItem(k, v) { this.store.set(k, String(v)); } };
  const json = JSON.stringify({ v: 4, snapshots: [{ id: 'sample', accountId: 'x', balance: 1 }] });
  assert.equal(D.persistAppState({ demo: true, storage, key: 'debt-killer:v1', json }), false);
  assert.equal(storage.store.has('debt-killer:v1'), false);
  const saveFn = app.slice(app.indexOf('function save()'), app.indexOf('function setDemoURL'));
  assert.ok(saveFn.indexOf('if (DEMO)') < saveFn.indexOf('localStorage'));
  assert.match(saveFn, /sessionStorage\.setItem\(DEMO_KEY/);
  const block = app.slice(app.indexOf('const stamp = DebtEngine.captureStamp'), app.indexOf('toast(chosen.length'));
  assert.match(block, /S\.snapshots = result\.snapshots/);
  assert.match(block, /noteChange\(/);
  assert.doesNotMatch(block, /localStorage/);
  assert.match(app, /normalizeSnapshots\(d\.snapshots\)/);
  assert.match(app, /JSON\.stringify\(\{ app:'debt-slayer'/);
  const project = engineSrc.slice(engineSrc.indexOf('function project('), engineSrc.indexOf('function minimumsOnly'));
  assert.doesNotMatch(project, /snapshot/);
});
