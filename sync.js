// Debt Slayer cross-device sync (Supabase). Pure decision logic is exported for tests.
(function (root) {
  const META = 'debt-killer:sync';      // { updatedAt, lastSynced, uid }
  const isEmpty = d => !d || ((!d.accounts || !d.accounts.length) && (!d.payments || !d.payments.length));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // What to do right after sign-in.
  //   local: state object, meta: {updatedAt,lastSynced,uid}, cloud: {data, updated_at} | null, uid: signed-in user
  // Returns { action: 'none'|'push'|'pull'|'ask', prefer?: 'local'|'cloud' }
  function decideMerge(local, meta, cloud, uid) {
    meta = meta || {};
    const cloudHas = cloud && !isEmpty(cloud.data);
    if (!cloudHas) return { action: isEmpty(local) ? 'none' : 'push' };
    if (isEmpty(local)) return { action: 'pull' };
    if (same(local, cloud.data)) return { action: 'none' };
    // Same account, no local edits since the last sync: the cloud copy is simply newer.
    if (meta.uid === uid && meta.lastSynced && (!meta.updatedAt || meta.updatedAt <= meta.lastSynced)) return { action: 'pull' };
    const lt = Date.parse(meta.updatedAt || 0) || 0, ct = Date.parse(cloud.updated_at || 0) || 0;
    return { action: 'ask', prefer: ct >= lt ? 'cloud' : 'local' };
  }

  // Should a focus/visibility pull replace local state?
  function shouldPull(meta, cloud) {
    if (!cloud || isEmpty(cloud.data)) return false;
    meta = meta || {};
    const ct = Date.parse(cloud.updated_at || 0) || 0, ls = Date.parse(meta.lastSynced || 0) || 0, lu = Date.parse(meta.updatedAt || 0) || 0;
    return ct > ls && lu <= ls;   // cloud moved on and we have no unsynced edits
  }

  // Sample data must never land in the real save. Returns false when it refuses.
  function persistAppState({ demo, storage, key, json }) {
    if (demo) return false;
    storage.setItem(key, json);
    return true;
  }

  function createSync({ client, storage, getState, applyState, ask, onStatus, debounceMs = 1500, now = () => new Date().toISOString() }) {
    let user = null, timer = null, pushing = null, enabled = !!client, suspended = false;
    const readMeta = () => { try { return JSON.parse(storage.getItem(META)) || {}; } catch { return {}; } };
    const writeMeta = m => { try { storage.setItem(META, JSON.stringify({ ...readMeta(), ...m })); } catch {} };
    const status = (s, extra) => onStatus && onStatus(s, { user, meta: readMeta(), ...extra });

    async function fetchRow() {
      const { data, error } = await client.from('user_state').select('data, updated_at').eq('user_id', user.id).maybeSingle();
      if (error) throw error; return data;
    }
    async function push() {
      if (suspended || !user) return;
      const at = now(), data = getState();
      const { error } = await client.from('user_state').upsert({ user_id: user.id, data, updated_at: at }, { onConflict: 'user_id' });
      if (error) { status('error', { error }); throw error; }
      writeMeta({ lastSynced: at, updatedAt: at, uid: user.id }); status('synced');
    }
    function pull(row) { applyState(row.data); writeMeta({ lastSynced: row.updated_at, updatedAt: row.updated_at, uid: user.id }); status('synced'); }

    async function reconcile() {
      status('syncing');
      const row = await fetchRow();
      const d = decideMerge(getState(), readMeta(), row, user.id);
      if (d.action === 'push') await push();
      else if (d.action === 'pull') pull(row);
      else if (d.action === 'ask') {
        const pick = await ask({ prefer: d.prefer, localAt: readMeta().updatedAt || null, cloudAt: row.updated_at });
        if (pick === 'cloud') pull(row); else await push();
      } else { writeMeta({ lastSynced: (row && row.updated_at) || readMeta().lastSynced, uid: user.id }); status('synced'); }
      return d.action;
    }

    return {
      get enabled() { return enabled; }, get user() { return user; }, readMeta,
      // Call after every local change.
      changed() {
        if (suspended) return;
        writeMeta({ updatedAt: now() });
        if (!user) return;
        clearTimeout(timer); status('pending');
        timer = setTimeout(() => { pushing = push().catch(() => {}); }, debounceMs);
      },
      suspend() { suspended = true; clearTimeout(timer); timer = null; },
      resume() { suspended = false; },
      get suspended() { return suspended; },
      async flush() { if (suspended) return; if (timer) { clearTimeout(timer); timer = null; await push(); } else if (pushing) await pushing; },
      async refresh() {
        if (suspended || !user) return false;
        try { const row = await fetchRow(); if (shouldPull(readMeta(), row)) { pull(row); return true; } } catch (e) { status('error', { error: e }); }
        return false;
      },
      async signedIn(u) { user = u; if (suspended) return 'suspended'; return reconcile(); },
      async signIn(email, redirectTo) {
        const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
      },
      async signOut(opts = {}) { if (opts.flush !== false) { try { await this.flush(); } catch {} } await client.auth.signOut(); user = null; writeMeta({ uid: null }); status('signedOut'); },
      start() {
        if (!client) return;
        client.auth.onAuthStateChange((ev, session) => {
          const u = session && session.user;
          if (u && (!user || user.id !== u.id)) this.signedIn(u).catch(e => status('error', { error: e }));
          else if (!u && user) { user = null; status('signedOut'); }
        });
        const onBack = () => { if (document.visibilityState === 'visible') this.refresh(); };
        root.addEventListener && root.addEventListener('focus', onBack);
        root.document && root.document.addEventListener('visibilitychange', onBack);
      },
    };
  }

  const api = { decideMerge, shouldPull, createSync, isEmpty, persistAppState, META };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
