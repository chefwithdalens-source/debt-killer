const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../sync.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function memory() {
  const store = new Map();
  return {
    store,
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}

test('sample data is not written to the real save', () => {
  const storage = memory();
  assert.equal(D.persistAppState({ demo: true, storage, key: 'debt-killer:v1', json: '{"accounts":[{"id":"sample"}]}' }), false);
  assert.equal(storage.store.has('debt-killer:v1'), false);
  assert.equal(D.persistAppState({ demo: false, storage, key: 'debt-killer:v1', json: '{"accounts":[{"id":"real"}]}' }), true);
  assert.equal(storage.store.get('debt-killer:v1'), '{"accounts":[{"id":"real"}]}');
});

test('a suspended sync does not push or pull over the real save', async () => {
  const storage = memory();
  const calls = [];
  let state = { accounts: [{ id: 'real' }], payments: [{ id: 'p' }] };
  const client = {
    auth: {
      onAuthStateChange() {},
      signInWithOtp: async () => ({ error: null }),
      signOut: async () => {},
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: { data: { accounts: [{ id: 'cloud' }], payments: [{ id: 'c' }] }, updated_at: '2026-10-20T00:00:00.000Z' }, error: null }),
        upsert: async row => { calls.push(row); return { error: null }; },
      };
    },
  };
  const sync = D.createSync({
    client, storage, getState: () => state, applyState: d => { state = d; }, debounceMs: 10,
  });
  sync.suspend();
  state = { accounts: [{ id: 'sample' }], payments: [] };
  sync.changed();
  await new Promise(r => setTimeout(r, 40));
  assert.equal(calls.length, 0);
  assert.equal(await sync.refresh(), false);
  assert.equal(state.accounts[0].id, 'sample');
  assert.equal(await sync.signedIn({ id: 'user-1' }), 'suspended');
  assert.equal(calls.length, 0);
  assert.equal(storage.store.has('debt-killer:v1'), false);
});

test('demo mode is labeled, isolated from sync, and not on the populated home screen', () => {
  const saveFn = app.slice(app.indexOf('function save()'), app.indexOf('function setDemoURL'));
  assert.ok(saveFn.indexOf('if (DEMO)') >= 0 && saveFn.indexOf('if (DEMO)') < saveFn.indexOf('persistAppState'));
  assert.match(saveFn, /sessionStorage\.setItem\(DEMO_KEY/);
  assert.match(app, /if \(SYNC\) SYNC\.suspend\(\)/);
  assert.match(app, /Viewing sample data/);
  assert.match(app, /id="demoExit"/);
  const home = app.slice(app.indexOf('function viewHome()'), app.indexOf('function simText()'));
  assert.doesNotMatch(home, /startDemo|View sample data|wDemo/);
  const welcome = app.slice(app.indexOf('function viewEmpty()'), app.indexOf('function gauge(') > -1 ? app.indexOf('function gauge(') : app.indexOf('function homeBanners()'));
  assert.match(welcome, /View sample data/);
  assert.match(app, /initSync\(\)\{[\s\S]*if \(SYNC \|\| DEMO/);
});

test('sign-in is one magic-link sheet', () => {
  assert.equal((app.match(/id="magicForm"/g) || []).length, 1);
  assert.equal(app.includes('wSync'), false);
  assert.equal(html.includes('wSync'), false);
  assert.equal((html.match(/id="signInBtn"/g) || []).length, 1);
  const settings = app.slice(app.indexOf('function openSettings'), app.indexOf('render();\ninitSync();'));
  assert.equal(settings.includes('magicFormHTML'), false);
  assert.match(app, /function openSignIn/);
  assert.match(app, /flowType: 'pkce'|flowType: 'pkce'/);
});
