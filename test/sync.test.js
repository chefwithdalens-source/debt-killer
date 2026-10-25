const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../sync.js');
const Engine = require('../engine.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');

function memory() {
  const store = new Map();
  return {
    store,
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const acct = (id, balance) => ({ id, name: id, balance, apr: 18, min: 25, start: balance });
const state = (id, balance, extra) => ({ v: 3, accounts: [acct(id, balance)], payments: [], adjustments: [], settings: { strategy: 'snowball' }, ...extra });

function cloudKit() {
  let row = null;
  let failUpserts = 0;
  let failReads = 0;
  const calls = [];
  let reads = 0;
  const client = {
    auth: {
      onAuthStateChange() {},
      signInWithOtp: async () => ({ error: null }),
      signOut: async () => { client.auth.signedOut += 1; },
      signedOut: 0,
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => {
          reads += 1;
          if (failReads > 0) { failReads -= 1; return { data: null, error: { message: 'offline' } }; }
          return { data: row ? JSON.parse(JSON.stringify(row)) : null, error: null };
        },
        upsert: async payload => {
          const copy = JSON.parse(JSON.stringify(payload));
          calls.push(copy);
          if (failUpserts > 0) { failUpserts -= 1; return { error: { message: 'offline' } }; }
          row = { data: copy.data, updated_at: copy.updated_at };
          return { error: null };
        },
      };
    },
  };
  return {
    client, calls,
    get row() { return row; },
    set row(v) { row = v; },
    get reads() { return reads; },
    failUpserts(n) { failUpserts = n; },
    failReads(n) { failReads = n; },
  };
}

function harness(cloud, opts = {}) {
  const storage = opts.storage || memory();
  let current = opts.state || state('local', 100);
  const applied = [];
  const asks = [];
  let clock = opts.clock || (() => '2026-06-01T00:00:00.000Z');
  const sync = D.createSync({
    client: cloud.client,
    storage,
    getState: () => current,
    applyState: d => { current = d; applied.push(d); },
    ask: opts.ask || (async info => { asks.push(info); return opts.pick || 'local'; }),
    migrate: opts.migrate,
    debounceMs: opts.debounceMs ?? 20,
    retryBaseMs: opts.retryBaseMs ?? 20,
    retryCapMs: opts.retryCapMs ?? 80,
    now: () => clock(),
  });
  return {
    sync, storage, asks, applied,
    get state() { return current; },
    set state(v) { current = v; },
    set clock(fn) { clock = fn; },
  };
}

test('decideMerge: first sign-in asks when both sides have different data', () => {
  const local = state('phone', 400);
  const cloud = { data: state('laptop', 900), updated_at: '2026-08-01T00:00:00.000Z' };
  const d = D.decideMerge(local, { updatedAt: '2026-07-01T00:00:00.000Z', rev: 0, baseRev: 0 }, cloud, 'user-1');
  assert.equal(d.action, 'ask');
  assert.equal(d.prefer, 'cloud');
  const olderCloud = { data: state('laptop', 900), updated_at: '2020-01-01T00:00:00.000Z' };
  const hinted = D.decideMerge(local, { updatedAt: '2026-07-01T00:00:00.000Z' }, olderCloud, 'user-1');
  assert.equal(hinted.action, 'ask');
  assert.equal(hinted.prefer, 'local');
});

test('decideMerge: empty sides upload or download, and identical copies do nothing', () => {
  const local = state('phone', 400);
  assert.deepEqual(D.decideMerge(local, {}, null, 'user-1'), { action: 'push' });
  assert.deepEqual(D.decideMerge({ accounts: [], payments: [] }, {}, { data: state('c', 1), updated_at: '2026-01-01T00:00:00.000Z' }, 'u'), { action: 'pull' });
  assert.deepEqual(D.decideMerge({ accounts: [], payments: [] }, {}, null, 'u'), { action: 'none' });
  const twin = state('phone', 400);
  twin._sync = { rev: 4 };
  assert.equal(D.decideMerge(local, {}, { data: twin, updated_at: '2026-01-01T00:00:00.000Z' }, 'u').action, 'none');
});

test('decideMerge: a clean device follows a higher revision even when the cloud clock is older', () => {
  const meta = { uid: 'u', lastSynced: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z', rev: 2, baseRev: 2 };
  const cloud = { data: { ...state('phone', 50), _sync: { rev: 3 } }, updated_at: '2020-01-01T00:00:00.000Z' };
  assert.equal(D.decideMerge(state('phone', 80), meta, cloud, 'u').action, 'pull');
  assert.equal(D.shouldPull(meta, cloud), true);
});

test('decideMerge: a future timestamp at the same revision does not win', () => {
  const meta = { uid: 'u', lastSynced: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z', rev: 2, baseRev: 2 };
  const cloud = { data: { ...state('other', 1), _sync: { rev: 2 } }, updated_at: '2099-01-01T00:00:00.000Z' };
  const d = D.decideMerge(state('phone', 80), meta, cloud, 'u');
  assert.equal(d.action, 'ask');
  assert.equal(D.shouldPull(meta, cloud), false);
  const dirty = { ...meta, rev: 3, updatedAt: '2026-05-02T00:00:00.000Z' };
  assert.equal(D.decideMerge(state('phone', 81), dirty, { data: { ...state('phone', 80), _sync: { rev: 2 } }, updated_at: '2099-01-01T00:00:00.000Z' }, 'u').action, 'push');
});

test('decideMerge: legacy meta without a revision still refuses a dirty overwrite', () => {
  const cloud = { data: state('cloud', 10), updated_at: '2026-04-02T00:00:00.000Z' };
  const clean = { uid: 'u', lastSynced: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z' };
  assert.equal(D.decideMerge(state('old', 1), clean, cloud, 'u').action, 'pull');
  const dirty = { uid: 'u', lastSynced: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-03T00:00:00.000Z' };
  assert.equal(D.decideMerge(state('old', 1), dirty, cloud, 'u').action, 'ask');
  assert.equal(D.shouldPull(clean, cloud), true);
  assert.equal(D.shouldPull(dirty, cloud), false);
});

test('decideMerge: a tombstone is not an empty cloud an older device may refill', () => {
  const tomb = { data: { ...state('x', 0), accounts: [], _sync: { rev: 5, tombstone: true } }, updated_at: '2026-01-01T00:00:00.000Z' };
  tomb.data.accounts = [];
  const fresh = D.decideMerge(state('stale', 20), {}, tomb, 'u');
  assert.equal(fresh.action, 'ask');
  const clean = { uid: 'u', lastSynced: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', rev: 4, baseRev: 4 };
  assert.equal(D.decideMerge(state('stale', 20), clean, tomb, 'u').action, 'pull');
  assert.equal(D.shouldPull(clean, tomb), true);
});

test('first sign-in uploads local-only data and downloads cloud-only data', async () => {
  const up = cloudKit();
  const a = harness(up, { state: state('phone', 400) });
  assert.equal(await a.sync.signedIn({ id: 'user-1', email: 'a@example.com' }), 'push');
  assert.equal(up.row.data.accounts[0].id, 'phone');
  assert.equal(up.row.data._sync.rev, 1);
  assert.equal(up.row.data.v, 3);
  assert.equal(a.sync.readMeta().baseRev, 1);
  a.sync.suspend();

  const down = cloudKit();
  down.row = { data: { ...state('laptop', 900), _sync: { rev: 3 } }, updated_at: '2026-02-01T00:00:00.000Z' };
  const b = harness(down, { state: { accounts: [], payments: [] } });
  assert.equal(await b.sync.signedIn({ id: 'user-1' }), 'pull');
  assert.equal(b.state.accounts[0].id, 'laptop');
  assert.equal(b.state._sync, undefined);
  assert.equal(b.storage.store.has(D.BACKUP), false);
  assert.equal(down.calls.length, 0);
  b.sync.suspend();
});

test('first sign-in with both copies asks and does not upload before the choice', async () => {
  const cloud = cloudKit();
  cloud.row = { data: { ...state('laptop', 900), _sync: { rev: 2 } }, updated_at: '2026-03-01T00:00:00.000Z' };
  let release;
  const gate = new Promise(r => { release = r; });
  const h = harness(cloud, {
    state: state('phone', 400),
    ask: () => gate,
  });
  const pending = h.sync.signedIn({ id: 'user-1' });
  await sleep(40);
  assert.equal(cloud.calls.length, 0);
  assert.equal(h.state.accounts[0].id, 'phone');
  release('cloud');
  assert.equal(await pending, 'ask');
  assert.equal(h.state.accounts[0].id, 'laptop');
  assert.equal(cloud.calls.length, 0);
  const backups = JSON.parse(h.storage.store.get(D.BACKUP));
  assert.equal(backups.length, 1);
  assert.equal(backups[0].data.accounts[0].id, 'phone');
  assert.equal(backups[0].reason, 'reconcile');
  h.sync.suspend();
});

test('choosing this device uploads it as a newer revision', async () => {
  const cloud = cloudKit();
  cloud.row = { data: { ...state('laptop', 900), _sync: { rev: 2 } }, updated_at: '2026-03-01T00:00:00.000Z' };
  const h = harness(cloud, { state: state('phone', 400), pick: 'local' });
  assert.equal(await h.sync.signedIn({ id: 'user-1' }), 'ask');
  assert.equal(cloud.row.data.accounts[0].id, 'phone');
  assert.equal(cloud.row.data._sync.rev, 3);
  assert.equal(h.state.accounts[0].balance, 400);
  h.sync.suspend();
});

test('two devices that edit offline ask instead of clobbering', async () => {
  const cloud = cloudKit();
  const a = harness(cloud, { state: state('shared', 100), retryBaseMs: 60000, retryCapMs: 60000 });
  await a.sync.signedIn({ id: 'user-1' });
  const b = harness(cloud, { state: { accounts: [], payments: [] }, pick: 'local', retryBaseMs: 60000, retryCapMs: 60000 });
  await b.sync.signedIn({ id: 'user-1' });
  assert.equal(b.state.accounts[0].balance, 100);

  cloud.failUpserts(4);
  a.state = state('shared', 150);
  a.sync.changed();
  await assert.rejects(() => a.sync.flush());
  b.state = state('shared', 250);
  b.sync.changed();
  await assert.rejects(() => b.sync.flush());
  assert.equal(cloud.row.data.accounts[0].balance, 100);
  assert.equal(a.sync.readMeta().baseRev, 1);
  assert.equal(b.sync.readMeta().baseRev, 1);

  cloud.failUpserts(0);
  await a.sync.flush();
  assert.equal(cloud.row.data.accounts[0].balance, 150);
  assert.equal(cloud.row.data._sync.rev, 2);

  b.asks.length = 0;
  await b.sync.flush();
  assert.equal(b.asks.length, 1);
  assert.equal(cloud.row.data.accounts[0].balance, 250);
  assert.ok(cloud.row.data._sync.rev > 2);
  const kept = JSON.parse(b.storage.store.get(D.BACKUP) || '[]');
  assert.equal(kept.length, 0);
  a.sync.suspend();
  b.sync.suspend();
});

test('a stale tab cannot overwrite a newer revision from the same browser profile', async () => {
  const cloud = cloudKit();
  const storage = memory();
  const a = harness(cloud, { storage, state: state('shared', 100) });
  const b = harness(cloud, { storage, state: state('shared', 100), pick: 'cloud' });
  await a.sync.signedIn({ id: 'user-1' });
  await b.sync.signedIn({ id: 'user-1' });
  a.state = state('shared', 180);
  a.sync.changed();
  await a.sync.flush();
  assert.equal(cloud.row.data._sync.rev, 2);
  assert.equal(storage.store.get(D.META) && JSON.parse(storage.store.get(D.META)).baseRev, 2);

  const before = cloud.calls.length;
  b.state = state('shared', 100);
  b.sync.changed();
  await b.sync.flush();
  assert.equal(cloud.calls.length, before);
  assert.equal(cloud.row.data.accounts[0].balance, 180);
  assert.equal(b.state.accounts[0].balance, 180);
  const backups = JSON.parse(b.storage.store.get(D.BACKUP));
  assert.equal(backups.at(-1).data.accounts[0].balance, 100);
  a.sync.suspend();
  b.sync.suspend();
});

test('erase writes a tombstone before the local copy is dropped, and local-only erase leaves the cloud', async () => {
  const cloud = cloudKit();
  const h = harness(cloud, { state: state('phone', 400) });
  await h.sync.signedIn({ id: 'user-1' });
  const rev = cloud.row.data._sync.rev;
  cloud.failUpserts(1);
  await assert.rejects(() => h.sync.clearCloud());
  assert.equal(h.state.accounts[0].id, 'phone');
  assert.equal(cloud.row.data._sync.tombstone, undefined);
  assert.equal(cloud.row.data._sync.rev, rev);

  cloud.failUpserts(0);
  await h.sync.clearCloud();
  assert.equal(cloud.row.data._sync.tombstone, true);
  assert.equal(cloud.row.data.accounts.length, 0);
  assert.ok(cloud.row.data._sync.rev > rev);
  assert.equal(h.state.accounts[0].id, 'phone');

  const other = harness(cloud, { state: state('stale', 400), pick: 'cloud' });
  const choice = await other.sync.signedIn({ id: 'user-1' });
  assert.equal(choice, 'ask');
  assert.notEqual(cloud.row.data.accounts[0] && cloud.row.data.accounts[0].id, 'stale');
  other.sync.suspend();

  const localOnly = harness(cloud, { state: state('kept', 10) });
  cloud.row = { data: { ...state('cloud', 10), _sync: { rev: 1 } }, updated_at: '2026-01-01T00:00:00.000Z' };
  await localOnly.sync.signedIn({ id: 'user-2' });
  const snapshot = JSON.stringify(cloud.row.data);
  localOnly.sync.changed();
  await localOnly.sync.signOut({ flush: false });
  await sleep(50);
  assert.equal(JSON.stringify(cloud.row.data), snapshot);
  assert.equal(localOnly.sync.user, null);
  localOnly.sync.suspend();
  h.sync.suspend();
});

test('the erase handler clears the cloud first and does not blank the device when that write fails', () => {
  const erase = app.slice(app.indexOf("sh.querySelector('#eraseBtn')"), app.indexOf('revert unsaved'));
  assert.match(erase, /clearCloud/);
  assert.ok(erase.indexOf('clearCloud') < erase.indexOf('removeItem(KEY)'));
  assert.equal(erase.includes('S = blank(); save()'), false);
  assert.match(erase, /signOut\(\{ flush: false \}\)/);
  assert.match(erase, /still on this device/);
});

test('sign-out flushes pending edits and keeps them when the flush fails', async () => {
  const cloud = cloudKit();
  const h = harness(cloud, { state: state('phone', 100), debounceMs: 500 });
  await h.sync.signedIn({ id: 'user-1' });
  h.state = state('phone', 175);
  h.sync.changed();
  assert.equal(cloud.client.auth.signedOut, 0);
  await h.sync.signOut();
  assert.equal(cloud.client.auth.signedOut, 1);
  assert.equal(cloud.row.data.accounts[0].balance, 175);
  assert.equal(h.sync.user, null);
  assert.equal(h.sync.readMeta().uid, null);
  assert.equal(h.state.accounts[0].balance, 175);

  const again = harness(cloud, { state: state('phone', 175), debounceMs: 500, retryBaseMs: 60000, retryCapMs: 60000 });
  await again.sync.signedIn({ id: 'user-1' });
  again.state = state('phone', 190);
  again.sync.changed();
  cloud.failUpserts(1);
  await assert.rejects(() => again.sync.signOut());
  assert.equal(again.sync.user.id, 'user-1');
  assert.equal(again.state.accounts[0].balance, 190);
  assert.notEqual(cloud.row.data.accounts[0].balance, 190);
  again.sync.suspend();
  h.sync.suspend();
});

test('demo mode never syncs', async () => {
  const cloud = cloudKit();
  cloud.row = { data: state('cloud', 1), updated_at: '2026-01-01T00:00:00.000Z' };
  const h = harness(cloud, { state: state('real', 5) });
  h.sync.suspend();
  h.state = state('sample', 9);
  h.sync.changed();
  await sleep(40);
  assert.equal(cloud.calls.length, 0);
  assert.equal(cloud.reads, 0);
  assert.equal(await h.sync.refresh(), false);
  assert.equal(await h.sync.signedIn({ id: 'user-1' }), 'suspended');
  assert.equal(cloud.reads, 0);
  await h.sync.flush();
  assert.equal(h.state.accounts[0].id, 'sample');
  assert.equal(h.storage.store.has('debt-killer:v1'), false);
  assert.match(app, /if \(SYNC\) SYNC\.suspend\(\)/);
  assert.match(app, /migrate:\s*d => normalize\(d\) \|\| d/);
});

test('schema migration runs on the way up and on the way down', async () => {
  const v1 = {
    accounts: [{ id: 'card', name: 'Card', balance: 500, apr: 18, min: 25, start: 500, created: '2026-01-01' }],
    payments: [{ id: 'p', accountId: 'card', amount: 100, date: '2026-02-01' }],
    settings: { strategy: 'snowball' },
  };
  function migrate(d) {
    return {
      v: 3,
      accounts: d.accounts,
      payments: Engine.annotatePayments(d.accounts, d.payments),
      adjustments: Array.isArray(d.adjustments) ? d.adjustments : [],
      settings: d.settings || {},
    };
  }
  const up = cloudKit();
  const h = harness(up, { state: v1, migrate });
  await h.sync.signedIn({ id: 'user-1' });
  assert.equal(up.row.data.v, 3);
  assert.equal(Array.isArray(up.row.data.adjustments), true);
  assert.equal(typeof up.row.data.payments[0].interest, 'number');
  assert.equal(up.row.data.payments[0].legacy, true);
  assert.equal(up.row.data.accounts[0].balance, 500);
  assert.equal(up.row.data._sync.rev, 1);
  h.sync.suspend();

  for (const version of [1, 2, 3]) {
    const down = cloudKit();
    const body = version === 3 ? { ...v1, v: 3, adjustments: [] } : { ...v1, v: version };
    down.row = { data: { ...body, _sync: { rev: 4 } }, updated_at: '2026-04-01T00:00:00.000Z' };
    const g = harness(down, { state: { accounts: [], payments: [] }, migrate });
    assert.equal(await g.sync.signedIn({ id: 'user-1' }), 'pull');
    assert.equal(g.state.v, 3);
    assert.ok(Array.isArray(g.state.adjustments));
    assert.equal(g.state.payments[0].legacy, true);
    assert.equal(typeof g.state.payments[0].principal, 'number');
    assert.equal(g.state.accounts[0].balance, 500);
    assert.equal(g.state._sync, undefined);
    g.sync.suspend();
  }

  const shaped = D.defaultMigrate({ accounts: [{ id: 'a' }], payments: [{ id: 'p' }] });
  assert.equal(shaped.v, 3);
  assert.deepEqual(shaped.adjustments, []);
  assert.equal(typeof shaped.settings, 'object');
});

test('a failed upload does not move the cursor, and a later retry does', async () => {
  const cloud = cloudKit();
  cloud.failUpserts(2);
  const h = harness(cloud, { state: state('phone', 80), retryBaseMs: 15, retryCapMs: 40 });
  await assert.rejects(() => h.sync.signedIn({ id: 'user-1' }));
  assert.equal(cloud.row, null);
  assert.equal(h.sync.readMeta().lastSynced, undefined);
  assert.equal(h.sync.readMeta().baseRev, undefined);
  await sleep(200);
  assert.equal(cloud.row && cloud.row.data.accounts[0].id, 'phone');
  assert.equal(h.sync.readMeta().baseRev, 1);
  assert.ok(h.sync.readMeta().lastSynced);

  cloud.failReads(1);
  h.state = state('phone', 80);
  const before = JSON.stringify(h.state);
  assert.equal(await h.sync.refresh(), false);
  assert.equal(JSON.stringify(h.state), before);
  h.sync.suspend();
});

test('backup keeps the last five local copies before a cloud overwrite', async () => {
  const cloud = cloudKit();
  const h = harness(cloud, { state: state('phone', 1) });
  await h.sync.signedIn({ id: 'user-1' });
  for (let i = 2; i <= 7; i++) {
    cloud.row = { data: { ...state('cloud', i), _sync: { rev: h.sync.readMeta().baseRev + 1 } }, updated_at: `2026-07-0${i}T00:00:00.000Z` };
    assert.equal(await h.sync.refresh(), true);
    h.state = state('phone', i);
    h.sync.readMeta();
  }
  const backups = JSON.parse(h.storage.store.get(D.BACKUP));
  assert.equal(backups.length, 5);
  assert.equal(backups[0].data.accounts[0].balance, 2);
  assert.equal(backups[4].data.accounts[0].balance, 6);
  h.sync.suspend();
});

test('row level security assumptions are documented and the policies are unchanged', () => {
  assert.match(schema, /enable row level security/);
  assert.match(schema, /auth\.uid\(\) = user_id/);
  assert.match(schema, /revoke all on public\.user_state from anon/);
  assert.match(schema, /grant select, insert, update, delete on public\.user_state to authenticated/);
  assert.match(schema, /service-role/);
  assert.match(schema, /tombstone/);
  assert.equal((schema.match(/create policy/g) || []).length, 4);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8'), /auth\.uid\(\) = user_id/);
  assert.doesNotMatch(schema, /service_role/);
});
