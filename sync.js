// Debt Slayer cross-device sync (Supabase). Pure decision logic is exported for tests.
//
// Lineage lives in the row's jsonb as data._sync.rev (a monotonic integer) and in
// the local meta as { rev, baseRev, updatedAt, lastSynced, uid }. updated_at is a
// hint for the choice dialog only. A push is allowed when this tab's in-memory
// baseRev still equals the cloud revision. Two diverged revisions ask; they are
// never last-write-wins. A cloud erase is an empty document with
// _sync.tombstone, not a deleted row (a missing row looks like "nothing to
// keep" and an older device would upload stale accounts back).
//
// Row Level Security is assumed, not configured here. schema.sql enables RLS,
// grants only `authenticated`, and requires auth.uid() = user_id on select,
// insert, update, and delete. The client writes user_id from the signed-in
// session. The anon key cannot read another user's row. No service-role key
// is used. The tombstone is an ordinary upsert of the owner's own row.
(function (root) {
  const META = 'debt-killer:sync';
  const BACKUP = 'debt-killer:sync-backup';
  const BACKUP_LIMIT = 5;

  const isEmpty = d => !d || ((!d.accounts || !d.accounts.length) && (!d.payments || !d.payments.length));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function revOf(d) {
    const n = d && d._sync && Number(d._sync.rev);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }
  function isTombstone(d) {
    return !!(d && d._sync && d._sync.tombstone);
  }
  function stripSync(d) {
    if (!d || typeof d !== 'object') return d;
    if (!Object.prototype.hasOwnProperty.call(d, '_sync')) return d;
    const copy = { ...d };
    delete copy._sync;
    return copy;
  }
  function defaultMigrate(d) {
    const src = d && typeof d === 'object' ? d : {};
    const settings = src.settings && typeof src.settings === 'object' && !Array.isArray(src.settings) ? src.settings : {};
    return {
      v: 3,
      accounts: Array.isArray(src.accounts) ? src.accounts : [],
      payments: Array.isArray(src.payments) ? src.payments : [],
      adjustments: Array.isArray(src.adjustments) ? src.adjustments : [],
      settings,
      flags: src.flags && typeof src.flags === 'object' && !Array.isArray(src.flags) ? src.flags : {},
      lastFree: src.lastFree || null,
      banner: src.banner || null,
    };
  }
  function preferOf(localRev, cloudRev, meta, cloud) {
    if (localRev !== cloudRev) return localRev > cloudRev ? 'local' : 'cloud';
    const lt = Date.parse(meta.updatedAt || 0) || 0;
    const ct = Date.parse((cloud && cloud.updated_at) || 0) || 0;
    if (!lt && !ct) return 'local';
    return ct > lt ? 'cloud' : 'local';
  }

  // What to do right after sign-in.
  //   local: state object
  //   meta: { rev, baseRev, updatedAt, lastSynced, uid }
  //   cloud: { data, updated_at } | null
  //   uid: signed-in user
  // Returns { action: 'none'|'push'|'pull'|'ask', prefer?: 'local'|'cloud' }
  function decideMerge(local, meta, cloud, uid) {
    meta = meta || {};
    const localRev = Number.isFinite(+meta.rev) ? Math.floor(+meta.rev) : revOf(local);
    const baseKnown = Number.isFinite(+meta.baseRev);
    const base = baseKnown ? Math.floor(+meta.baseRev) : null;
    const cloudData = cloud && cloud.data;
    const cloudRev = cloudData ? revOf(cloudData) : 0;
    const tomb = isTombstone(cloudData);
    const localEmpty = isEmpty(local);
    const cloudEmpty = !cloudData || isEmpty(cloudData);
    const syncedBefore = !!(meta.uid && uid && meta.uid === uid && meta.lastSynced && baseKnown);
    const identical = !!cloudData && same(stripSync(local), stripSync(cloudData));

    if (identical && !tomb) return { action: 'none' };
    if (tomb && localEmpty) return { action: identical ? 'none' : 'pull' };

    // A tombstone must not be treated as "no cloud row" or a stale device uploads the erased accounts back.
    if (tomb) {
      if (syncedBefore && localRev === base && cloudRev > base) return { action: 'pull' };
      return { action: 'ask', prefer: preferOf(localRev, cloudRev, meta, cloud) };
    }
    if (cloudEmpty) return { action: localEmpty ? 'none' : 'push' };
    if (localEmpty) return { action: 'pull' };

    if (syncedBefore) {
      const dirty = localRev > base;
      const cloudAhead = cloudRev > base;
      // Revision wins over the wall clock, including a clock that is ahead or behind.
      if (!dirty && cloudAhead) return { action: 'pull' };
      if (dirty && cloudRev === base) return { action: 'push' };
      return { action: 'ask', prefer: preferOf(localRev, cloudRev, meta, cloud) };
    }

    // Saves from before revisions: a clean device can take the cloud copy; a dirty one must ask.
    if (meta.uid && uid && meta.uid === uid && meta.lastSynced && !baseKnown) {
      if (!meta.updatedAt || String(meta.updatedAt) <= String(meta.lastSynced)) return { action: 'pull' };
      return { action: 'ask', prefer: preferOf(localRev, cloudRev, meta, cloud) };
    }

    // First contact. rev 0 against rev 0 is not a fast-forward.
    return { action: 'ask', prefer: preferOf(localRev, cloudRev, meta, cloud) };
  }

  // Should a focus/visibility check replace local state?
  function shouldPull(meta, cloud) {
    if (!cloud || !cloud.data) return false;
    meta = meta || {};
    const baseKnown = Number.isFinite(+meta.baseRev);
    if (baseKnown || Number.isFinite(+meta.rev)) {
      if (!baseKnown) return false;
      const base = Math.floor(+meta.baseRev);
      const local = Number.isFinite(+meta.rev) ? Math.floor(+meta.rev) : base;
      if (local > base) return false;
      const ahead = revOf(cloud.data) > base;
      if (!ahead) return false;
      return isTombstone(cloud.data) || !isEmpty(cloud.data);
    }
    if (isEmpty(cloud.data) && !isTombstone(cloud.data)) return false;
    const ct = Date.parse(cloud.updated_at || 0) || 0;
    const ls = Date.parse(meta.lastSynced || 0) || 0;
    const lu = Date.parse(meta.updatedAt || 0) || 0;
    return ct > ls && lu <= ls;
  }

  // Sample data must never land in the real save. Returns false when it refuses.
  function persistAppState({ demo, storage, key, json }) {
    if (demo) return false;
    storage.setItem(key, json);
    return true;
  }

  function createSync({
    client, storage, getState, applyState, ask, onStatus, migrate,
    debounceMs = 1500, retryBaseMs = 1000, retryCapMs = 30000,
    now = () => new Date().toISOString(),
  }) {
    let user = null, timer = null, retryTimer = null, inflight = null, asking = null;
    let enabled = !!client, suspended = false, retryN = 0, writes = 0;
    const migrateFn = typeof migrate === 'function' ? migrate : defaultMigrate;
    const readMeta = () => { try { return JSON.parse(storage.getItem(META)) || {}; } catch { return {}; } };
    const initial = readMeta();
    // In-memory on purpose. A sibling tab can rewrite localStorage meta; this tab
    // must not adopt that base and then upload its older snapshot.
    let baseRev = Number.isFinite(+initial.baseRev) ? Math.floor(+initial.baseRev) : null;
    const writeMeta = m => { try { storage.setItem(META, JSON.stringify({ ...readMeta(), ...m })); } catch {} };
    const metaNow = () => {
      const m = readMeta();
      if (baseRev !== null) m.baseRev = baseRev;
      return m;
    };
    const status = (s, extra) => onStatus && onStatus(s, { user, meta: metaNow(), ...extra });

    function prepare(d) {
      const stripped = stripSync(d) || {};
      let out = null;
      try { out = migrateFn(stripped); } catch { out = null; }
      if (!out || typeof out !== 'object') out = stripped;
      if (!Array.isArray(out.accounts) || !Array.isArray(out.payments)) out = defaultMigrate(out);
      else if (out.v !== 3 || !Array.isArray(out.adjustments) || !out.settings || typeof out.settings !== 'object' || Array.isArray(out.settings)) {
        const base = defaultMigrate(out);
        out = {
          ...base, ...stripSync(out), v: 3,
          adjustments: Array.isArray(out.adjustments) ? out.adjustments : base.adjustments,
          settings: out.settings && typeof out.settings === 'object' && !Array.isArray(out.settings) ? out.settings : base.settings,
        };
      }
      return stripSync(out);
    }
    function backup(reason) {
      const data = getState();
      if (isEmpty(data)) return;
      let list = [];
      try { list = JSON.parse(storage.getItem(BACKUP)) || []; } catch { list = []; }
      if (!Array.isArray(list)) list = [];
      list.push({ at: now(), reason: reason || 'pull', data, meta: readMeta() });
      while (list.length > BACKUP_LIMIT) list.shift();
      try { storage.setItem(BACKUP, JSON.stringify(list)); } catch {}
    }
    function adopt(rev, at) {
      baseRev = rev;
      writeMeta({ rev, baseRev: rev, lastSynced: at, updatedAt: at, uid: user.id });
    }
    function pull(row, reason) {
      if (!row) return;
      backup(reason || 'pull');
      applyState(prepare(row.data));
      const at = row.updated_at || now();
      adopt(revOf(row.data), at);
      retryN = 0;
      status('synced');
    }
    function scheduleRetry(opts) {
      if (suspended || !user) return;
      const delay = Math.min(retryCapMs, retryBaseMs * (2 ** retryN));
      retryN += 1;
      clearTimeout(retryTimer);
      const again = opts && opts.reconcile ? 'reconcile' : 'push';
      retryTimer = setTimeout(() => {
        retryTimer = null;
        const run = again === 'reconcile'
          ? reconcileNow()
          : startPush(opts && opts.force ? { force: true } : {}).then(r => {
            if (r && r.reason === 'conflict') return ensureAsk(r.cloud);
            return r;
          });
        Promise.resolve(run).catch(e => status('error', { error: e }));
      }, delay);
      status('retry', { delay });
    }
    async function fetchRow() {
      const { data, error } = await client.from('user_state').select('data, updated_at').eq('user_id', user.id).maybeSingle();
      if (error) throw (error instanceof Error ? error : new Error(error.message || 'sync failed'));
      return data;
    }
    async function push(opts = {}) {
      if (suspended || !user) return { ok: false, reason: 'idle' };
      clearTimeout(retryTimer);
      retryTimer = null;
      const ticket = writes;
      let row;
      try { row = await fetchRow(); }
      catch (e) {
        if (ticket !== writes || suspended || !user) return { ok: false, reason: 'idle' };
        scheduleRetry(opts);
        status('error', { error: e });
        throw e;
      }
      if (ticket !== writes || suspended || !user) return { ok: false, reason: 'idle' };
      const cloudRev = row ? revOf(row.data) : 0;
      const aligned = row ? (baseRev !== null && cloudRev === baseRev) : !(baseRev !== null && baseRev > 0);
      if (!opts.force && !aligned) {
        status('conflict');
        return { ok: false, reason: 'conflict', cloud: row };
      }
      const body = prepare(getState());
      if (!body) return { ok: false, reason: 'idle' };
      if (row && aligned && same(body, stripSync(row.data)) && !isTombstone(row.data)) {
        adopt(cloudRev, row.updated_at || now());
        retryN = 0;
        status('synced');
        return { ok: true, reason: 'unchanged' };
      }
      const next = Math.max(cloudRev, baseRev == null ? 0 : baseRev) + 1;
      const at = now();
      const payload = { user_id: user.id, data: { ...body, _sync: { rev: next } }, updated_at: at };
      const { error } = await client.from('user_state').upsert(payload, { onConflict: 'user_id' });
      if (ticket !== writes || suspended || !user) return { ok: false, reason: 'superseded' };
      if (error) {
        const err = error instanceof Error ? error : new Error(error.message || 'sync failed');
        scheduleRetry(opts);
        status('error', { error: err });
        throw err;
      }
      adopt(next, at);
      retryN = 0;
      status('synced');
      return { ok: true, rev: next };
    }
    function startPush(opts) {
      const p = push(opts);
      inflight = p;
      // The derived promise must be handled. Otherwise a failed upload rejects twice.
      p.finally(() => { if (inflight === p) inflight = null; }).catch(() => {});
      return p;
    }
    async function resolveConflict(row, reason) {
      if (suspended || !user) return { ok: false, reason: 'idle' };
      const why = reason || 'conflict';
      const d = decideMerge(getState(), metaNow(), row, user.id);
      if (d.action === 'none') {
        const rev = row ? revOf(row.data) : (baseRev || 0);
        adopt(rev, (row && row.updated_at) || metaNow().lastSynced || now());
        status('synced');
        return { ok: true, reason: 'none' };
      }
      if (d.action === 'pull' && row) { pull(row, why); return { ok: true }; }
      if (d.action === 'push') return push();
      if (!ask) { status('conflict'); return { ok: false, reason: 'conflict' }; }
      const pick = await ask({ prefer: d.prefer || 'local', localAt: metaNow().updatedAt || null, cloudAt: row && row.updated_at || null });
      if (suspended || !user) return { ok: false, reason: 'idle' };
      if (pick === 'cloud') {
        if (row) pull(row, why);
        else status('conflict');
        return { ok: !!row };
      }
      if (pick === 'local') return push({ force: true });
      status('conflict');
      return { ok: false, reason: 'conflict' };
    }
    function ensureAsk(row, reason) {
      if (!asking) asking = resolveConflict(row, reason).finally(() => { asking = null; });
      return asking;
    }
    async function reconcileNow() {
      if (suspended || !user) return suspended ? 'suspended' : 'idle';
      status('syncing');
      let row;
      try { row = await fetchRow(); }
      catch (e) {
        if (suspended || !user) throw e;
        scheduleRetry({ reconcile: true });
        status('error', { error: e });
        throw e;
      }
      const d = decideMerge(getState(), metaNow(), row, user.id);
      if (d.action === 'push') {
        const r = await startPush();
        if (r && r.reason === 'conflict') await ensureAsk(r.cloud);
      } else if (d.action === 'pull') pull(row, 'reconcile');
      else if (d.action === 'ask') await ensureAsk(row, 'reconcile');
      else {
        const rev = row ? revOf(row.data) : (baseRev || 0);
        const at = (row && row.updated_at) || metaNow().lastSynced || now();
        adopt(rev, at);
        status('synced');
      }
      return d.action;
    }

    return {
      get enabled() { return enabled; },
      get user() { return user; },
      get suspended() { return suspended; },
      readMeta, metaNow,
      suspend() { suspended = true; clearTimeout(timer); timer = null; clearTimeout(retryTimer); retryTimer = null; },
      resume() { suspended = false; },
      changed() {
        if (suspended) return;
        const m = readMeta();
        const floor = baseRev == null ? 0 : baseRev;
        const cur = Number.isFinite(+m.rev) ? Math.floor(+m.rev) : floor;
        const rev = cur > floor ? cur : cur + 1;
        writeMeta({ updatedAt: now(), rev });
        if (!user) return;
        clearTimeout(timer);
        status('pending');
        timer = setTimeout(() => {
          timer = null;
          startPush().then(r => {
            if (r && r.reason === 'conflict') return ensureAsk(r.cloud);
          }).catch(e => status('error', { error: e }));
        }, debounceMs);
      },
      async flush() {
        if (suspended) return { ok: true, reason: 'suspended' };
        const pending = !!timer;
        if (timer) { clearTimeout(timer); timer = null; }
        if (inflight) {
          const r = await inflight;
          if (r && r.reason === 'conflict') return ensureAsk(r.cloud);
          if (!(r && r.ok === false)) return r;
        }
        const meta = metaNow();
        const rev = Number.isFinite(+meta.rev) ? Math.floor(+meta.rev) : null;
        const dirty = user && (baseRev == null ? rev != null : rev != null && rev > baseRev);
        if (!pending && !dirty) return { ok: true, reason: 'idle' };
        const r = await startPush();
        if (r && r.reason === 'conflict') return ensureAsk(r.cloud);
        return r;
      },
      async refresh() {
        if (suspended || !user) return false;
        try {
          const row = await fetchRow();
          if (shouldPull(metaNow(), row)) { pull(row, 'refresh'); return true; }
        } catch (e) { status('error', { error: e }); }
        return false;
      },
      async reconcile() {
        try { return await reconcileNow(); }
        catch (e) { status('error', { error: e }); throw e; }
      },
      async signedIn(u) {
        user = u;
        if (suspended) return 'suspended';
        return reconcileNow();
      },
      async signIn(email, redirectTo) {
        const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
      },
      async signOut(opts = {}) {
        if (suspended || opts.flush === false) {
          clearTimeout(timer); timer = null;
          clearTimeout(retryTimer); retryTimer = null;
        } else {
          await this.flush();
        }
        await client.auth.signOut();
        user = null;
        writeMeta({ uid: null });
        status('signedOut');
      },
      // Explicit erase. Advances the cloud revision even when a normal push would conflict.
      // The caller deletes the local copy only after this resolves.
      async clearCloud() {
        if (suspended || !user) throw new Error('not signed in');
        writes += 1;
        clearTimeout(timer); timer = null;
        clearTimeout(retryTimer); retryTimer = null;
        if (inflight) { try { await inflight; } catch {} }
        writes += 1;
        if (inflight) { try { await inflight; } catch {} }
        const ticket = writes;
        const row = await fetchRow();
        if (ticket !== writes || suspended || !user) throw new Error('sync interrupted');
        const cloudRev = row ? revOf(row.data) : 0;
        const next = cloudRev + 1;
        const body = prepare({ v: 3, accounts: [], payments: [], adjustments: [], settings: {} });
        const at = now();
        const payload = { user_id: user.id, data: { ...body, _sync: { rev: next, tombstone: true } }, updated_at: at };
        const { error } = await client.from('user_state').upsert(payload, { onConflict: 'user_id' });
        if (error) throw (error instanceof Error ? error : new Error(error.message || 'sync failed'));
        if (ticket !== writes || suspended || !user) throw new Error('sync interrupted');
        adopt(next, at);
        retryN = 0;
        status('synced');
        return { ok: true, rev: next };
      },
      start() {
        if (!client) return;
        client.auth.onAuthStateChange((ev, session) => {
          const u = session && session.user;
          if (u && (!user || user.id !== u.id)) this.signedIn(u).catch(e => status('error', { error: e }));
          else if (!u && user) { user = null; status('signedOut'); }
        });
        const onBack = () => { if (!root.document || root.document.visibilityState === 'visible') this.refresh(); };
        root.addEventListener && root.addEventListener('focus', onBack);
        root.document && root.document.addEventListener('visibilitychange', onBack);
      },
    };
  }

  const api = {
    decideMerge, shouldPull, createSync, isEmpty, persistAppState, stripSync, revOf, defaultMigrate,
    META, BACKUP,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
