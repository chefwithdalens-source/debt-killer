(() => {
'use strict';
const KEY = 'debt-killer:v1';
const STORAGE_MSG = 'Saved on this device only. Export a backup to keep a copy or move to another device.';
const TYPES = ['Credit card','Store card','Buy now pay later','Auto loan','Student loan','Personal loan','Medical','Other'];
const CAT = {
  'Credit card':      { key:'credit',   label:'Credit cards',      strong:'var(--cat-credit)', fill:'var(--catf-credit)' },
  'Store card':       { key:'store',    label:'Store cards',       strong:'var(--cat-store)', fill:'var(--catf-store)' },
  'Buy now pay later':{ key:'bnpl',     label:'Buy now pay later', strong:'var(--cat-bnpl)', fill:'var(--catf-bnpl)' },
  'Auto loan':        { key:'auto',     label:'Auto loans',        strong:'var(--cat-auto)', fill:'var(--catf-auto)' },
  'Student loan':     { key:'student',  label:'Student loans',     strong:'var(--cat-student)', fill:'var(--catf-student)' },
  'Personal loan':    { key:'personal', label:'Personal loans',    strong:'var(--cat-personal)', fill:'var(--catf-personal)' },
  'Medical':          { key:'medical',  label:'Medical',           strong:'var(--cat-medical)', fill:'var(--catf-medical)' },
  'Other':            { key:'other',    label:'Other',             strong:'var(--cat-other)', fill:'var(--catf-other)' },
};
const TYPE_HEX = Object.fromEntries(Object.entries(CAT).map(([k,v])=>[k,v.fill]));
const TYPE_COLORS = TYPE_HEX;
const TIERS = {conservative:{label:'Conservative',range:'4–6 mo',months:6},moderate:{label:'Moderate',range:'3–4 mo',months:4},aggressive:{label:'Aggressive',range:'1–3 mo',months:3}};
const STRAT = {
  snowball:{ label:'Snowball', blurb:'Smallest balance first. Quick wins, then that payment rolls to the next one.' },
  avalanche:{ label:'Avalanche', blurb:'Highest interest rate first. This usually costs the least in interest.' },
  custom:{ label:'Custom', blurb:'You pick the order. Extra money follows that list.' },
};
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MON = MONTHS.map(m=>m.slice(0,3));

// ---------- helpers ----------
const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const money = (n, cents) => { n = Math.round((+n||0)*100)/100; const c = cents ?? (n % 1 !== 0); return '$' + n.toLocaleString('en-US',{minimumFractionDigits:c?2:0,maximumFractionDigits:c?2:0}); };
const money2 = n => money(n, true);
const r2 = n => Math.round(n*100)/100;
const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const monthKey = d => `${d.getFullYear()}-${d.getMonth()}`;
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth()+n, 1);
const fmtMonth = d => d && d.getDate() > 1 ? d.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const fmtMonShort = d => `${MON[d.getMonth()]} ${d.getFullYear()}`;
const debtFree = d => d ? `Debt free by ${fmtMonth(d)}` : 'Debt free date unknown';
const ordinal = n => n + (n%100>=11&&n%100<=13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[n%10] || 'th'));
function avatar(a, size=44, font=15){
  const px = Math.round(size);
  const mark = window.DebtLogos ? DebtLogos.resolveMark(a || {}) : { kind: 'monogram', letter: firstLetter(a && a.name), glyph: null };
  const letter = esc(mark.letter || firstLetter(a && a.name));
  if (mark.kind === 'logo') {
    return `<span class="avatar logo-tile lender-mark" style="width:${px}px;height:${px}px"><img src="logos/${mark.file}" alt="" width="${Math.round(px * 0.72)}" height="${Math.round(px * 0.72)}" data-ini="${letter}" data-bg="${TYPE_HEX[a && a.type] || ''}"></span>`;
  }
  const glyph = mark.glyph && window.DebtLogos ? DebtLogos.glyphSVG(mark.glyph) : '';
  return `<span class="avatar lender-mark lender-fallback" style="width:${px}px;height:${px}px;font-size:${font || Math.max(11, Math.round(px * 0.46))}px" aria-hidden="true"><span class="lender-letter">${letter}</span>${glyph}</span>`;
}
const firstLetter = n => (window.DebtLogos ? DebtLogos.firstLetter(n) : (String(n || '').trim().match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase());
document.addEventListener('error', e => {
  const img = e.target;
  if (!img || img.tagName !== 'IMG' || !img.dataset || !img.dataset.ini || !img.parentNode) return;
  const parent = img.parentNode;
  parent.classList.remove('logo-tile');
  parent.style.background = img.dataset.bg || 'var(--fill2)';
  parent.textContent = img.dataset.ini;
}, true);
const monthsBetween = (a, b) => (b.getFullYear()-a.getFullYear())*12 + b.getMonth()-a.getMonth();

function detectType(name){
  const n = name.toLowerCase();
  const rules = [
    [/affirm|klarna|afterpay|sezzle|zip pay|paypal pay ?in|bnpl/, 'Buy now pay later'],
    [/best buy|target|amazon|store card|kohl|macy|walmart|home depot|lowe/, 'Store card'],
    [/navient|sallie|nelnet|mohela|student|fedloan/, 'Student loan'],
    [/\bauto\b|toyota|ford|tesla|honda|car\b|car loan|vehicle|ally/, 'Auto loan'],
    [/hospital|medical|clinic|dental|health/, 'Medical'],
    [/visa|mastercard|amex|american express|chase|capital one|platinum|discover|citi|navy federal|mission lane|credit one|card/, 'Credit card'],
    [/personal loan|sofi|lending|upstart|loan/, 'Personal loan'],
  ];
  for (const [re, t] of rules) if (re.test(n)) return t;
  return null;
}

// ---------- state ----------
const blank = () => ({ v:3, accounts:[], payments:[], adjustments:[], settings:{ budget:null, defaultMonths:6, theme:'light', followSystem:false, accent:'gold', strike:true, strategy:'snowball', customOrder:[], income:null, expenses:[], useCashFlow:false, accelerateFocus:false, extraMonthly:0, windfall:0 }, flags:{ backupTip:false }, lastFree:null, banner:null });
function storageMsg(){
  if (DEMO) return 'Demo data lives only in this tab.';
  if (typeof syncConfigured === 'function' && syncConfigured()) return 'Saved on this device, and in your private cloud copy while you are signed in. Export a backup anytime.';
  return STORAGE_MSG;
}
// ---------- demo mode (memory + sessionStorage only; never localStorage or cloud) ----------
const DEMO_KEY = 'debt-slayer:demo';
let DEMO = (() => { try { return new URLSearchParams(location.search).get('demo') === '1' || sessionStorage.getItem(DEMO_KEY) !== null; } catch { return false; } })();
function demoState(){ try { const r = sessionStorage.getItem(DEMO_KEY); if (r) { const n = normalize(JSON.parse(r)); if (n) return n; } } catch {} return normalize(window.DS_DEMO ? window.DS_DEMO() : blank()); }
let S = DEMO ? null : load();
function load(){
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return blank();
    const d = JSON.parse(raw);
    const n = normalize(d); if (!n) return blank();
    const settings = d.settings || {};
    const payLegacy = (d.payments || []).some(p => !p || typeof p.interest !== 'number' || typeof p.principal !== 'number');
    const legacy = d.v !== 3 || !Object.prototype.hasOwnProperty.call(settings, 'accelerateFocus') || payLegacy || !Array.isArray(d.adjustments);
    if (legacy) { try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {} }
    return n;
  } catch { return blank(); }
}
function normalize(d){
  if (!d || typeof d !== 'object' || !Array.isArray(d.accounts) || !Array.isArray(d.payments)) return null;
  const b = blank();
  const s = d.settings || {};
  const strategy = ['snowball','avalanche','custom'].includes(s.strategy) ? s.strategy : 'snowball';
  // Missing accelerateFocus means a save from before strategies existed. Keep the old
  // "pay the focus debt off in N months" behavior until the person turns it off.
  const accelerateFocus = Object.prototype.hasOwnProperty.call(s, 'accelerateFocus') ? !!s.accelerateFocus : true;
  const numOrNull = v => (v == null || v === '' || !isFinite(+v) || +v < 0 ? null : Math.round(+v * 100) / 100);
  const nonNeg = v => (isFinite(+v) && +v > 0 ? Math.round(+v * 100) / 100 : 0);
  const expenses = Array.isArray(s.expenses) ? s.expenses.filter(e => e && typeof e.name === 'string').map(e => ({
    id: typeof e.id === 'string' && e.id ? e.id : uid(),
    name: String(e.name).slice(0, 80),
    amount: nonNeg(e.amount),
  })) : [];
  const adjustments = Array.isArray(d.adjustments) ? d.adjustments.filter(x => x && typeof x.accountId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && isFinite(+x.balance)).map(x => ({
    id: typeof x.id === 'string' && x.id ? x.id : uid(),
    accountId: x.accountId,
    date: x.date,
    balance: Math.round(+x.balance * 100) / 100,
    previous: isFinite(+x.previous) ? Math.round(+x.previous * 100) / 100 : null,
  })) : [];
  return {
    v: 3,
    accounts: d.accounts,
    payments: DebtEngine.annotatePayments(d.accounts, d.payments),
    adjustments,
    settings: {
      budget: numOrNull(s.budget),
      defaultMonths: [4,5,6,7,8].includes(+s.defaultMonths) ? +s.defaultMonths : 6,
      theme: s.theme === 'dark' ? 'dark' : 'light',
      followSystem: !!s.followSystem,
      accent: typeof s.accent === 'string' && s.accent ? s.accent : 'gold',
      strike: s.strike !== false,
      strategy, accelerateFocus,
      customOrder: Array.isArray(s.customOrder) ? s.customOrder.filter(id => typeof id === 'string') : [],
      income: numOrNull(s.income),
      expenses, useCashFlow: !!s.useCashFlow,
      extraMonthly: nonNeg(s.extraMonthly), windfall: nonNeg(s.windfall),
    },
    flags: { ...b.flags, ...(d.flags || {}) },
    lastFree: d.lastFree || null,
    banner: d.banner || null,
  };
}
const UIKEY = 'debt-killer:ui';
let UI = (() => { try { return JSON.parse(localStorage.getItem(UIKEY)) || {}; } catch { return {}; } })();
UI.open = UI.open || {}; UI.expanded = UI.expanded || {};
if (DEMO) { S = demoState(); try { sessionStorage.setItem(DEMO_KEY, JSON.stringify(S)); } catch {} }
function saveUI(){ if (DEMO) return; try { localStorage.setItem(UIKEY, JSON.stringify(UI)); } catch {} }
function save(){
  if (DEMO) { try { sessionStorage.setItem(DEMO_KEY, JSON.stringify(S)); } catch {} return; }
  const json = JSON.stringify(S);
  const wrote = window.DSync && DSync.persistAppState({ demo: false, storage: localStorage, key: KEY, json });
  if (!wrote) { try { localStorage.setItem(KEY, json); } catch {} }
  if (SYNC) SYNC.changed();
}
function setDemoURL(on){ try { const u = new URL(location.href); on ? u.searchParams.set('demo','1') : u.searchParams.delete('demo'); history.replaceState(null, '', u); } catch {} }
function startDemo(){ DEMO = true; if (SYNC) SYNC.suspend(); try { sessionStorage.removeItem(DEMO_KEY); } catch {} S = demoState(); save(); setDemoURL(true); tab = 'home'; closeAll(); render(); toast('Viewing sample data. It stays in this tab.'); }
function resetDemo(){ try { sessionStorage.removeItem(DEMO_KEY); } catch {} S = demoState(); save(); closeAll(); render(); toast('Sample data reset'); }
function exitDemo(){ DEMO = false; try { sessionStorage.removeItem(DEMO_KEY); } catch {} setDemoURL(false); S = load(); if (SYNC) SYNC.resume(); tab = 'home'; closeAll(); render(); initSync(); }
function fitDemoBar(){
  const b = document.getElementById('demoBar');
  if (!b) { document.documentElement.style.removeProperty('--demo-bar'); return; }
  document.documentElement.style.setProperty('--demo-bar', b.offsetHeight + 'px');
}
window.addEventListener('resize', fitDemoBar);
function demoBar(){
  let b = document.getElementById('demoBar');
  if (!DEMO) { b?.remove(); document.body.classList.remove('demo-mode'); fitDemoBar(); return; }
  document.body.classList.add('demo-mode');
  if (!b) {
    b = document.createElement('div'); b.id = 'demoBar'; b.className = 'demo-bar'; b.setAttribute('role','region'); b.setAttribute('aria-label','Viewing sample data');
    b.innerHTML = `<span class="demo-tag">Sample</span><span class="demo-txt">Viewing sample data. These debts are examples. They are not your accounts and they are not synced.</span><button type="button" class="demo-btn" id="demoReset">Reset</button><button type="button" class="demo-btn primary" id="demoExit">Exit</button>`;
    document.body.prepend(b);
    b.querySelector('#demoReset').addEventListener('click', resetDemo);
    b.querySelector('#demoExit').addEventListener('click', exitDemo);
  }
  fitDemoBar();
}

// ---------- cross-device sync (Supabase; off unless config.js has credentials) ----------
let SYNC = null, syncStatus = 'off';
const SB_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js';
const SB_SRI = 'sha384-BWcjm9OdFth9TbhCxZPdm+gAOUMAzQy9nmTs12ioXdCcbVnJaPMn+fMUoQCLt60R';
function syncConfigured(){ const c = window.DS_CONFIG || {}; return !!(window.__DS_MOCK_CLIENT || (c.supabaseUrl && c.supabaseAnonKey)); }
function initSync(){
  if (SYNC || DEMO || !syncConfigured() || !window.DSync) return;
  const boot = client => {
    SYNC = DSync.createSync({ client, storage: localStorage, getState: () => S,
      migrate: d => normalize(d) || d,
      applyState: d => { if (DEMO) return; S = normalize(d) || blank(); if (!(window.DSync && DSync.persistAppState({ demo: false, storage: localStorage, key: KEY, json: JSON.stringify(S) }))) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} } render(); },
      ask: askMerge, onStatus: (st) => { syncStatus = st; document.querySelectorAll('[data-sync-status]').forEach(el => el.textContent = syncStatusText()); updateSignIn(); } });
    window.__DS_SYNC = SYNC; SYNC.start();
  };
  if (window.__DS_MOCK_CLIENT) return boot(window.__DS_MOCK_CLIENT);
  const c = window.DS_CONFIG, sc = document.createElement('script');
  sc.src = SB_SRC; sc.integrity = SB_SRI; sc.crossOrigin = 'anonymous';
  sc.onload = () => boot(window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }));
  sc.onerror = () => { syncStatus = 'error'; };
  document.head.appendChild(sc);
}
function syncStatusText(){
  const m = SYNC ? SYNC.readMeta() : {};
  return { off:'Not signed in', signedOut:'Not signed in', syncing:'Syncing…', pending:'Changes waiting to sync…',
    retry:'Couldn’t reach the sync server. Retrying… Your data is safe on this device.',
    conflict:'This device and the cloud copy both changed. Nothing was overwritten.',
    error:'Couldn’t reach the sync server. Your data is safe on this device.',
    synced: m.lastSynced ? `Synced ${new Date(m.lastSynced).toLocaleString('en-US',{ month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}` : 'Synced' }[syncStatus] || '';
}
function askMerge({ prefer, localAt, cloudAt }){
  return new Promise(resolve => {
    const when = t => t ? new Date(t).toLocaleString('en-US',{ month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : 'unknown';
    let done = false; const fin = v => { if (done) return; done = true; resolve(v); closeTop(); };
    const btn = (k, label, t) => `<button type="button" class="btn ${prefer===k?'primary':''} block" data-pick="${k}" style="margin-bottom:10px">${label}<br><span class="small">Last changed ${when(t)}${prefer===k?' · suggested':''}</span></button>`;
    openDialog({ title:'Which data should we keep?', body:`<p class="muted" style="margin-top:0">This device and your cloud copy both changed. Pick one. The other is replaced. A copy of what is on this device is kept first.</p>
      ${prefer==='cloud' ? btn('cloud','Keep the cloud copy',cloudAt) + btn('local','Keep this device’s copy',localAt) : btn('local','Keep this device’s copy',localAt) + btn('cloud','Keep the cloud copy',cloudAt)}`,
      onMount: sh => {
        sh.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => fin(b.dataset.pick)));
        const bd = stack[stack.length-1].el; new MutationObserver((_, mo) => { if (!bd.isConnected) { mo.disconnect(); if (!done) { done = true; resolve(prefer); } } }).observe(document.body, { childList:true, subtree:true });
      } });
  });
}
function syncSectionHTML(){
  if (DEMO) return `<h3 class="micro">Sync across devices</h3><p class="small" style="margin:6px 0 10px">Sync is off while you’re viewing sample data. <button type="button" class="link-btn" id="syncExitDemo">Exit</button> to return to your accounts.</p>`;
  if (!syncConfigured()) return `<h3 class="micro">Sync across devices</h3><p class="small" style="margin:6px 0 10px">Sync isn’t set up for this copy of Debt Slayer yet. Your accounts stay on this device.</p>`;
  const u = SYNC && SYNC.user;
  return `<h3 class="micro" id="syncH">Sync across devices</h3>` + (u
    ? `<p class="small" style="margin:6px 0 4px">Signed in as <b>${esc(u.email||'')}</b></p><p class="small" data-sync-status aria-live="polite" style="margin:0 0 10px">${syncStatusText()}</p>
       <div class="toolbar"><button class="btn sm" id="syncNow">Sync now</button><button class="btn sm" id="syncOut">Sign out</button></div>`
    : `<p class="small" style="margin:6px 0 10px">Not signed in. Your accounts stay on this device. Use Sign in at the top of the screen when you want a magic link.</p>`);
}
function openSignIn(trigger){
  if (DEMO || !syncConfigured() || (SYNC && SYNC.user)) return;
  openDialog({ title:'Sign in', trigger, body:`<p class="muted" style="margin-top:0">We’ll email you a sign-in link. Open it on this device. Until then, everything stays on this device.</p>${magicFormHTML()}`, onMount: sh => bindMagic(sh) });
}
function updateSignIn(){
  const b = document.getElementById('signInBtn');
  if (!b) return;
  b.hidden = !!(DEMO || !syncConfigured() || (SYNC && SYNC.user));
}
function magicFormHTML(){
  return `<form class="magic" id="magicForm" novalidate><label class="sr-only" for="magicEmail">Email</label>
    <input id="magicEmail" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required>
    <button type="submit" class="btn primary sm">Email me a sign-in link</button><p class="small" id="magicMsg" aria-live="polite" style="margin:8px 0 0"></p></form>`;
}
function bindMagic(root){
  const f = root.querySelector('#magicForm'); if (!f) return;
  f.addEventListener('submit', async e => {
    e.preventDefault(); const em = f.querySelector('#magicEmail').value.trim(), msg = f.querySelector('#magicMsg');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { msg.textContent = 'Enter a valid email address.'; f.querySelector('#magicEmail').focus(); return; }
    if (!SYNC) { msg.textContent = 'Sync is still loading. Try again in a moment.'; return; }
    msg.textContent = 'Sending…';
    try { await SYNC.signIn(em, location.origin + location.pathname); msg.textContent = `Check ${em} for a sign-in link. Open it on this device.`; }
    catch (err) { msg.textContent = 'Couldn’t send the link: ' + (err && err.message || 'try again'); }
  });
}
function bindSyncSection(sh, rerender){
  bindMagic(sh);
  sh.querySelector('#syncExitDemo')?.addEventListener('click', exitDemo);
  sh.querySelector('#syncNow')?.addEventListener('click', async () => { try { await SYNC.flush(); await SYNC.reconcile(); toast('Synced'); } catch { toast('Couldn’t sync right now. Your data is still on this device.'); } });
  sh.querySelector('#syncOut')?.addEventListener('click', e => {
    openDialog({ title:'Sign out', trigger:e.currentTarget, body:`<p class="muted" style="margin-top:0">Your cloud copy stays safe. What should happen to the data on this device?</p>
      <button type="button" class="btn block" id="outKeep" style="margin-bottom:10px">Keep it on this device</button><button type="button" class="btn block" id="outClear" style="color:var(--red)">Remove it from this device</button>`,
      onMount: d => {
        d.querySelector('#outKeep').addEventListener('click', async () => {
          try { await SYNC.signOut(); } catch { toast('Couldn’t sync the latest changes, so you’re still signed in. Your data is still on this device.'); return; }
          closeAll(); render(); toast('Signed out. Data kept on this device.');
        });
        d.querySelector('#outClear').addEventListener('click', async () => {
          try { await SYNC.signOut(); } catch { toast('Couldn’t sync the latest changes, so you’re still signed in. Nothing was removed.'); return; }
          localStorage.removeItem(KEY); localStorage.removeItem(DSync.META); S = blank(); tab = 'home'; closeAll(); render(); toast('Signed out and removed from this device');
        });
      } });
  });
}
function openSyncSheet(trigger){
  openDialog({ title:'Sync across devices', trigger, body: syncSectionHTML().replace(/<h3[^>]*>Sync across devices<\/h3>/, ''), onMount: sh => bindSyncSection(sh) });
}

// ---------- payoff engine (see engine.js) ----------
function engineDebts(accts){
  return (accts || []).map(a => ({
    id: a.id, name: a.name, balance: a.balance, apr: a.apr || 0, min: a.min || 0,
    tierMonths: a.tier && TIERS[a.tier] ? TIERS[a.tier].months : null,
    dueDay: a.dueDay || null,
  }));
}
function cashFlow(settings){
  if (!settings || settings.income == null) return null;
  const spent = (settings.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return r2(Number(settings.income) - spent);
}
function effectiveBudget(settings){
  if (!settings) return null;
  if (settings.useCashFlow && settings.income != null) {
    const cf = cashFlow(settings);
    return cf == null ? null : Math.max(0, cf);
  }
  return settings.budget == null ? null : Math.max(0, Number(settings.budget) || 0);
}
function syncBudgetFromCashFlow(){
  if (!S.settings.useCashFlow) return;
  if (S.settings.income == null) { S.settings.budget = null; return; }
  const cf = cashFlow(S.settings);
  S.settings.budget = cf == null ? null : Math.max(0, cf);
}
function normalizedCustomOrder(){
  const ids = S.accounts.filter(a => a.balance > 0.004).map(a => a.id);
  const kept = (S.settings.customOrder || []).filter(id => ids.includes(id));
  ids.forEach(id => { if (!kept.includes(id)) kept.push(id); });
  return kept;
}
function toLegacy(result, startDate){
  const startM = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const totals = [{ date: startM, total: result.startBalance }];
  result.schedule.forEach((row, i) => totals.push({ date: addMonths(startM, i + 1), total: row.balance }));
  return {
    months: result.schedule.map(row => ({ date: row.date, pays: Object.fromEntries(row.rows.map(r => [r.id, r.payment])), rows: row.rows })),
    payoff: result.payoff, interest: result.interest, firstPay: result.firstPay,
    totalInterest: result.totalInterest, freeDate: result.freeDate, stuck: result.stuck, totals,
    schedule: result.schedule, orderedIds: result.orderedIds, underwater: result.underwater || [],
    monthlyCommitment: result.monthlyCommitment, totalPaid: result.totalPaid,
  };
}
function simulate(accts, opts = {}){
  const debts = engineDebts(accts);
  const settings = S.settings || {};
  const strategy = opts.strategy || settings.strategy || 'snowball';
  const customOrder = strategy === 'custom' ? normalizedCustomOrder() : (settings.customOrder || []);
  const floors = DebtEngine.plannedFloors(debts, {
    strategy, customOrder,
    accelerateFocus: opts.accelerateFocus != null ? opts.accelerateFocus : !!settings.accelerateFocus,
    focusMonths: opts.defMonths || settings.defaultMonths || 6,
    extraFor: opts.extraFor || null,
  });
  const startDate = opts.startDate || new Date();
  const budget = opts.budget !== undefined ? opts.budget : effectiveBudget(settings);
  const result = DebtEngine.project(debts, {
    strategy, customOrder, paymentFloors: floors, budget, startDate,
    extraMonthly: Math.max(0, Number(opts.extra) || 0) + (opts.ignoreSavedExtra ? 0 : Math.max(0, Number(settings.extraMonthly) || 0)),
    windfall: opts.windfall !== undefined ? Math.max(0, Number(opts.windfall) || 0) : Math.max(0, Number(settings.windfall) || 0),
  });
  return toLegacy(result, startDate);
}
function planHeadline(result){
  if (!result || result.alreadyFree) return 'Already paid off';
  if (result.stuck || !result.freeDate) return 'No payoff within 50 years';
  return fmtMonth(result.freeDate);
}
function warningLines(sim){
  const lines = [];
  if (!S.accounts.length || !sim) return lines;
  if (sim.stuck) lines.push('These payments never clear every debt. Each payment has to be higher than that debt’s monthly interest.');
  else if (sim.underwater && sim.underwater.length) {
    const names = sim.underwater.map(id => S.accounts.find(a => a.id === id)?.name).filter(Boolean);
    if (names.length) lines.push(`${names.join(', ')}: the planned payment is below this month’s interest. Extra money in the plan is what pays it down.`);
  }
  const mins = S.accounts.filter(a => a.balance > 0.004).reduce((s, a) => s + (Number(a.min) || 0), 0);
  if (S.settings.useCashFlow && S.settings.income != null) {
    const cf = cashFlow(S.settings);
    if (cf != null && cf + 0.001 < mins) lines.push(`Free cash flow is ${money2(Math.max(0, cf))}, short of ${money2(mins)} in minimums. Payoff dates still assume the minimums get paid.`);
  }
  return lines;
}

// ---------- derived ----------
const openAccounts = () => {
  const open = S.accounts.filter(a => a.balance > 0.004);
  const order = S.settings.strategy === 'custom' ? normalizedCustomOrder() : (S.settings.customOrder || []);
  return DebtEngine.sortDebts(open, S.settings.strategy || 'snowball', order);
};
const orderAll = () => [...openAccounts(), ...S.accounts.filter(a=>a.balance<=0.004)];
const totals = () => { const left = S.accounts.reduce((s,a)=>s+a.balance,0); const total = S.accounts.reduce((s,a)=>s+Math.max(a.start,a.balance),0); return { left, total, paid: Math.max(0,total-left) }; };
function paidInMonth(offset){ const d = new Date(); const target = new Date(d.getFullYear(), d.getMonth()+offset, 1); const k = monthKey(target); return S.payments.filter(p=>monthKey(new Date(p.date+'T12:00'))===k).reduce((s,p)=>s+p.amount,0); }
function paidThisMonth(){ return paidInMonth(0); }
function paceLabel(a){ return a.tier ? TIERS[a.tier].label + ' pace' : 'Minimum'; }
function monthStamp(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
function parseMonthStamp(s){
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-01/.exec(s);
  if (m && s.length === 10) return new Date(+m[1], +m[2] - 1, 1);
  const d = new Date(s);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), 1);
}

function noteChange(action){
  const sim = simulate(S.accounts);
  const nowDate = sim.freeDate ? new Date(sim.freeDate.getFullYear(), sim.freeDate.getMonth(), 1) : null;
  const now = nowDate ? monthStamp(nowDate) : null;
  const prev = parseMonthStamp(S.lastFree);
  if (prev && nowDate){
    const diff = monthsBetween(nowDate, prev);
    if (diff !== 0) S.banner = { text: `${plural(Math.abs(diff),'month')} ${diff>0?'sooner':'later'} after ${action}.`, good: diff>0 };
  }
  S.lastFree = now; save();
}

// ---------- routing ----------
let tab = 'home';
let simExtra = 0;
let planShowAll = false, planFilter = '';
function go(t){ tab = t; render(); $('#main').focus({preventScroll:true}); window.scrollTo(0,0); }
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
$('#settingsBtn').addEventListener('click', e => openSettings(e.currentTarget));
$('#signInBtn')?.addEventListener('click', e => openSignIn(e.currentTarget));
$('#sbSettings')?.addEventListener('click', e => openSettings(e.currentTarget));
$('#fab').addEventListener('click', e => openAccountForm(null, e.currentTarget));
$('#headerAdd').addEventListener('click', e => openAccountForm(null, e.currentTarget));

function applyTheme(){
  let t = S.settings.theme;
  if (S.settings.followSystem) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  document.documentElement.dataset.accent = ACCENTS.some(a=>a[0]===S.settings.accent) ? S.settings.accent : 'gold';
}
const ACCENTS = [['gold','Gold'],['red','Hot red'],['orange','Laser orange'],['green','Acid lime'],['blue','Electric cyan'],['purple','Ultraviolet'],['pink','Neon magenta']];
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

function render(){
  applyTheme();
  demoBar();
  document.querySelectorAll('[data-tab]').forEach(b => b.dataset.tab === tab ? b.setAttribute('aria-current','page') : b.removeAttribute('aria-current'));
  { const tabs = [...document.querySelectorAll('.tabbar [data-tab]')]; const ti = tabs.findIndex(b => b.dataset.tab === tab); const bar = document.querySelector('.tabbar'); bar.style.setProperty('--tab-count', String(tabs.length || 5)); bar.style.setProperty('--ti', String(Math.max(0, ti))); bar.classList.toggle('no-active', ti < 0); }
  const m = $('#main');
  const empty = !S.accounts.length;
  document.body.classList.toggle('welcome-mode', empty);
  document.body.classList.toggle('home-mode', !empty && tab === 'home');
  document.getElementById('homeBg')?.remove();
  if (!empty) stopStars();
  m.innerHTML = `<div class="view">${empty ? viewEmpty() : tab==='accounts' ? viewAccounts() : tab==='calendar' ? viewCalendar() : tab==='progress' ? viewProgress() : tab==='summary' ? viewSummary() : tab==='plan' ? viewPlan() : tab==='snapshot' ? viewSnapshot() : viewHome()}</div>`;
  updateFab();
  updateSignIn();
  bindView();
}
function updateFab(){ $('#fab').hidden = true; $('#headerAdd').hidden = !S.accounts.length; }

const icon = {
  info:'<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  err:'<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 6.5v7M12 16.5v.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
};

function viewEmpty(){
  return `<section class="dwelcome w-min" aria-labelledby="wTitle">
    <div class="w-center">
      <img class="w-logo" src="logos/app/logo-192.png" srcset="logos/app/logo-192.png 1x, logos/app/logo-512.png 2x" width="168" height="168" alt="Debt Slayer logo">
      <h1 id="wTitle" class="w-title">Welcome to<br>Debt <span class="w-killer">Slayer</span></h1>
      <p class="w-sub">Add each debt you owe. Compare snowball, avalanche, and your own order, then pay them off one by one.</p>
    </div>
    <div class="w-actions">
      <button class="w-btn w-primary" data-act="add">Add your first account</button>
      <button class="w-btn w-secondary" id="wImport">Import a backup</button>
      <div class="w-alt"><button type="button" class="w-link" id="wDemo">View sample data</button></div>
      <input type="file" id="wImpFile" accept="application/json,.json" hidden aria-label="Backup file">
      <p class="w-note">${storageMsg()}</p>
    </div></section>`;
}
// ---------- Welcome starfield (canvas, paused when hidden, static for reduced motion) ----------
let starRAF = 0, starState = null;
function stopStars(){ cancelAnimationFrame(starRAF); starRAF = 0; starState = null; }
function startStars(cv){
  stopStars();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, dpr = Math.min(2, devicePixelRatio||1), ctx = cv.getContext('2d');
  let W, H, stars;
  const size = () => { W = cv.clientWidth; H = cv.clientHeight; cv.width = W*dpr; cv.height = H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    const n = Math.round(W*H/4200); stars = Array.from({length:n}, (_,i) => ({ x:Math.random()*W, y:Math.random()*H, s:Math.random()<.85?1.5:2.5, cross:i%23===0, p:Math.random()*6.28, v:.6+Math.random()*1.6 })); };
  size();
  const draw = t => { ctx.clearRect(0,0,W,H);
    for (const st of stars){ const a = reduced ? .7 : .35 + .65*Math.abs(Math.sin(st.p + t/1000*st.v));
      ctx.fillStyle = cv.classList.contains('sky-stars') && document.documentElement.dataset.theme !== 'dark' ? `rgba(70,64,130,${(a*.45).toFixed(2)})` : `rgba(214,214,255,${a.toFixed(2)})`;
      if (st.cross){ ctx.fillRect(st.x-4, st.y-.75, 9, 1.5); ctx.fillRect(st.x-.75, st.y-4, 1.5, 9); } else ctx.fillRect(st.x, st.y, st.s, st.s); } };
  starState = { cv, size, draw };
  if (reduced) { draw(0); return; }
  const loop = t => { if (!document.body.contains(cv) || !cv.offsetParent && getComputedStyle(cv.parentNode).display==='none') return stopStars(); if (!document.hidden) draw(t); starRAF = requestAnimationFrame(loop); };
  starRAF = requestAnimationFrame(loop);
}
addEventListener('resize', () => { if (starState) { starState.size(); starState.draw(performance.now()); } });
document.addEventListener('visibilitychange', () => { const f = document.querySelector('.floaters'); if (f) f.style.animationPlayState = document.hidden ? 'paused' : ''; document.querySelectorAll('.fl').forEach(e => e.style.animationPlayState = document.hidden ? 'paused' : ''); });

function homeBanners(){
  return `${S.banner ? `<div class="banner span-all ${S.banner.good?'good':''}" role="status"><span><b>${esc(S.banner.text.split(' after ')[0])}</b> after ${esc(S.banner.text.split(' after ').slice(1).join(' after '))}</span><button aria-label="Dismiss" data-act="dismissBanner">✕</button></div>` : ''}
    ${!S.flags.backupTip ? `<div class="banner span-all" role="note"><span>${icon.info}</span><span>Tip: ${storageMsg()}</span><button class="btn sm" data-act="export" style="margin-left:auto;width:auto">Export</button><button aria-label="Dismiss tip" data-act="dismissTip" style="margin-left:0">✕</button></div>`:''}`;
}
const IC = {
  down:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  card:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M3 10h18"/></svg>',
  check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  target:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/></svg>',
  cal:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="12" cy="14.5" r="1.3"/></svg>',
  pie:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z"/><path d="M14.5 2.8v6.7h6.7a8 8 0 0 0-6.7-6.7z"/></svg>',
  pct:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18L18 6"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/></svg>',
  spark:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  info:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.4"/></svg>',
};
function ago(iso){
  const d = Math.round((new Date(todayISO()+'T12:00') - new Date(iso+'T12:00')) / 864e5);
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? `${d} days ago` : new Date(iso+'T12:00').toLocaleDateString('en-US',{ month:'short', day:'numeric' });
}
function monthInterest(){ return S.accounts.reduce((a,x) => a + (x.apr && x.balance > 0 ? x.balance * x.apr/100/12 : 0), 0); }
function activityItems(){
  const ev = [];
  S.payments.forEach(p => { const a = S.accounts.find(x => x.id === p.accountId); ev.push({ date:p.date, kind:'pay', p, a }); });
  S.accounts.forEach(a => { if (a.created) ev.push({ date:a.created, kind:'add', a });
    if (a.balance <= 0.004) { const last = S.payments.filter(p => p.accountId === a.id).map(p => p.date).sort().pop(); if (last) ev.push({ date:last, kind:'off', a }); } });
  return ev.sort((x,y) => y.date.localeCompare(x.date) || (x.kind==='off' ? -1 : 1)).slice(0, 6);
}
function activityHTML(){
  const ev = activityItems();
  if (!ev.length) return `<p class="lin-empty">No activity yet. Payments and new accounts show up here.</p>`;
  return `<ul class="sl-act">${ev.map(e => {
    const nm = esc(e.a ? e.a.name : 'a removed account');
    if (e.kind === 'pay') return `<li><span class="ai ai-green">${IC.down}</span><span class="at"><b>Payment made</b><span>${nm}${e.p.interest > 0.004 ? ` · ${money2(e.p.interest)} interest` : ''}</span></span><span class="av"><b class="neg">−${money2(e.p.amount)}</b><time datetime="${e.date}" title="${fmtDay(e.date)}">${ago(e.date)}</time></span><button type="button" class="la-rm" data-rmpay="${e.p.id}" aria-label="Remove ${money2(e.p.amount)} payment to ${nm} on ${fmtDay(e.date)}">Remove</button></li>`;
    if (e.kind === 'off') return `<li><span class="ai ai-gold">${IC.check}</span><span class="at"><b>Paid off</b><span>${nm}</span></span><span class="av"><time datetime="${e.date}" title="${fmtDay(e.date)}">${ago(e.date)}</time></span><span></span></li>`;
    return `<li><span class="ai ai-purple">${IC.card}</span><span class="at"><b>Account added</b><span>${nm}</span></span><span class="av"><time datetime="${e.date}" title="${fmtDay(e.date)}">${ago(e.date)}</time></span><span></span></li>`; }).join('')}</ul>`;
}
let whatIfAmt = 100;
function whatIfTiles(){
  const open = openAccounts(); if (!open.length) return '<p class="lin-empty">Every account is paid off.</p>';
  return `<div class="wi-grid">${open.map(a => { const r = extraResult(a, whatIfAmt); const sooner = (r.d0 && r.d1) ? monthsBetween(r.d1, r.d0) : 0;
    return `<button type="button" class="wi-tile" data-act="extraFor" data-id="${a.id}" aria-label="${esc(a.name)}: balance ${money2(a.balance)}. If you pay ${money(whatIfAmt)} extra, payoff ${sooner>0 ? 'about '+plural(sooner,'month')+' sooner' : 'about the same month'}. Open details.">
      <span class="wi-head">${avatar(a,26,10)}<b>${esc(a.name)}</b></span>
      <span class="wi-k">Balance</span><span class="wi-bal">${money2(a.balance)}</span>
      <span class="wi-div"></span>
      <span class="wi-s">If you pay ${money(whatIfAmt)} extra</span>
      <span class="wi-s">${sooner>0 ? `Payoff ~${plural(sooner,'month')} sooner` : 'Payoff about the same month'}</span></button>`; }).join('')}</div>`;
}
function currentOutlook(){
  const debts = engineDebts(S.accounts);
  const created = S.accounts.map(a => a.created).filter(Boolean).sort();
  const settings = S.settings || {};
  const strategy = settings.strategy || 'snowball';
  const customOrder = strategy === 'custom' ? normalizedCustomOrder() : (settings.customOrder || []);
  const floors = DebtEngine.plannedFloors(debts, {
    strategy, customOrder,
    accelerateFocus: !!settings.accelerateFocus,
    focusMonths: settings.defaultMonths || 6,
  });
  return DebtEngine.paceOutlook(debts, S.payments, {
    today: new Date(),
    since: created[0] || null,
    strategy, customOrder,
    paymentFloors: floors,
    budget: effectiveBudget(settings),
    extraMonthly: Math.max(0, Number(settings.extraMonthly) || 0),
    windfall: Math.max(0, Number(settings.windfall) || 0),
  });
}
function paceCopy(outlook, sim){
  const planName = STRAT[S.settings.strategy]?.label || 'Snowball';
  if (!S.accounts.length) return { title: 'Add a debt', note: '' };
  if (outlook.alreadyFree) return { title: 'Debt free', note: 'Every account is paid off.' };
  if (outlook.notOnTrack) {
    const note = outlook.basis === 'pace' ? 'Your recent payments don’t cover the interest.' : 'The plan’s payments don’t cover the interest.';
    return { title: 'Not on track', note };
  }
  let note = outlook.basis === 'plan'
    ? 'No recent payment history, so this follows your plan.'
    : `At about ${money2(outlook.monthly)} a month, from today.`;
  if (outlook.basis === 'pace' && sim && sim.freeDate && outlook.freeDate) {
    const diff = monthsBetween(outlook.freeDate, sim.freeDate);
    if (diff > 0) note += ` ${diff === 1 ? 'One month' : plural(diff, 'month')} sooner than your ${planName} plan (${fmtMonth(sim.freeDate)}).`;
    else if (diff < 0) note += ` ${plural(-diff, 'month')} later than your ${planName} plan (${fmtMonth(sim.freeDate)}).`;
    else note += ` Same month as your ${planName} plan.`;
  } else if (sim && sim.freeDate) note += ` ${planName} plan: ${fmtMonth(sim.freeDate)}.`;
  return { title: fmtMonth(outlook.freeDate), note };
}
function viewHome(){
  const t = totals(); const sim = simulate(S.accounts); const open = openAccounts();
  const next = open[0]; const outlook = currentOutlook(); const free = paceCopy(outlook, sim);
  const planN = next ? (sim.firstPay[next.id] || next.min) : 0;
  const due = next && next.dueDay ? nextDue(next.dueDay) : null;
  const dueTxt = !next ? '' : !due ? 'No due date' : due.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  const paidM = paidThisMonth(), prevM = paidInMonth(-1), intM = monthInterest();
  const delta = paidM - prevM;
  const deltaTxt = paidM <= 0 ? 'No payments logged this month yet' : prevM <= 0 ? `${money2(paidM)} logged this month` : delta === 0 ? `${money2(paidM)} logged, same as last month` : delta > 0 ? `${money2(paidM)} logged, ${money2(delta)} more than last month` : `${money2(paidM)} logged, ${money2(-delta)} less than last month`;
  return `<div class="calm">
    ${homeBanners()}
    <section aria-label="Total debt"><p class="calm-kicker">Total debt</p><p class="calm-amt">${money2(t.left)}</p></section>
    <section aria-label="Next payment"><p class="calm-kicker">Next payment</p>
      ${next ? `<p class="calm-name">${avatar(next, 24, 12)}<span>${esc(next.name)}</span></p><p class="calm-sub">${money2(planN)} · ${dueTxt}</p><div class="calm-actions"><button type="button" class="btn primary" data-act="log" data-id="${next.id}">Log payment</button></div>` : `<p class="calm-name">Nothing due</p><p class="calm-sub">${open.length ? 'Add a due date on the account.' : 'Every account is paid off.'}</p>`}
    </section>
    <section aria-label="Debt-free date"><p class="calm-kicker">Debt-free</p><p class="calm-date">${esc(free.title)}</p>${free.note ? `<p class="calm-note">${esc(free.note)}</p>` : ''}</section>
    <nav class="calm-links" aria-label="More">
      <button type="button" data-act="toPlan">Plan</button>
      <button type="button" data-act="toSnapshot">This week</button>
      <button type="button" data-act="toCalendar">Calendar</button>
      <button type="button" data-act="toAccounts">Accounts</button>
    </nav>
    <div>
      <button type="button" class="disclose" data-act="disclose" aria-expanded="false" aria-controls="home-more" id="homeMoreBtn"><span>This month and activity</span><span class="mark" aria-hidden="true"></span></button>
      <div id="home-more" class="more-panel" hidden>
        <section class="gcard" aria-labelledby="tmT"><h2 id="tmT" class="g-h">This month</h2><p class="calm-sub">${deltaTxt}</p>
          <div class="sl-sum"><div><b>${money2(paidM)}</b><span>Paid toward debt</span></div><div><b>${intM > 0 ? money2(intM) : '—'}</b><span>${intM > 0 ? 'Interest, estimated' : 'No interest rates'}</span></div></div></section>
        <section class="gcard" aria-labelledby="actT"><h2 id="actT" class="g-h">Activity</h2>${activityHTML()}</section>
        <section class="gcard sl-whatif" aria-labelledby="simT">
          <div class="wi-top"><h2 id="simT" class="g-h">What if you paid extra?</h2>
            <label class="wi-amt"><span>Extra per month</span><span class="wi-in">$<input id="wiIn" inputmode="decimal" value="${whatIfAmt}" aria-label="Extra payment per month for the account tiles"></span></label></div>
          <div id="wiTiles">${whatIfTiles()}</div>
          <div class="wi-all"><div class="micro">All accounts together</div>
            <div class="sim-input"><span class="mid">$</span><label class="sr-only" for="simIn">Extra per month</label><input id="simIn" inputmode="decimal" placeholder="0" value="${simExtra||''}"><span class="muted">a month</span></div>
            <div class="chips" role="group" aria-label="Quick amounts">${[50,100,200,500].map(v=>`<button class="chip" data-extra="${v}" aria-pressed="${simExtra===v}">$${v}</button>`).join('')}<button class="chip" data-extra="0">Clear</button></div>
            <p id="simOut" class="muted" aria-live="polite" style="margin:14px 0 0"></p></div>
        </section>
        <nav class="calm-links" aria-label="Also"><button type="button" data-act="toSummary">Monthly summary</button><button type="button" data-act="toProgress">Progress</button></nav>
      </div>
    </div>
  </div>`;
}
let snapWeek = null;
function fmtWeek(start, end){
  const a = new Date(start + 'T12:00'), b = new Date(end + 'T12:00');
  const left = a.toLocaleDateString('en-US', { month:'short', day:'numeric', year: a.getFullYear() === b.getFullYear() ? undefined : 'numeric' });
  const right = b.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  return left + ' – ' + right;
}
function viewSnapshot(){
  const today = new Date();
  const cur = DebtEngine.weekContaining(today).start;
  let start = snapWeek || cur;
  if (start > cur) start = cur;
  const snap = DebtEngine.weeklySnapshot(S.accounts, S.payments, S.adjustments || [], start, today);
  const sim = simulate(S.accounts);
  const free = paceCopy(currentOutlook(), sim);
  const change = snap.totals.change;
  const changeTxt = Math.abs(change) < 0.005 ? 'No change' : (change < 0 ? 'Down ' : 'Up ') + money2(Math.abs(change));
  const pct = snap.totals.percentPaid;
  const pctTxt = pct < 0 ? 'Balances are above the amounts you started with.' : Math.round(pct * 100) + '% paid off since you started.';
  const rows = snap.rows.map(r => {
    const flags = [r.addedThisWeek ? 'Added' : '', r.paidOff ? 'Paid off' : ''].filter(Boolean).join(' · ');
    const pays = r.payments.map(p => `<div class="snap-pay">${fmtDay(p.date)} · ${money2(p.amount)} · ${money2(p.interest)} interest · ${money2(p.principal)} principal${p.legacy ? ' · Legacy' : ''}</div>`).join('');
    const acct = S.accounts.find(a => a.id === r.id) || { name: r.name, type: 'Other' };
    return `<tr><th scope="row"><span class="snap-who">${avatar(acct, 22, 11)}<span>${esc(r.name)}</span></span>${flags ? `<span class="snap-flag">${flags}</span>` : ''}${pays}</th><td data-label="Start">${money2(r.start)}</td><td data-label="Paid">${money2(r.paid)}</td><td data-label="Interest">${money2(r.interest)}</td><td data-label="Principal">${money2(r.principal)}</td><td data-label="End">${money2(r.end)}</td></tr>`;
  }).join('');
  return `<article class="snap"><header class="snap-top"><div><p class="snap-kicker">Weekly snapshot</p><h1>${fmtWeek(snap.start, snap.end)}</h1></div>
    <div class="snap-nav no-print"><button type="button" data-act="snapPrev">Previous week</button><button type="button" data-act="snapToday">This week</button><button type="button" data-act="snapNext" ${start >= cur ? 'disabled' : ''}>Next week</button><button type="button" data-act="snapPrint">Print or save PDF</button></div></header>
    <section class="snap-hero" aria-label="This week"><div><p>Total debt</p><b>${money2(snap.totals.debt)}</b></div><div><p>Change this week</p><b>${changeTxt}</b></div><div><p>Paid this week</p><b>${money2(snap.totals.paid)}</b></div><div><p>Debt-free at your pace</p><b>${esc(free.title)}</b></div></section>
    ${free.note ? `<p class="snap-pace">${esc(free.note)}</p>` : ''}
    <section class="snap-detail"><h2>By debt</h2>
      ${rows ? `<table class="snap-table"><thead><tr><th scope="col">Debt</th><th scope="col">Start</th><th scope="col">Paid</th><th scope="col">Interest</th><th scope="col">Principal</th><th scope="col">End</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="snap-foot">No balances in this week.</p>'}
      <p class="snap-foot">${esc(pctTxt)} Interest this week ${money2(snap.totals.interest)}. Principal ${money2(snap.totals.principal)}. The debt-free date is projected from today.</p>
    </section></article>`;
}

function simText(){
  const base = simulate(S.accounts), w = simulate(S.accounts,{extra:simExtra});
  if (!simExtra) return 'Try an amount and watch the date move.';
  if (!w.freeDate) return 'Add a payment amount to see a date.';
  const d = base.freeDate ? monthsBetween(w.freeDate, base.freeDate) : 0;
  const saved = base.totalInterest - w.totalInterest;
  return `<b style="color:var(--text)">${debtFree(w.freeDate)}</b> — ${d>0? (d===1?'a month':plural(d,'month'))+' sooner':'same month'}${saved>0.5?`, saving about ${money(saved)} in interest`:''}.`;
}

function acctCard(a, sim){
  const done = a.balance <= 0.004; const pct = a.start ? (1 - a.balance/a.start) : 0;
  const pay = sim.firstPay[a.id];
  return `<button class="acct card glass ${done?'done':''}" data-act="detail" data-id="${a.id}" aria-label="${esc(a.name)}, ${done?'paid off':money2(a.balance)+' left'}">
    <div class="row">${avatar(a)}
      <div style="flex:1;min-width:0"><div class="name">${esc(a.name)}</div>
      <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:4px"><span class="pill">${done?'Knocked out':paceLabel(a)}</span><span class="pill type" style="--tc:${TYPE_COLORS[a.type]}">${esc(a.type)}</span>${a.dueDay?`<span class="pill">Due ${nextDue(a.dueDay).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>`:''}</div></div></div>
    <div class="mid" style="margin-top:12px">${done?'Paid off':money2(a.balance)+' left'}</div>
    <div class="bar"><i style="width:${pct*100}%"></i></div>
    <div class="small" style="margin-top:8px">${done?`${money2(a.start)} paid`:`Pay ${money2(pay||0)} · done ${sim.payoff[a.id]?fmtMonShort(sim.payoff[a.id]):'—'}`}${!done&&!a.apr?' · No interest rate entered':''}</div>
  </button>`;
}
function nextDue(day){ const n = new Date(); let d = new Date(n.getFullYear(), n.getMonth(), Math.min(day, dim(n.getFullYear(),n.getMonth()))); if (d < new Date(n.getFullYear(),n.getMonth(),n.getDate())) d = new Date(n.getFullYear(), n.getMonth()+1, Math.min(day, dim(n.getFullYear(),n.getMonth()+1))); return d; }
function dim(y,m){ return new Date(y,m+1,0).getDate(); }

// ---------- due-date urgency ----------
// Rule: for each account with a due day, this month's due date is "covered" if a payment was
// logged in the 30 days before it or any time after. If this month's due date has passed,
// isn't covered, and falls on/after the day the account was added, it's Overdue.
// If it's today and not covered, it's Due today. Otherwise we count days to the next due date.
const DAY = 864e5;
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dueOn = (y, m, day) => new Date(y, m, Math.min(day, dim(y, m)));
function covered(a, d){ const from = +d - 30*DAY; return S.payments.some(p => p.accountId === a.id && +new Date(p.date+'T00:00') >= from); }
function dueInfo(a){
  if (!a.dueDay || a.balance <= 0.004) return null;
  const t = midnight(new Date()); const cur = dueOn(t.getFullYear(), t.getMonth(), a.dueDay);
  const created = a.created ? new Date(a.created+'T00:00') : new Date(0);
  if (+cur < +t && +cur >= +created && !covered(a, cur)) return { level:'overdue', date:cur, days:Math.round((cur-t)/DAY), text:'Overdue', full:`Overdue since ${cur.toLocaleDateString('en-US',{month:'short',day:'numeric'})}` };
  if (+cur === +t && !covered(a, cur)) return { level:'today', date:cur, days:0, text:'Due today' };
  const next = +cur > +t ? cur : dueOn(t.getFullYear(), t.getMonth()+1, a.dueDay);
  const days = Math.round((next - t)/DAY);
  const level = days <= 3 ? 'soon' : days <= 7 ? 'week' : 'later';
  const text = days <= 7 ? (days === 1 ? 'Due tomorrow' : `Due in ${plural(days,'day')}`) : `Due ${next.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
  return { level, date:next, days, text };
}
const dueIcon = { overdue:'⚠︎ ', today:'● ', soon:'', week:'', later:'' };
function dueChip(a){ const d = dueInfo(a); return d ? `<span class="due due-${d.level}" title="${esc(d.full||d.text)}">${dueIcon[d.level]}${esc(d.text)}</span>` : ''; }
const URGENCY_ORDER = { overdue:0, today:1, soon:2, week:3, later:4 };

// ---------- pace ----------
const PACE_ICON = { aggressive:'<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 1.5s1 3.5-1.5 6.5-5 4.5-5 8.5A6 6 0 0 0 19 17c0-3-1.5-5-2.5-6 0 2-1 3-2 3 1.5-4 .5-9-1-12.5z"/></svg>',
  moderate:'<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 15h4l3-9 3 12 2-6h4v2h-2.6l-3.4 10-3-12-2 5H4z"/></svg>',
  conservative:'<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3c5 0 8 3.5 8 8 0 5-4 8-8 10-4-2-8-5-8-10 0-4.5 3-8 8-8z" opacity=".9"/></svg>' };
function paceTag(a){ if (a.balance<=0.004) return `<span class="pace pace-done">✓ Paid off</span>`; return a.tier ? `<span class="pace pace-${a.tier}">${PACE_ICON[a.tier]}${TIERS[a.tier].label}</span>` : `<span class="pace pace-none">Snowball</span>`; }
function miniRing(pct, color){ const R=11, C=2*Math.PI*R, p=Math.max(0,Math.min(1,pct)); return `<svg class="mini-ring" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="${R}" fill="none" stroke="var(--fill2)" stroke-width="4"/><circle cx="14" cy="14" r="${R}" fill="none" style="stroke:${color};color:${color}" class="ring-glow" stroke-width="4" stroke-linecap="round" stroke-dasharray="${C*p} ${C}" transform="rotate(-90 14 14)"/></svg>`; }

// ---------- Accounts: App Library-style folders ----------
function tile(a, rank, sim){
  const done = a.balance <= 0.004; const pct = a.start ? 1 - a.balance/a.start : 1;
  const d = dueInfo(a);
  const label = `${a.name}. ${done?'Paid off':money2(a.balance)+' left'}. ${done?'':(STRAT[S.settings.strategy]?.label || 'Plan')+' number '+rank+'. '}${done?'':(a.apr?a.apr+'% APR. ':'No APR. ')+'Minimum '+money2(a.min)+'. '}${paceLabel(a)}. ${d?(d.full||d.text):'No due date'}.`;
  return `<button class="acct tile glass ${a.tier&&!done?'t-'+a.tier:''} ${done?'t-done':''}" data-act="detail" data-id="${a.id}" aria-label="${esc(label)}">
    <div class="tile-top"><span class="tile-id">${avatar(a,22,12)}<span class="name">${esc(a.name)}</span></span>${miniRing(pct, done?'var(--green-bar)':CAT[a.type].strong)}${done?'<span class="rank rank-done" aria-hidden="true">✓</span>':`<span class="rank" aria-hidden="true">#${rank}</span>`}</div>
    <div class="tile-bal">${done?money(a.start):money2(a.balance)}</div>
    <div class="tile-facts">${done ? 'Paid off' : `${a.apr ? a.apr + '% APR' : 'No APR'} · min ${money2(a.min)}`}</div>
    <div class="tile-meta">${paceTag(a)}${dueChip(a)}</div>
  </button>`;
}
function stackTile(list, catKey){
  return `<button class="tile stack glass" data-act="expandCat" data-cat="${catKey}" aria-label="Show ${plural(list.length,'more account')}: ${esc(list.map(a=>a.name).join(', '))}">
    <div class="stack-grid">${list.slice(0,4).map(a=>avatar(a,30,11)).join('')}</div><div class="stack-n">+${list.length}</div><div class="small">Show all</div></button>`;
}
function folder({ key, title, list, sim, ranks, color, total, defaultOpen }){
  const open = UI.open[key] ?? defaultOpen; const exp = !!UI.expanded[key];
  let tiles;
  if (list.length > 4 && !exp) tiles = list.slice(0,3).map(a=>tile(a,ranks[a.id],sim)).join('') + stackTile(list.slice(3), key);
  else tiles = list.map(a=>tile(a,ranks[a.id],sim)).join('') + (list.length>4 ? `<button class="tile less glass" data-act="expandCat" data-cat="${key}">Show less</button>` : '');
  return `<section class="folder glass ${exp?'expanded':''}" style="--cat:${color}">
    <h3 class="folder-h"><button class="folder-btn" aria-expanded="${open}" aria-controls="fb-${key}" data-act="toggleCat" data-cat="${key}">
      <span class="cat-dot" aria-hidden="true"></span><span class="folder-title">${esc(title)}</span>
      <span class="folder-count">${list.length}</span><span class="folder-total">${money(total)}</span>
      <svg class="chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></h3>
    <div class="folder-body" id="fb-${key}" ${open?'':'hidden'}><div class="tiles n${Math.min(list.length,3)}">${tiles}</div></div></section>`;
}
function legendHTML(){
  return `<details class="legend-box"><summary>What the colors mean</summary><div class="legend-grid">
    <div><div class="micro">Due dates</div><div class="chips-col"><span class="due due-overdue">⚠︎ Overdue</span><span class="due due-today">● Due today</span><span class="due due-soon">Due in 1–3 days</span><span class="due due-week">Due in 4–7 days</span><span class="due due-later">Later</span></div>
    <p class="small">Overdue means this month’s due date has passed with no payment logged in the 30 days before it (or since). Due dates before you added the account don’t count.</p></div>
    <div><div class="micro">Pace</div><div class="chips-col">${['aggressive','moderate','conservative'].map(k=>`<span class="pace pace-${k}">${PACE_ICON[k]}${TIERS[k].label}</span>`).join('')}<span class="pace pace-none">Snowball (no tint)</span></div></div>
    <div><div class="micro">Categories</div><div class="chips-col">${Object.values(CAT).map(c=>`<span class="cat-chip" style="--cat:${c.strong}"><i></i>${c.label}</span>`).join('')}</div></div>
  </div></details>`;
}
function viewAccounts(){
  const sim = simulate(S.accounts); const open = openAccounts(); const done = S.accounts.filter(a=>a.balance<=0.004);
  const ranks = {}; open.forEach((a,i)=>ranks[a.id]=i+1);
  const dues = open.map(a=>({a,d:dueInfo(a)})).filter(x=>x.d).sort((x,y)=>URGENCY_ORDER[x.d.level]-URGENCY_ORDER[y.d.level] || x.d.date-y.d.date);
  const nd = dues[0];
  const defOpen = S.accounts.length <= 8 || true;
  const folders = TYPES.map(t => ({ t, list: open.filter(a=>a.type===t) })).filter(f=>f.list.length).map(f => folder({ key:CAT[f.t].key, title:CAT[f.t].label, list:f.list, sim, ranks, color:CAT[f.t].strong, total:f.list.reduce((s,a)=>s+a.balance,0), defaultOpen:defOpen })).join('');
  return `<h1 class="large-title">Accounts</h1>
  <div class="summary-row glass"><div><span class="micro">Total owed</span><b>${money2(totals().left)}</b></div><div><span class="micro">Accounts</span><b>${open.length} open${done.length?` · ${done.length} paid`:''}</b></div>
    <div><span class="micro">Next due</span><b>${nd?esc(nd.a.name):'—'}</b>${nd?`<span class="due due-${nd.d.level}" title="${esc(nd.d.full||nd.d.text)}">${dueIcon[nd.d.level]}${esc(nd.d.full||nd.d.text)}</span>`:''}</div></div>
  <div class="toolbar"><button class="btn sm" data-act="check">Check my balances</button><button class="btn sm" data-act="calAll" aria-label="Add reminders to Google Calendar"><span class="lbl-full">Add reminders to Google Calendar</span><span class="lbl-short">Add to Calendar</span></button></div>
  <div class="section-head"><h2>${esc(STRAT[S.settings.strategy]?.label || 'Snowball')} order</h2><span class="muted">${open.length?plural(open.length,'account')+' to go':'All done'}</span></div>
  <p class="tip">${icon.info}<span>${S.settings.strategy==='avalanche'?'Highest interest rate goes first, so you pay less interest.':S.settings.strategy==='custom'?'This is the order you set on the Plan tab.':'Smallest balance goes first. Each paid-off debt is a quick win, and its payment rolls into the next one.'} The #1, #2… badges show that order. APR and minimum are on each tile.</span></p>
  ${legendHTML()}
  <div class="folders">${folders}${done.length?folder({ key:'paidoff', title:'Paid off', list:done, sim, ranks, color:'var(--green-bar)', total:done.reduce((s,a)=>s+a.start,0), defaultOpen:false }):''}</div>`;
}

// ---------- Calendar ----------
let calMonth = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); })();
function duesInMonth(y, m){
  const map = {};
  openAccounts().forEach(a => { if (!a.dueDay) return; const d = dueOn(y, m, a.dueDay).getDate(); (map[d] = map[d] || []).push(a); });
  return map;
}
let calFocus = null;
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function viewCalendar(){
  const y = calMonth.getFullYear(), m = calMonth.getMonth(); const t = midnight(new Date());
  const map = duesInMonth(y, m); const first = new Date(y, m, 1).getDay(); const days = dim(y, m);
  const sim = simulate(S.accounts);
  const focusDay = calFocus && calFocus.y === y && calFocus.m === m ? Math.min(calFocus.d, days) : (y === t.getFullYear() && m === t.getMonth() ? t.getDate() : 1);
  const weeks = []; let row = Array(first).fill(null);
  for (let d=1; d<=days; d++){ row.push(d); if (row.length === 7){ weeks.push(row); row = []; } }
  if (row.length){ while (row.length < 7) row.push(null); weeks.push(row); }
  const cell = d => {
    if (!d) return '<div role="gridcell" class="cal-cell blank"></div>';
    const date = new Date(y, m, d); const list = map[d] || []; const isToday = +date === +t;
    const urg = list.map(a => dueInfo(a)).filter(x => x && (+x.date === +date));
    const lvl = urg.some(x => x.level === 'overdue') ? 'overdue' : urg.some(x => x.level === 'today') ? 'today' : '';
    const label = `${WEEKDAYS[date.getDay()]}, ${MONTHS[m]} ${d}${isToday ? ', today' : ''}${list.length ? `, ${plural(list.length, 'payment')} due: ${list.map(a => a.name).join(', ')}` : ', no payments due'}${lvl === 'overdue' ? ', overdue' : lvl === 'today' ? ', due today' : ''}`;
    const inner = `<span class="cal-num">${d}</span>${lvl ? `<span class="cal-flag flag-${lvl}" aria-hidden="true">${lvl === 'overdue' ? '!' : '•'}</span>` : ''}
      <span class="cal-dots" aria-hidden="true">${list.slice(0, 4).map(a => `<i style="background:${CAT[a.type].strong};--c:${CAT[a.type].strong}"></i>`).join('')}</span>
      <span class="cal-pills" aria-hidden="true">${list.slice(0, 3).map(a => `<span class="cal-pill" style="--cat:${CAT[a.type].strong}">${avatar(a, 16, 8)}<span>${esc(a.name)}</span></span>`).join('')}${list.length > 3 ? `<span class="small">+${list.length - 3} more</span>` : ''}</span>`;
    return `<div role="gridcell" class="cal-cell ${list.length ? 'has' : ''} ${isToday ? 'today' : ''} ${lvl ? 'u-' + lvl : ''}" tabindex="${d === focusDay ? 0 : -1}" data-day="${d}" aria-selected="${d === focusDay ? 'true' : 'false'}" ${isToday ? 'aria-current="date"' : ''} aria-label="${esc(label)}">${inner}</div>`;
  };
  const grid = `<div role="row" class="cal-dow">${WEEKDAYS.map(n => `<div role="columnheader">${n.slice(0, 3)}<span class="sr-only">${n.slice(3)}</span></div>`).join('')}</div>`
    + weeks.map(week => `<div role="row">${week.map(cell).join('')}</div>`).join('');
  // upcoming 7 days (plus overdue)
  const up = openAccounts().map(a=>({a,d:dueInfo(a)})).filter(x=>x.d && (x.d.level!=='later')).sort((x,y)=>URGENCY_ORDER[x.d.level]-URGENCY_ORDER[y.d.level]||x.d.date-y.d.date);
  const cats = [...new Set(openAccounts().filter(a=>a.dueDay).map(a=>a.type))];
  return `<h1 class="large-title">Calendar</h1><p class="subtitle">Due dates for your open accounts</p>
  <section class="card glass cal">
    <div class="cal-head"><h2 class="mid" style="margin:0" aria-live="polite">${MONTHS[m]} ${y}</h2>
      <div class="row" style="gap:6px"><button class="icon-btn" data-act="calPrev" aria-label="Previous month">‹</button><button class="btn sm" data-act="calToday">Today</button><button class="icon-btn" data-act="calNext" aria-label="Next month">›</button></div></div>
    <p class="sr-only" id="calHelp">Arrow keys move between days. Home and End move to the start and end of the week. Page Up and Page Down change month. Enter opens a day that has a payment due.</p>
    <div class="cal-grid" role="grid" aria-readonly="true" aria-labelledby="calHelp" aria-label="${MONTHS[m]} ${y}" data-cal-grid aria-rowcount="${weeks.length + 1}" aria-colcount="7">${grid}</div>
    <div class="legend" style="margin-top:12px">${cats.map(c=>`<span class="cat-chip" style="--cat:${CAT[c].strong}"><i></i>${CAT[c].label}</span>`).join('')}<span><span class="cal-flag flag-today static">•</span> Due today</span><span><span class="cal-flag flag-overdue static">!</span> Overdue</span></div>
  </section>
  <section class="card glass" style="margin-top:14px"><h2 class="micro">Upcoming · next 7 days</h2>
    ${up.length?`<ul class="list" style="margin-top:6px">${up.map(({a,d})=>`<li>${avatar(a,34,12)}<span style="flex:1;min-width:0"><b>${esc(a.name)}</b><br><span class="small">${money2(sim.firstPay[a.id]||a.min)} · ${a.tier?TIERS[a.tier].label:'Snowball'} pace</span></span><span class="due due-${d.level}" title="${esc(d.full||d.text)}">${dueIcon[d.level]}${esc(d.full||d.text)}</span></li>`).join('')}</ul>`:'<p class="muted">Nothing due in the next 7 days.</p>'}
  </section>`;
}
function openDay(day, trigger){
  const y = calMonth.getFullYear(), m = calMonth.getMonth(); const list = duesInMonth(y,m)[day] || []; const sim = simulate(S.accounts);
  const body = `<ul class="list">${list.map(a=>`<li>${avatar(a,40,14)}<span style="flex:1;min-width:0"><b>${esc(a.name)}</b><br><span class="small">${esc(CAT[a.type].label)} · ${money2(a.balance)} left</span><br>${paceTag(a)} ${dueChip(a)}</span>
    <span style="text-align:right"><b>${money2(sim.firstPay[a.id]||a.min)}</b><br><span class="small">${sim.firstPay[a.id]>a.min+0.004?'plan':'minimum'}</span><br><button class="btn sm primary" data-log="${a.id}" style="margin-top:6px">Log payment</button></span></li>`).join('')}</ul>
    <div class="form-actions"><button class="btn" data-close>Close</button></div>`;
  openDialog({ title:`${MONTHS[m]} ${day}`, body, trigger, onMount: sh => {
    sh.querySelector('.form-actions [data-close]').addEventListener('click', closeTop);
    sh.querySelectorAll('[data-log]').forEach(b => b.addEventListener('click', e => openLog(S.accounts.find(x=>x.id===b.dataset.log), e.currentTarget)));
  }});
}
function bindExtra(m){
  m.querySelectorAll('[data-act=toggleCat]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.cat; const now = b.getAttribute('aria-expanded') !== 'true'; UI.open[k] = now; saveUI();
    b.setAttribute('aria-expanded', String(now)); document.getElementById('fb-'+k).hidden = !now; }));
  m.querySelectorAll('[data-act=expandCat]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.cat; UI.expanded[k] = !UI.expanded[k]; saveUI(); render();
    const tgt = UI.expanded[k] ? document.querySelector(`#fb-${k} .tile:nth-child(4)`) : document.querySelector(`#fb-${k} .stack`); tgt && tgt.focus(); }));
  m.querySelectorAll('[data-act=calPrev],[data-act=calNext],[data-act=calToday]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act; const n = new Date();
    calMonth = a==='calToday' ? new Date(n.getFullYear(), n.getMonth(), 1) : addMonths(calMonth, a==='calPrev'?-1:1);
    if (a === 'calToday') calFocus = { y: calMonth.getFullYear(), m: calMonth.getMonth(), d: n.getDate() };
    render(); document.querySelector(`[data-act=${a}]`)?.focus(); }));
  m.querySelectorAll('[data-cal-grid] [data-day]').forEach(b => b.addEventListener('click', () => {
    focusCalDay(+b.dataset.day);
    if (b.classList.contains('has')) openDay(+b.dataset.day, b);
  }));
  m.querySelector('[data-cal-grid]')?.addEventListener('keydown', onCalKey);
}
function focusCalDay(day){
  const grid = document.querySelector('[data-cal-grid]'); if (!grid) return;
  const cells = [...grid.querySelectorAll('[data-day]')];
  const el = cells.find(c => +c.dataset.day === day);
  if (!el) return;
  cells.forEach(c => { c.tabIndex = -1; c.setAttribute('aria-selected', 'false'); });
  el.tabIndex = 0; el.setAttribute('aria-selected', 'true'); el.focus();
  calFocus = { y: calMonth.getFullYear(), m: calMonth.getMonth(), d: day };
}
function onCalKey(e){
  const keys = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','Enter',' '];
  if (!keys.includes(e.key)) return;
  const cell = e.target.closest('[data-day]'); if (!cell) return;
  const day = +cell.dataset.day;
  const y = calMonth.getFullYear(), m = calMonth.getMonth(), days = dim(y, m);
  if (e.key === 'Enter' || e.key === ' ') {
    if (cell.classList.contains('has')) { e.preventDefault(); openDay(day, cell); }
    return;
  }
  e.preventDefault();
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    calMonth = addMonths(calMonth, e.key === 'PageUp' ? -1 : 1);
    const nd = Math.min(day, dim(calMonth.getFullYear(), calMonth.getMonth()));
    calFocus = { y: calMonth.getFullYear(), m: calMonth.getMonth(), d: nd };
    render(); focusCalDay(nd); return;
  }
  const weekday = new Date(y, m, day).getDay();
  let next = day;
  if (e.key === 'ArrowLeft') next = day - 1;
  if (e.key === 'ArrowRight') next = day + 1;
  if (e.key === 'ArrowUp') next = day - 7;
  if (e.key === 'ArrowDown') next = day + 7;
  if (e.key === 'Home') next = day - weekday;
  if (e.key === 'End') next = day + (6 - weekday);
  if (next < 1) {
    calMonth = addMonths(calMonth, -1);
    next = dim(calMonth.getFullYear(), calMonth.getMonth()) + next;
    calFocus = { y: calMonth.getFullYear(), m: calMonth.getMonth(), d: next };
    render(); focusCalDay(next); return;
  }
  if (next > days) {
    next = next - days;
    calMonth = addMonths(calMonth, 1);
    calFocus = { y: calMonth.getFullYear(), m: calMonth.getMonth(), d: next };
    render(); focusCalDay(next); return;
  }
  focusCalDay(next);
}

// ---------- Per-account what-if (preview only) ----------
let sumOffset = 0;
function monthSummary(off){
  const now = new Date(), y = now.getFullYear(), m = now.getMonth() + off;
  const start = new Date(y, m, 1), end = new Date(y, m + 1, 0), sIso = isoOf(start), eIso = isoOf(end);
  const pays = S.payments.filter(p => p.date >= sIso && p.date <= eIso);
  const reduced = pays.reduce((a,p) => a + p.amount, 0);
  const prevS = isoOf(new Date(y, m-1, 1)), prevE = isoOf(new Date(y, m, 0));
  const prev = S.payments.filter(p => p.date >= prevS && p.date <= prevE).reduce((a,p) => a + p.amount, 0);
  let onTime = 0, judged = 0;
  pays.forEach(p => { const a = S.accounts.find(x => x.id === p.accountId); if (!a || !a.dueDay) return; judged++; const due = isoOf(new Date(y, m, Math.min(a.dueDay, dim(start.getFullYear(), start.getMonth())))); if (p.date <= due) onTime++; });
  const startTotal = S.accounts.reduce((a,x) => a + (x.start || 0), 0);
  const leftEnd = S.accounts.reduce((a,x) => a + Math.max(0, x.balance), 0) + S.payments.filter(p => p.date > eIso).reduce((a,p) => a + p.amount, 0);
  const pct = startTotal ? Math.max(0, Math.min(1, 1 - leftEnd / startTotal)) : 0;
  const paidOff = S.accounts.filter(a => a.balance <= 0.004 && pays.some(p => p.accountId === a.id) && !S.payments.some(p => p.accountId === a.id && p.date > eIso));
  const first = [...S.accounts.map(a => a.created || todayISO()), ...S.payments.map(p => p.date)].sort()[0] || todayISO();
  return { start, end, pays, reduced, prev, onTime, judged, pct, paidOff, canPrev: sIso > first.slice(0,8) + '01', canNext: off < 0 };
}
function viewSummary(){
  const M = monthSummary(sumOffset), open = openAccounts(), sim = simulate(S.accounts);
  const mName = fmtMonth(M.start), cur = sumOffset === 0;
  const rng = `${M.start.toLocaleDateString('en-US',{ month:'short', day:'numeric' })} – ${M.end.toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' })}`;
  const line = !open.length ? 'Every account is paid off. You did it.' : M.pct >= .75 ? 'The finish line is in sight. Keep swinging.' : M.pct >= .5 ? 'Past halfway. Keep the momentum going.' : M.reduced > 0 ? 'You’re making progress. Keep going.' : 'Every payment counts. Let’s get one in.';
  const n = M.pays.length;
  const onNote = !n ? (cur ? 'No payments logged yet this month.' : 'No payments logged that month.') : M.judged === n ? (M.onTime === n ? 'All on or before the due date.' : `${M.onTime} of ${n} on or before the due date.`) : M.judged ? `${M.onTime} of ${M.judged} with due dates were on time.` : 'Add due dates to track on-time payments.';
  const reducedNote = M.reduced > 0 ? (M.prev > 0 ? (M.reduced >= M.prev ? `Up ${money2(M.reduced - M.prev)} from the month before.` : `${money2(M.prev - M.reduced)} less than the month before.`) : 'Great start. You’re moving in the right direction.') : 'Log a payment to start the count.';
  // reminders
  const rem = open.map(a => ({ a, d: dueInfo(a) })).filter(x => x.d).sort((x,y) => x.d.days - y.d.days).slice(0, 3);
  const remHTML = rem.length ? `<ul class="sum-rem">${rem.map(({a,d}) => `<li><span class="ai ai-gold">${IC.cal}</span><span class="at"><b>${esc(a.name)}</b><span>Due ${d.date.toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' })} · ${money2(sim.firstPay[a.id] || a.min)}</span></span><span class="sum-days u-${d.level}">${d.level === 'overdue' ? 'Overdue' : d.days === 0 ? 'Due today' : plural(d.days, 'day') + ' left'}</span></li>`).join('')}</ul>`
    : `<p class="lin-empty">${open.length ? 'Add due dates to your accounts to see reminders here.' : 'Nothing due. Every account is paid off.'}</p>`;
  // takeaways
  const tk = [];
  if (M.reduced > 0) tk.push(`You logged <b class="pos">${money2(M.reduced)}</b> in payments in ${mName}.`); else tk.push(`No payments were logged in ${mName}${cur ? ' yet' : ''}.`);
  if (n) tk.push(`You made <b>${plural(n,'payment')}</b>${M.judged === n && M.onTime === n ? ', all on time. Consistency is key.' : '.'}`);
  if (M.paidOff.length) tk.push(`You knocked out ${M.paidOff.map(a => `<b>${esc(a.name)}</b>`).join(', ')}.`);
  else if (sim.freeDate) tk.push(`At this pace you’ll be ${debtFree(sim.freeDate).replace(/^D/,'d')}, and you’re <b>${Math.round(M.pct*100)}%</b> of the way there.`);
  // recommendations
  const rc = []; const nx = open[0];
  if (nx) { const r = extraResult(nx, 50); const sooner = (r.d0 && r.d1) ? monthsBetween(r.d1, r.d0) : 0;
    rc.push(sooner > 0 ? `Paying <b>$50 more</b> toward ${esc(nx.name)} pays it off about <b>${plural(sooner,'month')} sooner</b>${r.saved > 1 ? ` and saves about ${money(r.saved)} in interest` : ''}.` : `Paying <b>$50 more</b> toward ${esc(nx.name)} speeds up its payoff. Try it in What if.`); }
  if (open.length) { const w = simulate(S.accounts, { extra:100 }); const sooner = (sim.freeDate && w.freeDate) ? monthsBetween(w.freeDate, sim.freeDate) : 0; const saved = sim.totalInterest - w.totalInterest;
    if (sooner > 0) rc.push(`An extra <b>$100 a month</b> across your plan makes you debt-free about <b>${plural(sooner,'month')} sooner</b>${saved > 1 ? `, saving about ${money(saved)} in interest` : ''}.`); }
  const soon = rem.find(x => x.d.days <= 7);
  if (soon) rc.push(`Pay <b>${esc(soon.a.name)}</b> before ${soon.d.date.toLocaleDateString('en-US',{ month:'short', day:'numeric' })} to stay on time.`);
  else if (open.length && !open.some(a => a.apr > 0)) rc.push('Add interest rates to your accounts for sharper payoff estimates.');
  else rc.push('Stay consistent. Every payment gets you closer to debt-free.');
  const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>';
  return `<div class="summary">
  <header class="sum-head"><img src="logos/app/logo-96.png" srcset="logos/app/logo-96.png 1x, logos/app/logo-192.png 2x" width="56" height="56" alt=""><div><h1 class="sum-title">Monthly Summary</h1><p class="sl-tag">${line}</p></div></header>
  <section class="gcard" aria-labelledby="msT">
    <div class="sum-bar"><h2 id="msT" class="g-h" style="margin:0">${IC.cal}${mName}</h2>
      <div class="sum-pick"><button type="button" class="icon-btn sm" data-act="sumPrev" aria-label="Previous month" ${M.canPrev ? '' : 'disabled'}>‹</button><span class="sum-rng">${rng}</span><button type="button" class="icon-btn sm" data-act="sumNext" aria-label="Next month" ${M.canNext ? '' : 'disabled'}>›</button></div></div>
    <div class="sum-stats">
      <div><p class="micro">Payments logged</p><p class="sum-big pos">${money2(M.reduced)}</p><p class="g-sub">${reducedNote}</p></div>
      <div><p class="micro">Payments made</p><p class="sum-big">${n}</p><p class="g-sub">${onNote}</p></div>
    </div>
    <div class="g-row" style="margin:18px 0 8px"><span class="micro">Progress toward debt-free</span><b class="acc-txt">${Math.round(M.pct*100)}%</b></div>
    <div class="bar sum-prog" role="progressbar" aria-label="Progress toward debt-free" aria-valuenow="${Math.round(M.pct*100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${(M.pct*100).toFixed(1)}%"></i></div>
  </section>
  <section class="gcard" aria-labelledby="rmT"><h2 id="rmT" class="g-h"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/></svg>Reminders</h2>${remHTML}</section>
  <section class="gcard" aria-labelledby="ktT"><h2 id="ktT" class="g-h"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 17l6-6 4 4 7-7.5M15 7.5h5.5V13"/></svg>Key takeaways</h2><ul class="sum-bul">${tk.slice(0,3).map(x => `<li>${x}</li>`).join('')}</ul></section>
  <section class="gcard" aria-labelledby="rcT"><h2 id="rcT" class="g-h"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>Recommendations</h2>
    <ul class="sum-rec">${rc.slice(0,3).map(x => `<li>${check}<span>${x}</span></li>`).join('')}</ul>
    <button type="button" class="link-btn sum-dash" data-act="toHome">View full dashboard →</button></section>
</div>`;
}
function extraResult(acc, amt){
  const base = simulate(S.accounts), w = simulate(S.accounts, { extraFor:{ id:acc.id, amount:amt } });
  const months = r => { const d = r.payoff[acc.id]; return d ? monthsBetween(new Date(new Date().getFullYear(), new Date().getMonth(), 1), d) + 1 : null; };
  return { base, w, d0: base.payoff[acc.id], d1: w.payoff[acc.id], n0: months(base), n1: months(w), pay: w.firstPay[acc.id] || 0, saved: (base.interest[acc.id]||0) - (w.interest[acc.id]||0) };
}
function openExtraFor(acc, trigger){
  if (!acc) return; let amt = 0;
  const body = `<p class="muted" style="margin-top:0">${esc(acc.name)} · ${money2(acc.balance)} left · plan ${money2(simulate(S.accounts).firstPay[acc.id]||acc.min)}/mo. This is a preview; your plan doesn’t change.</p>
    <div class="sim-input"><span class="mid">$</span><label class="sr-only" for="xIn">Extra per month for ${esc(acc.name)}</label><input id="xIn" inputmode="decimal" placeholder="0"><span class="muted">extra a month</span></div>
    <div class="chips" role="group" aria-label="Quick amounts">${[25,50,100,200].map(v=>`<button type="button" class="chip" data-x="${v}" aria-pressed="false">$${v}</button>`).join('')}<button type="button" class="chip" data-x="0">Clear</button></div>
    <div id="xOut" class="x-out" aria-live="polite"></div>
    <div class="form-actions"><button class="btn" data-close>Close</button></div>`;
  openDialog({ title:'What if I pay extra?', body, trigger, onMount: sh => {
    const out = sh.querySelector('#xOut'), inp = sh.querySelector('#xIn');
    const draw = () => { const r = extraResult(acc, amt); const sooner = (r.d0 && r.d1) ? monthsBetween(r.d1, r.d0) : 0;
      sh.querySelectorAll('[data-x]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.x === amt && amt > 0)));
      out.innerHTML = `<div class="x-head"><b>${r.d1 ? 'Paid off by ' + fmtMonth(r.d1) : 'No payoff date yet'}</b>${amt>0 && r.d1 ? ` — ${sooner>0 ? plural(sooner,'month')+' sooner' : 'same month'}` : ''}</div>
        <div class="stats" style="margin-top:12px"><div class="stat"><b>${money2(r.pay)}</b><span>Monthly payment${amt>0?' (plan + extra)':''}</span></div><div class="stat"><b>${r.n1 ? plural(r.n1,'payment') : '—'}</b><span>Payments left</span></div>
        ${acc.apr ? `<div class="stat"><b>${money2(Math.max(0,r.saved))}</b><span>Interest saved</span></div>` : `<div class="stat"><b>—</b><span>No interest rate entered</span></div>`}
        <div class="stat"><b>${r.w.freeDate ? fmtMonth(r.w.freeDate) : '—'}</b><span>Debt free overall</span></div></div>`; };
    inp.addEventListener('input', () => { amt = Math.max(0, parseFloat(inp.value.replace(/[^0-9.]/g,''))||0); draw(); });
    sh.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => { amt = +b.dataset.x; inp.value = amt || ''; draw(); }));
    sh.querySelector('.form-actions [data-close]').addEventListener('click', closeTop);
    draw();
  }});
}

// ---------- Anubis strike: quick GIF-style clip on a logged payment (non-blocking) ----------
function haptic(pattern){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try { if (navigator.vibrate) { navigator.vibrate(pattern); return; } } catch {}
  // iOS 18+ Safari: toggling a native <input type=checkbox switch> via its label gives a light system haptic; no-op elsewhere
  try { const l = document.createElement('label'), i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch',''); l.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;left:-9px';
    l.setAttribute('aria-hidden','true'); l.appendChild(i); document.body.appendChild(l); l.click(); setTimeout(() => { l.click(); }, 120); setTimeout(() => l.remove(), 400); } catch {}
}
function anubisStrike(amount, payoff){
  if (S.settings.strike === false) return 0;
  document.querySelector('.strike')?.remove();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div'); el.className = 'strike glass' + (reduced ? ' still' : ''); el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
  el.innerHTML = `<div class="strike-stage" aria-hidden="true"><img src="logos/anubis/anubis-800.webp" alt="">
    <svg class="strike-fx" viewBox="0 0 200 140"><g class="s-card"><g class="s-l"><rect x="58" y="70" width="44" height="40" rx="6"/><rect x="62" y="80" width="30" height="6" rx="2" class="s-strip"/></g><g class="s-r"><rect x="98" y="70" width="44" height="40" rx="6"/><rect x="102" y="96" width="24" height="5" rx="2" class="s-strip"/></g></g>
    <path class="s-slash" d="M30 128 L172 34"/>${[0,1,2,3,4,5].map(i=>`<circle class="s-spark" cx="100" cy="88" r="2.2" style="--sx:${[-40,30,-22,44,-8,16][i]}px;--sy:${[-30,-36,22,10,-44,30][i]}px"/>`).join('')}</svg></div>
    <div class="strike-txt"><b>${money2(amount)}</b> struck down</div>`;
  document.body.appendChild(el);
  const extra = payoff ? 1500 : 0;
  if (payoff) { el.classList.add('payoff'); haptic([40,60,40,60,120]); }
  setTimeout(() => el.classList.add('out'), (reduced ? 1400 : 1150) + extra);
  setTimeout(() => el.remove(), (reduced ? 1700 : 1450) + extra);
  return (reduced ? 1700 : 1450) + extra;
}

// ---------- Payoff celebration ----------
function celebrate(acc, prevPlan){
  if (acc.celebrated) return; acc.celebrated = true; save();
  const next = openAccounts()[0];
  const roll = prevPlan || acc.min;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  const colors = ['var(--conf-1)','var(--amber)','var(--conf-3)','var(--blue)', CAT[acc.type].strong, 'var(--green-bar)','var(--conf-7)'];
  const confetti = reduced ? '' : Array.from({length:26},(_,i)=>{ const c = colors[i%colors.length]; const x = 40 + (i*37)%240, dx = ((i*53)%120)-60, r = (i*47)%360, sh = i%3;
    const shape = sh===0 ? `<rect width="9" height="9" rx="2" style="fill:${c}"/>` : sh===1 ? `<circle r="5" cx="4" cy="4" style="fill:${c}"/>` : `<path d="M0 8 L5 0 L10 8z" style="fill:${c}"/>`;
    return `<g class="conf" style="--x:${x}px;--dx:${dx}px;--r:${r}deg;--d:${(i%7)*0.08}s">${shape}</g>`; }).join('');
  const art = `<svg class="cel-art ${reduced?'still':''}" viewBox="0 0 320 220" role="img" aria-label="Illustration: a sun rising behind a cracked card that bursts into confetti">
    <defs><radialGradient id="sunG" cx="50%" cy="100%" r="70%"><stop offset="0" stop-color="#f6c58f"/><stop offset="1" stop-color="#f6c58f" stop-opacity="0"/></radialGradient></defs>
    <rect x="0" y="0" width="320" height="220" rx="24" fill="#f7efe4"/>
    <circle class="glow" cx="160" cy="190" r="150" fill="url(#sunG)"/>
    <g class="rays" stroke="#FF7A45" stroke-width="3" stroke-linecap="round" fill="none" style="filter:drop-shadow(0 0 4px rgba(255,122,69,.55))">
      ${Array.from({length:9},(_,i)=>{ const ang = Math.PI*(0.1+0.8*i/8); const x1=160-Math.cos(ang)*78, y1=172-Math.sin(ang)*78, x2=160-Math.cos(ang)*104, y2=172-Math.sin(ang)*104; return `<path class="draw" style="--d:${0.3+i*0.05}s" d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`; }).join('')}</g>
    <path class="sun" d="M92 172 a68 68 0 0 1 136 0z" fill="#FFA35C" stroke="#E2622F" style="filter:drop-shadow(0 0 10px rgba(255,159,10,.55))" stroke-width="3" stroke-linejoin="round"/>
    <path class="draw" style="--d:.1s" d="M24 174 C 80 168, 120 178, 160 172 S 260 168, 296 175" fill="none" stroke="#7a4a32" stroke-width="3" stroke-linecap="round"/>
    <g class="card-l"><path d="M112 96 h44 l-8 22 l10 16 l-8 22 h-38 a10 10 0 0 1 -10 -10 v-40 a10 10 0 0 1 10 -10z" fill="#fffaf3" stroke="#7a4a32" stroke-width="3" stroke-linejoin="round"/><rect x="112" y="110" width="30" height="8" rx="3" fill="#e8c39e"/></g>
    <g class="card-r"><path d="M156 96 h52 a10 10 0 0 1 10 10 v40 a10 10 0 0 1 -10 10 h-58 l8 -22 l-10 -16z" fill="#fffaf3" stroke="#7a4a32" stroke-width="3" stroke-linejoin="round"/><rect x="176" y="136" width="30" height="7" rx="3" fill="#e8c39e"/></g>
    <path class="check draw" style="--d:1.1s" d="M136 128 l16 16 l34 -36" fill="none" style="stroke:var(--green-bar)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(0,40)">${confetti}</g>
  </svg>`;
  const nextLine = next ? `Its ${money2(roll)} payment now rolls into ${esc(next.name)}.` : 'That was the last one. You’re debt free!';
  openDialog({ title: next ? 'Knocked out!' : 'Debt free!', trigger: document.activeElement, body:`<div class="cel ${next?'':'cel-free'}">${next?'':'<img class="cel-anubis" src="logos/anubis/anubis-800.webp" alt="" aria-hidden="true">'}${art}
    <h3 class="cel-title">${esc(acc.name)} is paid off!</h3>
    <p class="cel-sub">That’s ${money2(acc.start)} gone. ${nextLine}</p>
    <div class="form-actions"><button class="btn" id="celShare">Share</button><button class="btn primary" data-close>Keep going</button></div></div>`,
    onMount: sh => { sh.classList.add('cel-sheet');
      sh.querySelector('.form-actions [data-close]').addEventListener('click', closeTop);
      sh.querySelector('#celShare').addEventListener('click', async () => { const txt = `I just paid off ${acc.name} — ${money2(acc.start)} gone! #DebtKiller`;
        try { if (navigator.share) await navigator.share({ text: txt }); else { await navigator.clipboard.writeText(txt); toast('Copied to share'); } } catch {} });
      setTimeout(() => sh.querySelector('.form-actions .primary').focus(), 60); } });
}

// ---------- charts (self-written SVG, Monarch-style) ----------
function monotonePath(pts){
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  const n = pts.length, dx=[], dy=[], m=[], t=[];
  for (let i=0;i<n-1;i++){ dx[i]=pts[i+1][0]-pts[i][0]; dy[i]=pts[i+1][1]-pts[i][1]; m[i]=dy[i]/(dx[i]||1); }
  t[0]=m[0]; t[n-1]=m[n-2];
  for (let i=1;i<n-1;i++){ t[i] = m[i-1]*m[i] <= 0 ? 0 : 3*(dx[i-1]+dx[i]) / ((2*dx[i]+dx[i-1])/m[i-1] + (dx[i]+2*dx[i-1])/m[i]); }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i=0;i<n-1;i++){ const h=dx[i]/3; d += ` C${pts[i][0]+h},${pts[i][1]+h*t[i]} ${pts[i+1][0]-h},${pts[i+1][1]-h*t[i+1]} ${pts[i+1][0]},${pts[i+1][1]}`; }
  return d;
}
function niceMax(v){ if (v<=0) return 100; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v/p; return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:f<=8?8:10)*p; }
const tick$ = v => v>=1000 ? '$'+(v/1000).toFixed(v%1000?1:0)+'k' : '$'+Math.round(v);

function actualSeries(accts){
  const series = ledgerSeries(accts);
  const dates = [...new Set(series.flatMap(s => s.points.map(p => p.date)))].sort();
  if (!dates.length) return [];
  return dates.map(date => ({ date: new Date(date+'T12:00'), total: DebtEngine.balanceAsOf(series, date) }));
}

function lineChart(accts, id){
  const sim = simulate(accts);
  const act = actualSeries(accts);
  const proj = sim.totals.map((p,i) => ({ date: i===0 ? new Date() : p.date, total:p.total }));
  const all = [...act, ...proj];
  if (!all.length) return '';
  const W=Math.round(Math.max(330, Math.min(900, (document.getElementById('main').clientWidth||700)-90))),H=W<500?240:280,L=52,R=16,T=16,B=34;
  const t0 = Math.min(...all.map(p=>+p.date)), t1 = Math.max(...all.map(p=>+p.date), t0+864e5*30);
  const ymax = niceMax(Math.max(...all.map(p=>p.total)));
  const x = d => L + (d - t0)/(t1 - t0)*(W-L-R), y = v => T + (1 - v/ymax)*(H-T-B);
  const lead = ymax/Math.pow(10,Math.floor(Math.log10(ymax))); const nst = (lead===2||lead===8)?4:5; const grid = Array.from({length:nst+1},(_,i)=>i/nst).map(f=>`<line x1="${L}" x2="${W-R}" y1="${y(ymax*f)}" y2="${y(ymax*f)}" stroke="var(--hair)"/><text x="${L-8}" y="${y(ymax*f)+4}" text-anchor="end">${tick$(ymax*f)}</text>`).join('');
  const span = monthsBetween(new Date(t0), new Date(t1)) || 1; const step = Math.max(1, Math.ceil(span/6));
  let xt=''; for (let i=0;i<=span;i+=step){ const d = addMonths(new Date(t0), i); if (+d < t0) continue; xt += `<text x="${x(+d)}" y="${H-10}" text-anchor="middle">${MON[d.getMonth()]}${d.getMonth()===0||i===0?" '"+String(d.getFullYear()).slice(2):''}</text>`; }
  const aP = act.map(p=>[x(+p.date),y(p.total)]), pP = proj.map(p=>[x(+p.date),y(p.total)]);
  const area = pts => pts.length>1 ? `${monotonePath(pts)} L${pts[pts.length-1][0]},${y(0)} L${pts[0][0]},${y(0)} Z` : '';
  const dots = [...act.map(p=>({...p,k:'Actual'})), ...proj.map(p=>({...p,k:'Projected'}))];
  const desc = `Balance over time. ${act.length?`Actual: from ${money(act[0].total)} down to ${money(act[act.length-1].total)} today.`:'No payments logged yet.'} Projected plan reaches $0 ${sim.freeDate?'in '+fmtMonth(sim.freeDate):'—'}.`;
  return `<div class="chart" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}">
    <defs><linearGradient id="ga${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--green-bar);stop-opacity:.32"/><stop offset="1" style="stop-color:var(--green-bar);stop-opacity:0"/></linearGradient>
    <linearGradient id="gp${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--blue);stop-opacity:.24"/><stop offset="1" style="stop-color:var(--blue);stop-opacity:0"/></linearGradient></defs>
    ${grid}${xt}
    <path d="${area(pP)}" fill="url(#gp${id})"/><path d="${monotonePath(pP)}" fill="none" class="line-glow" style="stroke:var(--blue);--glow:var(--blue-glow)" stroke-width="2.5" stroke-dasharray="6 6" stroke-linecap="round"/>
    ${aP.length>1?`<path d="${area(aP)}" fill="url(#ga${id})"/><path d="${monotonePath(aP)}" fill="none" class="line-glow" style="stroke:var(--green-bar);--glow:var(--green-glow)" stroke-width="3" stroke-linecap="round"/>`:''}
    ${dots.map(p=>`<circle cx="${x(+p.date)}" cy="${y(p.total)}" r="9" fill="transparent" data-tip="${p.k} · ${fmtMonShort(p.date)} · ${money(p.total)}"/>`).join('')}
  </svg><div class="tip-box"></div>
  <div class="legend"><span><i style="background:var(--green-bar)"></i>Balance from logged payments</span><span><i style="background:var(--blue)"></i>Projected plan (dashed)</span></div>
  <p class="sr-only">${esc(desc)}</p></div>`;
}
function barChart(accts){
  const data = accts.map(a=>({ name:a.name, paid:Math.max(0,a.start-a.balance), start:a.start, c:CAT[a.type].strong }));
  const W=420,rowH=44,L=0,H=data.length*rowH+10; const max = Math.max(...data.map(d=>d.start),1);
  const desc = 'Paid off by account. ' + data.map(d=>`${d.name}: ${money(d.paid)} of ${money(d.start)}`).join('; ') + '.';
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}">
  ${data.map((d,i)=>{ const yy=i*rowH; const w=(W-200)*d.start/max, wp=(W-200)*d.paid/max; return `<text x="0" y="${yy+22}" font-weight="600" style="fill:var(--text)">${esc(d.name.slice(0,16))}</text>
   <rect x="120" y="${yy+8}" width="${w}" height="20" rx="10" fill="var(--fill2)"/><rect x="120" y="${yy+8}" width="${Math.max(wp,wp?20:0)}" height="20" rx="10" class="bar-glow" style="fill:${d.c};--glow:${d.c}" data-tip="${esc(d.name)} · ${money(d.paid)} paid of ${money(d.start)}"/>
   <text x="${126+w}" y="${yy+23}">${money(d.paid)}</text>`;}).join('')}
  </svg><div class="tip-box"></div><p class="sr-only">${esc(desc)}</p></div>`;
}
function donut(accts){
  const by = {}; accts.forEach(a=>{ if (a.balance>0) by[a.type]=(by[a.type]||0)+a.balance; });
  const ents = Object.entries(by).sort((a,b)=>b[1]-a[1]); const tot = ents.reduce((s,e)=>s+e[1],0);
  if (!tot) return '<p class="muted">Nothing left owed.</p>';
  const R=80, C=2*Math.PI*R, gap = ents.length>1?4:0; let off=0;
  const desc = 'Where the debt sits by type. ' + ents.map(([k,v])=>`${k}: ${money(v)} (${Math.round(v/tot*100)}%)`).join('; ') + '.';
  const segs = ents.map(([k,v])=>{ const len = v/tot*C; const s = `<circle r="${R}" cx="110" cy="110" fill="none" class="ring-glow" style="stroke:${CAT[k].strong};color:${CAT[k].strong}" stroke-width="26" stroke-linecap="${ents.length>1?'round':'butt'}" stroke-dasharray="${Math.max(0.1,len-gap-(ents.length>1?20:0))} ${C}" stroke-dashoffset="${-off - (ents.length>1?10:0)}" transform="rotate(-90 110 110)" data-tip="${k} · ${money(v)}"/>`; off += len; return s; }).join('');
  return `<div class="chart row" style="flex-wrap:wrap;gap:20px;justify-content:center"><svg viewBox="0 0 220 220" width="220" height="220" role="img" aria-label="${esc(desc)}">${segs}
   <text x="110" y="104" text-anchor="middle" style="font-size:13px">Still owed</text><text x="110" y="128" text-anchor="middle" style="font-size:22px;font-weight:700;fill:var(--text)">${money(tot)}</text></svg>
   <div class="tip-box"></div>
   <ul class="list" style="min-width:200px">${ents.map(([k,v])=>`<li><i style="width:12px;height:12px;border-radius:4px;background:${CAT[k].strong}"></i><span style="flex:1">${k}</span><b>${money(v)}</b><span class="small">${Math.round(v/tot*100)}%</span></li>`).join('')}</ul>
   <p class="sr-only">${esc(desc)}</p></div>`;
}
function ring(pct, size=180){
  const R=size/2-16, C=2*Math.PI*R, p=Math.max(0,Math.min(1,pct));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${Math.round(p*100)} percent paid off">
   <defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" style="stop-color:var(--green-soft-stop)"/><stop offset="1" style="stop-color:var(--green-bar)"/></linearGradient></defs>
   <circle r="${R}" cx="${size/2}" cy="${size/2}" fill="none" stroke="var(--fill2)" stroke-width="18"/>
   <circle r="${R}" cx="${size/2}" cy="${size/2}" fill="none" stroke="url(#rg)" class="ring-glow" style="color:var(--green-bar)" stroke-width="18" stroke-linecap="round" stroke-dasharray="${C*p} ${C}" transform="rotate(-90 ${size/2} ${size/2})"/>
   <text x="50%" y="48%" text-anchor="middle" style="font-size:30px;font-weight:700;fill:var(--text)">${Math.round(p*100)}%</text>
   <text x="50%" y="62%" text-anchor="middle" style="font-size:12px;letter-spacing:1.4px;font-weight:700">PAID OFF</text></svg>`;
}

// ---------- Progress insights (computed only from this device's data) ----------
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function streaks(payments, now = new Date()){
  const days = [...new Set(payments.map(p => p.date))].sort(); if (!days.length) return { current:0, best:0 };
  const dn = iso => Math.round(new Date(iso+'T12:00') / 864e5);
  let best = 1, run = 1; for (let i=1;i<days.length;i++){ run = dn(days[i]) - dn(days[i-1]) === 1 ? run+1 : 1; best = Math.max(best, run); }
  const set = new Set(days.map(dn)); let d = dn(isoOf(now)); if (!set.has(d)) d -= 1; let cur = 0; while (set.has(d)) { cur++; d--; }
  return { current:cur, best };
}
function monthlyTotals(payments, n = 6, now = new Date()){
  const out = []; for (let i=n-1;i>=0;i--){ const d = new Date(now.getFullYear(), now.getMonth()-i, 1); const k = monthKey(d);
    out.push({ d, total: payments.filter(p => monthKey(new Date(p.date+'T12:00')) === k).reduce((s,p)=>s+p.amount,0) }); }
  return out;
}
function shrinkRanking(accounts){
  return accounts.filter(a => a.start > 0).map(a => ({ a, pct: Math.max(0, (a.start - Math.max(0,a.balance)) / a.start), amt: Math.max(0, a.start - Math.max(0,a.balance)) })).sort((x,y) => y.pct - x.pct || y.amt - x.amt);
}
function minOnlyInterest(accounts){
  const r = DebtEngine.minimumsOnly(engineDebts(accounts));
  return { total: r.totalInterest, never: r.never };
}
function insightsHTML(sim){
  const st = streaks(S.payments), mt = monthlyTotals(S.payments, 6), outlook = currentOutlook(), free = paceCopy(outlook, sim), rank = shrinkRanking(S.accounts).slice(0,5);
  const t = totals(), pct = t.total ? t.paid / t.total : 0, hasApr = S.accounts.some(a => a.apr > 0 && a.balance > 0.004);
  const mo = minOnlyInterest(S.accounts), saved = Math.max(0, mo.total - (sim.totalInterest||0));
  const cur = mt[mt.length-1].total, prev = mt[mt.length-2].total, delta = cur - prev;
  const mx = Math.max(1, ...mt.map(x=>x.total)), W = 280, H = 64;
  const pts = mt.map((x,i) => [ 8 + i*(W-16)/(mt.length-1), H - 8 - (x.total/mx)*(H-20) ]);
  const spark = `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly payments, last 6 months: ${mt.map(x=>`${MONTHS[x.d.getMonth()].slice(0,3)} ${money(x.total)}`).join(', ')}">
    <path d="M${pts.map(p=>p.map(v=>v.toFixed(1)).join(' ')).join(' L')}" fill="none" style="stroke:var(--accent-btn);filter:drop-shadow(0 0 5px var(--accent-glow))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" style="fill:var(--accent-btn)"/>`).join('')}</svg>
    <div class="spark-x">${mt.map(x=>`<span>${MONTHS[x.d.getMonth()].slice(0,3)}</span>`).join('')}</div>`;
  return `<div class="grid two insights">
    <section class="card glass ins" aria-label="Payment streak"><h2 class="micro">Streak</h2>
      ${S.payments.length ? `<div class="mid">${plural(st.current,'day')}</div><p class="muted" style="margin:4px 0 0">in a row with a logged payment · best ${plural(st.best,'day')}</p>` : `<p class="muted" style="margin:6px 0 0">Log a payment to start a streak.</p>`}</section>
    <section class="card glass ins" aria-label="Projected payoff at your pace"><h2 class="micro">At your current pace</h2>
      <div class="mid">${esc(free.title)}</div><p class="muted" style="margin:4px 0 0">${esc(free.note)}</p></section>
    <section class="card glass ins span-all" aria-label="Milestones"><h2 class="micro">Milestones to debt free</h2>
      <div class="ms" role="progressbar" aria-label="Percent to debt free" aria-valuenow="${Math.round(pct*100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${(pct*100).toFixed(1)}%"></i>
        ${[25,50,75,100].map(m=>`<span class="ms-mk ${pct*100>=m?'hit':''}" style="left:${m}%"><b>${m}%</b></span>`).join('')}</div>
      <p class="muted" style="margin:30px 0 0">${Math.round(pct*100)}% of the way. ${pct>=1?'You made it.':`Next milestone: ${[25,50,75,100].find(m=>m>pct*100)}%.`}</p></section>
    <section class="card glass ins" aria-label="Fastest shrinking debts"><h2 class="micro">Fastest shrinking</h2>
      ${rank.some(r=>r.amt>0) ? `<ul class="shrink">${rank.map(r=>`<li><span class="sh-n">${esc(r.a.name)}</span><span class="sh-v">${Math.round(r.pct*100)}% · ${money(r.amt)}</span><span class="sh-bar"><i style="width:${(r.pct*100).toFixed(1)}%;background:${CAT[r.a.type].strong}"></i></span></li>`).join('')}</ul>` : `<p class="muted" style="margin:6px 0 0">Once balances start dropping, your fastest-shrinking debts show up here.</p>`}</section>
    <section class="card glass ins" aria-label="Interest saved"><h2 class="micro">Interest saved vs. minimums only</h2>
      ${hasApr ? `<div class="mid">${money(saved)}</div><p class="muted" style="margin:4px 0 0">Your plan: about ${money(sim.totalInterest||0)} in interest. Minimums only: about ${money(mo.total)}${mo.never?` (and ${plural(mo.never,'account')} would never clear)`:''}.</p>` : `<p class="muted" style="margin:6px 0 0">Add interest rates to your accounts to see savings.</p>`}</section>
    <section class="card glass ins" aria-label="Monthly payment history"><h2 class="micro">Monthly payments</h2>
      ${S.payments.length ? spark : `<p class="muted" style="margin:6px 0 0">Your monthly history will draw here after your first payment.</p>`}</section>
    <section class="card glass ins" aria-label="This month versus last month"><h2 class="micro">This month vs. last month</h2>
      <div class="mm"><div><span class="muted">This month</span><b>${money(cur)}</b></div><div><span class="muted">Last month</span><b>${money(prev)}</b></div></div>
      <p class="delta ${delta>=0?'up':'down'}">${delta===0 ? 'Same as last month' : `${delta>0?'▲':'▼'} ${money(Math.abs(delta))} ${delta>0?'more':'less'} than last month`}</p></section>
  </div>`;
}
function viewProgress(){
  return progressInner().replace('<div class="grid three">', `<button type="button" class="gcard sum-entry" data-act="toSummary" style="margin:0 0 16px"><span class="ai ai-gold">${IC.cal}</span><span class="at"><b>Monthly summary</b><span>See this month’s recap, reminders and tips</span></span><span class="sum-go" aria-hidden="true">›</span></button><div class="grid three">`);
}
function progressInner(){
  const t = totals(); const sim = simulate(S.accounts); const knocked = S.accounts.filter(a=>a.balance<=0.004).length;
  const single = S.accounts.length === 1;
  const noPay = !S.payments.length;
  const head = `<h1 class="large-title">Progress</h1><p class="subtitle" style="font-size:17px;font-weight:600;color:var(--text)">${sim.freeDate?debtFree(sim.freeDate):openAccounts().length?'Add payments to see a debt-free date':'You are debt free!'}</p>
  <div class="grid three">
    <div class="card glass"><div class="micro">Paid off</div><div class="mid">${money(t.paid)}</div></div>
    <div class="card glass"><div class="micro">Still owed</div><div class="mid">${money(t.left)}</div></div>
    <div class="card glass"><div class="micro">Activity</div><div class="mid" style="font-size:18px">${plural(S.payments.length,'payment')} · ${knocked} knocked out</div></div>
  </div>
  <div class="toolbar" style="margin-top:14px"><button class="btn sm" data-act="summary">Share monthly summary</button><button class="btn sm" data-act="toPlan">Payoff plan</button></div>
  ${insightsHTML(sim)}`;
  const lineCard = `<section class="card glass span-all"><h2 class="micro">Total balance over time</h2>${lineChart(S.accounts,'all')}${noPay?'<p class="muted" style="margin:6px 0 0">No payments yet — this is your plan. Log a payment and your real progress will appear in green.</p>':''}</section>`;
  if (single){
    const a = S.accounts[0]; const pct = a.start?1-a.balance/a.start:0;
    const months = sim.months.slice(0,24);
    return head + `<div class="grid two" style="margin-top:14px">
      <section class="card glass" style="text-align:center"><h2 class="micro" style="text-align:left">${esc(a.name)}</h2>${ring(pct)}
        <div class="stats" style="margin-top:10px;text-align:left"><div class="stat"><b>${money2(a.balance)}</b><span>Remaining</span></div><div class="stat"><b>${money2(Math.max(0,a.start-a.balance))}</b><span>Paid</span></div>
        <div class="stat"><b>${sim.payoff[a.id]?fmtMonth(sim.payoff[a.id]):'—'}</b><span>Projected payoff</span></div><div class="stat"><b>${money2(sim.firstPay[a.id]||0)}</b><span>Monthly payment</span></div></div>
        ${a.apr?`<p class="small">About ${money(sim.interest[a.id])} projected interest at ${a.apr}% APR</p>`:'<p class="small">No interest rate entered</p>'}</section>
      <section class="card glass"><h2 class="micro">Payment timeline</h2><ol class="timeline" style="margin-top:12px">
        ${months.map((m,i)=>{ const row = (m.rows||[]).find(r => r.id===a.id); const bal = row ? row.balance : (sim.totals[i+1]?.total ?? 0); const end = row ? row.balance<=0.005 : i===sim.months.length-1; return `<li class="${end?'end':''}"><b>${fmtMonth(m.date)}</b> · pay ${money2(row?row.payment:(m.pays[a.id]||0))}${row?` · ${money2(row.interest)} interest · ${money2(row.principal)} principal`:''}<br><span class="small">${end?'Paid off':money2(bal)+' left after'}</span></li>`; }).join('')}
        ${sim.months.length>24?`<li><span class="small">…${plural(sim.months.length-24,'more month')}</span></li>`:''}</ol></section>
      ${lineCard}
      <p class="muted span-all" style="margin:4px">Comparisons by account and type appear once you add more accounts.</p></div>`;
  }
  return head + `<div class="grid two" style="margin-top:14px">${lineCard}
    <section class="card glass"><h2 class="micro">Payoff order</h2><ol class="list" style="margin-top:8px">${orderAll().map((a,i)=>`<li><span class="avatar" style="width:34px;height:34px;font-size:13px;background:${TYPE_HEX[a.type]}">${i+1}</span><span style="flex:1"><b>${esc(a.name)}</b><br><span class="small">${a.balance<=0.004?'Knocked out':'Done '+(sim.payoff[a.id]?fmtMonth(sim.payoff[a.id]):'—')}${a.apr&&sim.interest[a.id]>0.5?` · ${money(sim.interest[a.id])} interest`:''}</span></span><b>${money(a.balance)}</b></li>`).join('')}</ol></section>
    <section class="card glass"><h2 class="micro">Paid off by account</h2><div style="margin-top:12px">${barChart(orderAll())}</div></section>
    <section class="card glass span-all"><h2 class="micro">Where the debt sits</h2><div style="margin-top:12px">${donut(S.accounts)}</div></section></div>`;
}

function savedText(entry, minimums){
  if (minimums.never) return `Minimums alone never clear ${plural(minimums.never, 'account')}.`;
  if (entry.result.stuck) return 'This strategy does not pay everything off.';
  if (entry.interestSaved > 0.5) return `${money(entry.interestSaved)} less interest than paying each minimum with no rollover.`;
  if (entry.interestSaved < -0.5) return `${money(-entry.interestSaved)} more interest than paying each minimum with no rollover.`;
  return 'About the same interest as paying each minimum with no rollover.';
}
function planCompare(){
  const debts = engineDebts(S.accounts);
  const opts = {
    customOrder: normalizedCustomOrder(),
    extraMonthly: Math.max(0, Number(S.settings.extraMonthly) || 0),
    windfall: Math.max(0, Number(S.settings.windfall) || 0),
    budget: effectiveBudget(S.settings),
    accelerateFocus: !!S.settings.accelerateFocus,
    focusMonths: S.settings.defaultMonths || 6,
    startDate: new Date(),
  };
  return { debts, opts, cmp: DebtEngine.compare(debts, opts) };
}
function planResultsHTML(){
  const open = S.accounts.filter(a => a.balance > 0.004);
  if (!open.length) return '<section class="gcard"><p class="lin-empty">Every account is paid off.</p></section>';
  const { cmp } = planCompare();
  const activeKey = S.settings.strategy || 'snowball';
  const active = cmp.strategies.find(s => s.strategy === activeKey) || cmp.strategies[0];
  const maxInt = Math.max(1, ...cmp.strategies.map(s => s.result.totalInterest || 0));
  const cf = cashFlow(S.settings);
  const warns = warningLines(active.result);
  const chartDesc = cmp.strategies.map(s => `${STRAT[s.strategy].label}: ${planHeadline(s.result)}, ${money(s.result.totalInterest)} interest`).join('. ');
  const schedSource = active.result.schedule || [];
  const filtered = planFilter ? schedSource.map(m => ({ ...m, rows: m.rows.filter(r => r.id === planFilter) })).filter(m => m.rows.length && (m.rows[0].payment > 0.004 || m.rows[0].interest > 0.004 || m.rows[0].balance > 0.004)) : schedSource;
  const cap = planShowAll ? Math.min(filtered.length, 240) : Math.min(18, filtered.length);
  const shown = filtered.slice(0, cap);
  const first = schedSource[0];
  return `${warns.map(t => `<div class="banner" role="status">${icon.info}<span>${esc(t)}</span></div>`).join('')}
  <p class="cf-line">${S.settings.income == null ? 'Add income and expenses to see free cash flow.' : `Free cash flow <b>${money2(cf || 0)}</b> a month${S.settings.useCashFlow ? ', and that is the debt budget.' : '.'}`} ${S.settings.accelerateFocus ? `The current target is still set to finish in about ${S.settings.defaultMonths} payments, which is more than a classic minimum-only plan.` : ''}</p>
  <div class="cmp-grid" role="group" aria-label="Strategy comparison">${cmp.strategies.map(s => `<button type="button" class="cmp-card ${s.strategy===activeKey?'on':''}" data-pick-strategy="${s.strategy}" aria-pressed="${s.strategy===activeKey}">
    <span class="micro">${STRAT[s.strategy].label}</span>
    <b>${esc(planHeadline(s.result))}</b>
    <span>${s.result.stuck ? 'Interest keeps growing' : `${plural(s.result.months, 'month')} · ${money(s.result.totalInterest)} interest`}</span>
    <span class="cmp-save">${esc(savedText(s, cmp.minimumsOnly))}</span>
  </button>`).join('')}</div>
  <div class="cmp-chart" role="img" aria-label="${esc(chartDesc)}">${cmp.strategies.map(s => `<div class="cmp-row"><span>${STRAT[s.strategy].label}</span><span class="cmp-track"><i style="width:${Math.max(4, (s.result.totalInterest||0)/maxInt*100).toFixed(1)}%"></i></span><span>${s.result.totalInterest > 0.5 ? money(s.result.totalInterest) : '$0'}</span></div>`).join('')}</div>
  <p class="small">Interest saved is versus paying each minimum on its own, with no rollover. ${cmp.minimumsOnly.never ? '' : `Minimums alone would cost about ${money(cmp.minimumsOnly.totalInterest)} in interest.`}</p>
  <section class="gcard" aria-labelledby="moT"><h2 id="moT" class="g-h">This month</h2>
    ${first ? `<p class="g-sub" style="margin-bottom:8px">Planned out the door: <b>${money2(first.payment)}</b>${first.unapplied > 0.5 ? ` · ${money2(first.unapplied)} of the windfall is more than you owe` : ''}</p>
    <div class="table-scroll"><table class="amort"><caption class="sr-only">Planned payment this month</caption><thead><tr><th scope="col">Debt</th><th scope="col" title="Payment">Pay</th><th scope="col">Interest</th><th scope="col" title="Principal">Principal</th><th scope="col" title="Balance left after the payment">Left</th></tr></thead><tbody>
    ${first.rows.map(r => `<tr><th scope="row">${esc(r.name)}${r.dueDay ? ` <span class="small">due ${r.due.toLocaleDateString('en-US',{month:'short', day:'numeric'})}</span>` : ''}</th><td data-label="Pay">${money2(r.payment)}</td><td data-label="Interest">${money2(r.interest)}</td><td data-label="Principal" class="${r.principal<0?'neg':''}">${money2(r.principal)}</td><td data-label="Left">${money2(r.balance)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="lin-empty">Nothing to pay.</p>'}
  </section>
  <section class="gcard" aria-labelledby="scT"><h2 id="scT" class="g-h">Month-by-month schedule</h2>
    <div class="field"><label for="schedAcct">Show</label><select id="schedAcct"><option value="">All debts</option>${open.map(a => `<option value="${esc(a.id)}" ${planFilter===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
    <div class="table-scroll" id="schedTable" tabindex="0" role="region" aria-label="Amortization schedule"><table class="amort"><caption class="sr-only">${planFilter ? 'Schedule for one debt' : 'Schedule for every debt'}. Interest is charged, then the payment is applied.</caption>
      <thead><tr><th scope="col">Month</th><th scope="col" title="Payment">Pay</th><th scope="col">Interest</th><th scope="col" title="Principal">Principal</th><th scope="col" title="Balance left">Left</th></tr></thead><tbody>
      ${shown.map(m => { const row = planFilter ? m.rows[0] : null; const payment = row ? row.payment : m.payment; const interest = row ? row.interest : m.interest; const principal = row ? row.principal : m.principal; const balance = row ? row.balance : m.balance; const when = row && row.due ? row.due : m.date; return `<tr><th scope="row">${fmtMonth(when)}</th><td data-label="Pay">${money2(payment)}</td><td data-label="Interest">${money2(interest)}</td><td data-label="Principal" class="${principal<0?'neg':''}">${money2(principal)}</td><td data-label="Left">${money2(balance)}</td></tr>`; }).join('')}
      </tbody></table></div>
    ${filtered.length > cap ? `<button type="button" class="btn sm" id="showAllSched" style="margin-top:10px">Show ${Math.min(filtered.length, 240)} months</button>` : filtered.length > 18 ? `<p class="small">Showing ${shown.length} of ${filtered.length} months.</p>` : ''}
    <p class="small">Each debt is paid on its due day. Debts without a due day are paid on the 1st. Interest is still one month at a time. A logged payment adds the interest since the last balance change, then the payment is applied.</p>
  </section>`;
}
function readPlanForm(root){
  const page = root || document.querySelector('.plan');
  if (!page) return;
  const take = (el, emptyNull) => {
    if (!el) return undefined;
    const raw = el.value.trim();
    if (raw === '') return emptyNull ? null : 0;
    const n = num(raw);
    if (n == null || isNaN(n) || n < 0) return undefined;
    return r2(n);
  };
  const inc = take(page.querySelector('#plIncome'), true);
  if (inc !== undefined) S.settings.income = inc;
  const extra = take(page.querySelector('#plExtra'), false);
  if (extra !== undefined) S.settings.extraMonthly = extra;
  const wind = take(page.querySelector('#plWind'), false);
  if (wind !== undefined) S.settings.windfall = wind;
  const bud = page.querySelector('#plBudget');
  if (bud) { const b = take(bud, true); if (b !== undefined) S.settings.budget = b; }
  page.querySelectorAll('[data-exp-name]').forEach(el => { const e = (S.settings.expenses || []).find(x => x.id === el.dataset.expName); if (e) e.name = el.value.slice(0, 80); });
  page.querySelectorAll('[data-exp-amt]').forEach(el => { const e = (S.settings.expenses || []).find(x => x.id === el.dataset.expAmt); if (!e) return; const n = take(el, false); if (n !== undefined) e.amount = n; });
  const acc = page.querySelector('#plAccel'); if (acc) S.settings.accelerateFocus = acc.checked;
  const cf = page.querySelector('#plCash'); if (cf) S.settings.useCashFlow = cf.checked;
  const months = page.querySelector('#plMonths'); if (months) S.settings.defaultMonths = +months.value || 6;
  if (S.settings.useCashFlow) syncBudgetFromCashFlow();
}
function refreshPlanResults(){
  const box = document.getElementById('planResults');
  if (!box) return;
  box.innerHTML = planResultsHTML();
  bindPlanResults(box);
}
function bindPlanResults(box){
  if (!box) return;
  box.querySelectorAll('[data-pick-strategy]').forEach(b => b.addEventListener('click', () => {
    readPlanForm(document.querySelector('.plan'));
    S.settings.strategy = b.dataset.pickStrategy;
    if (S.settings.strategy === 'custom') S.settings.customOrder = normalizedCustomOrder();
    save(); render();
    document.querySelector(`[data-strategy="${b.dataset.pickStrategy}"]`)?.focus();
  }));
  box.querySelector('#showAllSched')?.addEventListener('click', () => { planShowAll = true; refreshPlanResults(); document.getElementById('schedTable')?.focus(); });
  box.querySelector('#schedAcct')?.addEventListener('change', e => { planFilter = e.target.value; refreshPlanResults(); document.getElementById('schedAcct')?.focus(); });
}
function viewPlan(){
  const s = S.settings;
  const order = normalizedCustomOrder();
  const byId = Object.fromEntries(S.accounts.map(a => [a.id, a]));
  return `<div class="plan">
  <h1 class="large-title">Plan</h1>
  <p class="subtitle">Snowball, avalanche, or your own order. Interest each month is balance × APR ÷ 12, rounded to the cent, then the payment is applied. Paid-off amounts roll to the next debt.</p>
  <section class="gcard" aria-labelledby="stT">
    <h2 id="stT" class="g-h">Strategy</h2>
    <div class="segmented" role="radiogroup" aria-label="Payoff strategy">${['snowball','avalanche','custom'].map(k => `<button type="button" role="radio" data-strategy="${k}" aria-checked="${s.strategy===k}" tabindex="${s.strategy===k?0:-1}">${STRAT[k].label}</button>`).join('')}</div>
    <p class="g-sub" style="margin-top:10px">${STRAT[s.strategy]?.blurb || ''}</p>
    ${s.strategy==='custom' ? `<ol class="order-list">${order.map((id, i) => { const a = byId[id]; if (!a) return ''; return `<li><span class="order-n">${i+1}</span>${avatar(a,32,12)}<span class="order-name"><b>${esc(a.name)}</b><span>${a.apr ? a.apr+'% APR' : 'No APR'} · ${money2(a.balance)}</span></span><span class="order-mv"><button type="button" class="icon-btn" data-move="${esc(id)}" data-dir="-1" ${i===0?'disabled':''} aria-label="Move ${esc(a.name)} up">↑</button><button type="button" class="icon-btn" data-move="${esc(id)}" data-dir="1" ${i===order.length-1?'disabled':''} aria-label="Move ${esc(a.name)} down">↓</button></span></li>`; }).join('')}</ol>` : ''}
  </section>
  <section class="gcard" aria-labelledby="mnT">
    <h2 id="mnT" class="g-h">Money for debt</h2>
    <div class="plan-cols">
      <div class="field"><label for="plIncome">Monthly income</label><input id="plIncome" inputmode="decimal" autocomplete="off" value="${s.income ?? ''}" placeholder="$0"></div>
      <div class="field"><label for="plExtra">Extra every month</label><input id="plExtra" inputmode="decimal" autocomplete="off" value="${s.extraMonthly || ''}" placeholder="$0"><div class="help">Added on top of minimums. If the debt budget is already above the minimums, use this only for money beyond that.</div></div>
    </div>
    <div class="field"><label for="plWind">One-time windfall</label><input id="plWind" inputmode="decimal" autocomplete="off" value="${s.windfall || ''}" placeholder="$0"><div class="help">Applied once, in the first month, after each debt gets its planned payment.</div></div>
    <h3 class="micro">Monthly expenses</h3>
    <div id="expList">${(s.expenses||[]).length ? s.expenses.map(e => `<div class="exp-row"><label class="sr-only" for="exn-${esc(e.id)}">Expense name</label><input id="exn-${esc(e.id)}" data-exp-name="${esc(e.id)}" value="${esc(e.name)}" placeholder="Rent, groceries" autocomplete="off" maxlength="80"><label class="sr-only" for="exa-${esc(e.id)}">Amount for ${esc(e.name || 'expense')}</label><span class="exp-amt">$<input id="exa-${esc(e.id)}" data-exp-amt="${esc(e.id)}" inputmode="decimal" autocomplete="off" value="${e.amount || ''}" placeholder="0" aria-label="Amount for ${esc(e.name || 'expense')}"></span><button type="button" class="btn sm" data-exp-rm="${esc(e.id)}" aria-label="Remove ${esc(e.name || 'expense')}">Remove</button></div>`).join('') : '<p class="small" id="expEmpty">No expenses yet. Add rent, food, and the other bills that leave each month.</p>'}</div>
    <button type="button" class="btn sm" id="addExp">Add expense</button>
    <div class="switch"><label for="plCash"><b>Use free cash flow as the debt budget</b><span class="small">Income minus expenses. Anything above your minimums goes to the target debt.</span></label><input type="checkbox" role="switch" id="plCash" ${s.useCashFlow?'checked':''}></div>
    ${s.useCashFlow ? `<p class="small">Debt budget follows free cash flow${s.income==null?' once you add income':`: <b>${money2(Math.max(0, cashFlow(s)||0))}</b> a month`}.</p>` : `<div class="field"><label for="plBudget">Amount for debt each month</label><input id="plBudget" inputmode="decimal" autocomplete="off" value="${s.budget ?? ''}" placeholder="Blank uses your minimums"><div class="help">Optional total. Anything above the planned payments goes to the target. This is the same budget as Settings.</div></div>`}
    <div class="switch"><label for="plAccel"><b>Finish the current target in a set number of payments</b><span class="small">The original Debt Slayer boost. Turn it off for a classic plan that pays minimums, plus any extra you add.</span></label><input type="checkbox" role="switch" id="plAccel" ${s.accelerateFocus?'checked':''}></div>
    <div class="field" id="plMonthsWrap" ${s.accelerateFocus?'':'hidden'}><label for="plMonths">Payments to finish the target</label><select id="plMonths">${[4,5,6,7,8].map(n => `<option value="${n}" ${s.defaultMonths===n?'selected':''}>${n}</option>`).join('')}</select></div>
  </section>
  <div id="planResults">${planResultsHTML()}</div>
  </div>`;
}
function bindPlan(root){
  const page = root.querySelector('.plan'); if (!page) return;
  const money = (sel, key, emptyNull) => {
    const el = page.querySelector(sel); if (!el) return;
    el.addEventListener('input', () => {
      const raw = el.value.trim();
      if (raw === '') { S.settings[key] = emptyNull ? null : 0; el.removeAttribute('aria-invalid'); }
      else { const n = num(raw); if (n == null || isNaN(n) || n < 0) { el.setAttribute('aria-invalid','true'); return; } S.settings[key] = r2(n); el.removeAttribute('aria-invalid'); }
      if (S.settings.useCashFlow) syncBudgetFromCashFlow();
      save(); refreshPlanResults();
    });
  };
  money('#plIncome', 'income', true);
  money('#plExtra', 'extraMonthly', false);
  money('#plWind', 'windfall', false);
  page.querySelector('#plBudget')?.addEventListener('input', e => {
    const raw = e.target.value.trim();
    if (raw === '') S.settings.budget = null;
    else { const n = num(raw); if (n == null || isNaN(n) || n < 0) { e.target.setAttribute('aria-invalid','true'); return; } S.settings.budget = r2(n); }
    e.target.removeAttribute('aria-invalid');
    S.settings.useCashFlow = false;
    save(); refreshPlanResults();
  });
  page.querySelectorAll('[data-exp-name]').forEach(el => el.addEventListener('input', () => {
    const e = S.settings.expenses.find(x => x.id === el.dataset.expName); if (e) e.name = el.value.slice(0, 80); save();
  }));
  page.querySelectorAll('[data-exp-amt]').forEach(el => el.addEventListener('input', () => {
    const e = S.settings.expenses.find(x => x.id === el.dataset.expAmt); if (!e) return;
    const raw = el.value.trim();
    if (raw === '') e.amount = 0;
    else { const n = num(raw); if (n == null || isNaN(n) || n < 0) { el.setAttribute('aria-invalid','true'); return; } e.amount = r2(n); }
    el.removeAttribute('aria-invalid');
    if (S.settings.useCashFlow) syncBudgetFromCashFlow();
    save(); refreshPlanResults();
  }));
  page.querySelectorAll('[data-exp-rm]').forEach(b => b.addEventListener('click', () => {
    readPlanForm(page);
    S.settings.expenses = S.settings.expenses.filter(e => e.id !== b.dataset.expRm);
    syncBudgetFromCashFlow(); save(); render();
  }));
  page.querySelector('#addExp')?.addEventListener('click', () => {
    readPlanForm(page);
    S.settings.expenses.push({ id: uid(), name: '', amount: 0 });
    save(); render();
    document.querySelector('.exp-row:last-child input')?.focus();
  });
  page.querySelector('#plCash')?.addEventListener('change', e => {
    readPlanForm(page);
    S.settings.useCashFlow = e.target.checked;
    syncBudgetFromCashFlow(); save(); render();
    document.getElementById('plCash')?.focus();
  });
  page.querySelector('#plAccel')?.addEventListener('change', e => {
    S.settings.accelerateFocus = e.target.checked;
    const wrap = page.querySelector('#plMonthsWrap'); if (wrap) wrap.hidden = !e.target.checked;
    save(); refreshPlanResults();
  });
  page.querySelector('#plMonths')?.addEventListener('change', e => { S.settings.defaultMonths = +e.target.value || 6; save(); refreshPlanResults(); });
  page.querySelectorAll('[data-strategy]').forEach(b => b.addEventListener('click', () => {
    readPlanForm(page);
    S.settings.strategy = b.dataset.strategy;
    if (S.settings.strategy === 'custom') S.settings.customOrder = normalizedCustomOrder();
    save(); render();
    document.querySelector(`[data-strategy="${b.dataset.strategy}"]`)?.focus();
  }));
  page.querySelector('.segmented')?.addEventListener('keydown', e => {
    const keys = ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'];
    if (!keys.includes(e.key)) return;
    const btns = [...page.querySelectorAll('[data-strategy]')];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const dir = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1;
    btns[(i + dir + btns.length) % btns.length].click();
  });
  page.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => {
    if (b.disabled) return;
    readPlanForm(page);
    const order = normalizedCustomOrder();
    const i = order.indexOf(b.dataset.move);
    const dir = +b.dataset.dir;
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const [item] = order.splice(i, 1);
    order.splice(j, 0, item);
    S.settings.customOrder = order;
    S.settings.strategy = 'custom';
    save(); render();
    document.querySelector(`[data-move="${CSS.escape(b.dataset.move)}"][data-dir="${dir}"]`)?.focus();
  }));
  bindPlanResults(page.querySelector('#planResults'));
}

function bindView(){
  const cv = document.querySelector('.dwelcome .stars'); if (cv) startStars(cv);
  document.getElementById('wDemo')?.addEventListener('click', startDemo);
  const wi = document.getElementById('wImport');
  if (wi) { const f = document.getElementById('wImpFile'); wi.addEventListener('click', () => f.click()); f.addEventListener('change', e => { const file = e.target.files[0]; if (file) importFile(file, wi); e.target.value = ''; }); }
  const m = $('#main');
  bindExtra(m);
  bindPlan(m);
  m.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', e => act(b.dataset.act, b, e)));
  const wiIn = m.querySelector('#wiIn'); if (wiIn) { let tmo; wiIn.addEventListener('input', () => { clearTimeout(tmo); tmo = setTimeout(() => { whatIfAmt = Math.max(0, parseFloat(wiIn.value.replace(/[^0-9.]/g,''))||0); const box = m.querySelector('#wiTiles'); box.innerHTML = whatIfTiles(); box.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', e => act(b.dataset.act, b, e))); }, 250); }); }
  m.querySelectorAll('.sl-act [data-rmpay]').forEach(b => b.addEventListener('click', e => askRemovePayment(b.dataset.rmpay, e.currentTarget)));
  m.querySelectorAll('[data-extra]').forEach(b => b.addEventListener('click', () => { simExtra = +b.dataset.extra; $('#simIn').value = simExtra||''; refreshSim(); }));
  const si = $('#simIn'); if (si){ si.addEventListener('input', () => { simExtra = Math.max(0, parseFloat(si.value.replace(/[^0-9.]/g,''))||0); refreshSim(); }); refreshSim(); }
  m.querySelectorAll('.chart').forEach(c => {
    const tip = c.querySelector('.tip-box'); if (!tip) return;
    const show = e => { const el = e.target.closest('[data-tip]'); if (!el){ tip.style.opacity=0; return; } tip.textContent = el.dataset.tip; const r = c.getBoundingClientRect(); const pt = e.touches?e.touches[0]:e; tip.style.left = Math.min(r.width-160, Math.max(0, pt.clientX - r.left + 10))+'px'; tip.style.top = (pt.clientY - r.top - 36)+'px'; tip.style.opacity = 1; };
    c.addEventListener('pointermove', show); c.addEventListener('pointerdown', show); c.addEventListener('pointerleave', () => tip.style.opacity = 0);
  });
}
function refreshSim(){ const o = $('#simOut'); if (o) o.innerHTML = simText(); document.querySelectorAll('[data-extra]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.extra===simExtra && simExtra>0))); }
function toggleDisclosure(btn){ return window.DebtDisclose ? DebtDisclose.toggleDisclosure(btn) : false; }

function act(a, el){
  const id = el.dataset.id; const acc = S.accounts.find(x=>x.id===id);
  switch(a){
    case 'add': return openAccountForm(null, el);
    case 'toProgress': return go('progress');
    case 'toSummary': sumOffset = 0; return go('summary');
    case 'toPlan': return go('plan');
    case 'toHome': return go('home');
    case 'toSnapshot': return go('snapshot');
    case 'toCalendar': return go('calendar');
    case 'toAccounts': return go('accounts');
    case 'disclose': return toggleDisclosure(el);
    case 'snapPrev': { const cur = DebtEngine.weekContaining(new Date()).start; const start = snapWeek || cur; const next = DebtEngine.shiftWeek(start, -1).start; snapWeek = next; return render(); }
    case 'snapNext': { const cur = DebtEngine.weekContaining(new Date()).start; const start = snapWeek || cur; if (start >= cur) return; const next = DebtEngine.shiftWeek(start, 1).start; snapWeek = next >= cur ? null : next; return render(); }
    case 'snapToday': snapWeek = null; return render();
    case 'snapPrint': window.print(); return;
    case 'sumPrev': sumOffset--; return render();
    case 'sumNext': sumOffset = Math.min(0, sumOffset+1); return render();
    case 'dismissBanner': S.banner = null; save(); return render();
    case 'dismissTip': S.flags.backupTip = true; save(); return render();
    case 'export': return exportJSON();
    case 'log': return openLog(acc, el);
    case 'detail': return openDetail(acc, el);
    case 'check': return openCheck(el);
    case 'calAll': return openCalendar(el);
    case 'summary': return openSummary(el);
    case 'extraFor': return openExtraFor(acc, el);
  }
}

// ---------- dialog stack ----------
const stack = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])';
function openDialog({ title, body, trigger, onMount, label }){
  const bd = document.createElement('div'); bd.className = 'backdrop';
  const id = 'dlg' + uid();
  bd.innerHTML = `<div class="sheet glass" role="dialog" aria-modal="true" aria-labelledby="${id}t"><div class="grabber" aria-hidden="true"></div>
    <div class="sheet-head"><h2 id="${id}t">${esc(title)}</h2><button class="close-x" data-close aria-label="Close">✕</button></div><div class="sheet-body">${body}</div></div>`;
  const entry = { el:bd, trigger: trigger || document.activeElement };
  bd.addEventListener('mousedown', e => { entry.downOnBd = e.target === bd; });
  bd.addEventListener('click', e => { if (e.target === bd && entry.downOnBd) closeTop(); });
  bd.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeTop()));
  if (stack.length) stack[stack.length-1].el.setAttribute('aria-hidden','true');
  $('#dialogs').appendChild(bd); stack.push(entry);
  document.querySelectorAll('header,main,nav.tabbar,#fab').forEach(n => n.setAttribute('inert',''));
  document.body.style.overflow = 'hidden';
  updateFab();
  onMount && onMount(bd.querySelector('.sheet'), entry);
  const first = bd.querySelector('.sheet-body ' + 'input,select') || bd.querySelector('.sheet-body ' + FOCUSABLE) || bd.querySelector('[data-close]');
  requestAnimationFrame(() => first && first.focus());
  return entry;
}
function closeTop(){
  const e = stack.pop(); if (!e) return;
  e.el.remove();
  if (stack.length){ stack[stack.length-1].el.removeAttribute('aria-hidden'); }
  else { document.querySelectorAll('[inert]').forEach(n => n.removeAttribute('inert')); document.body.style.overflow = ''; }
  updateFab();
  const t = e.trigger; if (t && document.contains(t)) t.focus(); else if (!stack.length) $('#main').focus({preventScroll:true});
}
function closeAll(){ while (stack.length) closeTop(); }
document.addEventListener('keydown', e => {
  if (!stack.length) return;
  const top = stack[stack.length-1].el;
  if (e.key === 'Escape'){ e.preventDefault(); closeTop(); return; }
  if (e.key === 'Tab'){
    const f = [...top.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)){ e.preventDefault(); f[f.length-1].focus(); }
    else if (!e.shiftKey && (i === f.length-1 || i === -1)){ e.preventDefault(); f[0].focus(); }
  }
});

function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.remove('has-action'); t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400); }

// ---------- forms ----------
function field({ id, label, type='text', value='', placeholder='', help='', attrs='' }){
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${attrs} aria-describedby="${help?id+'-h ':''}${id}-e">${help?`<div class="help" id="${id}-h">${help}</div>`:''}<div class="err" id="${id}-e" hidden></div></div>`;
}
function setErr(form, name, msg){
  const inp = form.querySelector('#'+name), e = form.querySelector('#'+name+'-e');
  if (msg){ inp.setAttribute('aria-invalid','true'); e.innerHTML = icon.err + '<span>' + esc(msg) + '</span>'; e.hidden = false; }
  else { inp.removeAttribute('aria-invalid'); e.hidden = true; e.innerHTML = ''; }
}
const num = v => { const s = String(v).replace(/[$,\s]/g,''); return s === '' ? null : (isFinite(+s) ? +s : NaN); };

function logoField(acc){
  const cur = (window.DebtLogos && DebtLogos.sanitizeLogo(acc && acc.logo)) || 'auto';
  const lenders = window.DebtLogos ? DebtLogos.LENDERS : [];
  const opts = [['auto', 'Match the name'], ['none', 'Letter badge'], ...lenders.map(l => [l.id, l.label])];
  return `<div class="field"><label for="f_logo">Logo</label><select id="f_logo">${opts.map(([id, label]) => `<option value="${esc(id)}" ${cur === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select><p class="help">Shown beside the name. Leave it on “Match the name,” or pick a lender.</p></div>`;
}
function openAccountForm(acc, trigger){
  const edit = !!acc;
  const body = `<form novalidate id="acctForm">
    ${field({id:'f_name',label:'Name',value:acc?.name||'',placeholder:'Affirm, Best Buy, Platinum One',attrs:'autocomplete="off"'})}
    <div class="field"><label for="f_type">Type</label><select id="f_type" aria-describedby="f_type-h">${TYPES.map(t=>`<option ${acc?.type===t?'selected':''}>${t}</option>`).join('')}</select><div class="help" id="f_type-h" ${edit?'hidden':''}>Picked automatically from the name.</div></div>
    ${logoField(acc)}
    <div class="two-col">${field({id:'f_start',label:'Starting balance',value:acc?.start??'',placeholder:'$0.00',attrs:'inputmode="decimal"'})}
    ${field({id:'f_bal',label:'Current balance',value:edit?acc.balance:'',placeholder:'Same as start',attrs:'inputmode="decimal"'})}</div>
    <div class="two-col">${field({id:'f_min',label:'Minimum payment',value:acc?.min??'',placeholder:'$0.00',attrs:'inputmode="decimal"'})}
    ${field({id:'f_apr',label:'Interest rate (APR) — optional',value:acc?.apr||'',placeholder:'e.g. 24.99',help:'Add it for a more accurate payoff date.',attrs:'inputmode="decimal"'})}</div>
    <div class="field"><label for="f_due">Due day</label><select id="f_due" aria-describedby="f_due-h"><option value="">No due date</option>${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${acc?.dueDay===i+1?'selected':''}>${ordinal(i+1)}</option>`).join('')}</select><div class="help" id="f_due-h">The payoff schedule puts this debt's payment on this day, and flags it on the calendar.</div></div>
    <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary">${edit?'Save changes':'Add account'}</button></div>
    ${edit?`<button type="button" class="link-btn" id="delAcct" style="color:var(--red);margin-top:14px">Delete this account</button>`:''}
  </form>`;
  openDialog({ title: edit?'Edit account':'Add account', body, trigger, onMount: sh => {
    const f = sh.querySelector('form'); let typeTouched = edit;
    f.querySelector('[data-close]').addEventListener('click', closeTop);
    f.f_type.addEventListener('change', () => { typeTouched = true; $('#f_type-h', f).hidden = true; });
    f.f_name.addEventListener('input', () => { if (typeTouched) return; const t = detectType(f.f_name.value); if (t){ f.f_type.value = t; $('#f_type-h', f).hidden = false; } });
    f.querySelector('#delAcct')?.addEventListener('click', e => confirmDialog({ title:'Delete account?', text:`This removes ${acc.name} and its payments from this device.`, ok:'Delete', trigger:e.currentTarget, onOk:() => { S.accounts = S.accounts.filter(x=>x.id!==acc.id); S.payments = S.payments.filter(p=>p.accountId!==acc.id); noteChange('removing '+acc.name); closeAll(); render(); toast('Account deleted'); } }));
    f.addEventListener('submit', e => {
      e.preventDefault();
      const name = f.f_name.value.trim(), start = num(f.f_start.value), balRaw = num(f.f_bal.value), min = num(f.f_min.value), apr = num(f.f_apr.value);
      const bal = balRaw === null ? start : balRaw;
      const errs = {};
      if (!name) errs.f_name = 'Enter a name for this account.';
      if (start === null || isNaN(start) || start <= 0) errs.f_start = 'Starting balance must be more than $0.';
      if (balRaw !== null && (isNaN(balRaw) || (balRaw <= 0 && !edit) || balRaw < 0)) errs.f_bal = edit ? 'Current balance can’t be negative.' : 'Current balance must be more than $0.';
      else if (balRaw !== null && start > 0 && balRaw > start*5) errs.f_bal = 'That looks much higher than the starting balance.';
      if (min === null || isNaN(min) || min < 0) errs.f_min = 'Minimum payment must be $0 or more.';
      else if (bal > 0 && min > bal) errs.f_min = 'Minimum can’t be more than the balance.';
      if (apr !== null && (isNaN(apr) || apr < 0 || apr > 100)) errs.f_apr = 'Interest rate must be between 0 and 100.';
      ['f_name','f_start','f_bal','f_min','f_apr'].forEach(k => setErr(f, k, errs[k]));
      const firstBad = ['f_name','f_start','f_bal','f_min','f_apr'].find(k => errs[k]);
      if (firstBad){ f.querySelector('#'+firstBad).focus(); return; }
      const data = { name, type:f.f_type.value, start:r2(start), balance:r2(bal), min:r2(min), apr: apr ? apr : 0, dueDay: f.f_due.value ? +f.f_due.value : null };
      const chosen = window.DebtLogos ? DebtLogos.sanitizeLogo(f.f_logo.value) : null;
      const first = !S.accounts.length;
      if (edit){ const prevBal = acc.balance; Object.assign(acc, data); if (chosen) acc.logo = chosen; else delete acc.logo; recordBalance(acc, prevBal); noteChange('editing '+name); }
      else { const row = { id:uid(), tier:null, created:todayISO(), ...data }; if (chosen) row.logo = chosen; S.accounts.push(row); noteChange('adding '+name); }
      if (first) S.flags.backupTip = false;
      save(); closeAll(); render(); toast(edit ? 'Changes saved' : 'Account added');
    });
  }});
}

function acardHTML(a){
  const due = a.dueDay ? nextDue(a.dueDay) : null;
  const dueTxt = a.balance <= 0.004 ? 'Paid off' : !due ? 'No due date' : due.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  return `<section class="acard" aria-label="${esc(a.name)} summary">
    <div class="ac-top">${avatar(a, 24, 12)}<b class="ac-name">${esc(a.name)}</b></div>
    <p class="ac-big">${money2(a.balance)}</p><p class="ac-sub">${a.balance <= 0.004 ? 'paid off' : 'left to pay'}</p>
    <p class="ac-min"><span class="calm-kicker">Minimum</span><br><b>${money2(a.min)}</b></p>
    <p class="ac-min"><span class="calm-kicker">Next due</span><br><b>${dueTxt}</b></p>
    ${a.balance > 0.004 ? `<div class="ac-foot"><button type="button" class="ac-pay" id="acPay">Log a payment</button></div>` : ''}
  </section>`;
}
function payHistoryHTML(a){
  const ps = S.payments.filter(p => p.accountId === a.id).sort((x,y) => y.date.localeCompare(x.date));
  return `<h3 class="micro" style="margin:18px 0 8px">Payment history</h3>${ps.length ? `<ul class="list pay-hist">${ps.map(p => `<li><span><b>${money2(p.amount)}</b> <span class="muted">${fmtDay(p.date)}${p.interest > 0.004 ? ` · ${money2(p.interest)} interest · ${money2(p.principal)} principal` : ''}</span></span><button type="button" class="btn sm rm-pay" data-rmpay="${p.id}" aria-label="Remove ${money2(p.amount)} payment on ${fmtDay(p.date)}">Remove</button></li>`).join('')}</ul>` : '<p class="small" style="margin:0">No payments logged yet.</p>'}`;
}
const fmtDay = iso => new Date(iso+'T12:00').toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' });
function removePayment(id){
  const i = S.payments.findIndex(p => p.id === id); if (i < 0) return null;
  const p = S.payments[i], acc = S.accounts.find(a => a.id === p.accountId), before = acc ? acc.balance : 0;
  S.payments.splice(i, 1);
  if (acc) {
    if (p.legacy === false) acc.balance = r2(Math.max(0, before - (Number(p.interest) || 0) + p.amount));
    else acc.balance = r2(acc.start > 0 ? Math.min(Math.max(acc.start, before), before + p.amount) : before + p.amount);
    if (acc.balance > 0.004) acc.celebrated = false;
  }
  save(); return { p, i, accId: acc?.id, before, wasCelebrated: acc ? before <= 0.004 : false };
}
function undoRemove(u){
  if (!u) return; S.payments.splice(Math.min(u.i, S.payments.length), 0, u.p);
  const acc = S.accounts.find(a => a.id === u.accId); if (acc) { acc.balance = u.before; if (u.wasCelebrated) acc.celebrated = true; }
  save(); render();
}
function askRemovePayment(id, trigger, after){
  const p = S.payments.find(x => x.id === id); if (!p) return; const acc = S.accounts.find(a => a.id === p.accountId);
  confirmDialog({ title:'Remove payment?', trigger, text:`Remove ${money2(p.amount)} payment to ${acc ? acc.name : 'this account'} on ${fmtDay(p.date)}?`, ok:'Remove', onOk: () => {
    closeTop(); const u = removePayment(id); render(); after?.(); toastUndo('Payment removed', () => { undoRemove(u); after?.(); }); } });
}
function toastUndo(msg, fn){
  const t = $('#toast'); t.innerHTML = `<span>${esc(msg)}</span> <button type="button" class="toast-undo">Undo</button>`; t.classList.add('show', 'has-action');
  t.querySelector('.toast-undo').addEventListener('click', () => { fn(); t.classList.remove('show','has-action'); toast('Payment restored'); });
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show','has-action'), 6000);
}
function confirmDialog({ title, text, ok, onOk, trigger, extra='' }){
  openDialog({ title, trigger, body:`<p class="muted" style="font-size:15px;margin-top:0">${esc(text)}</p>${extra}<div class="form-actions"><button class="btn" data-close>Cancel</button><button class="btn danger" id="okBtn">${esc(ok)}</button></div>`,
    onMount: sh => { sh.querySelector('.form-actions [data-close]').addEventListener('click', closeTop); sh.querySelector('#okBtn').addEventListener('click', onOk); sh.querySelector('#expFirst')?.addEventListener('click', exportJSON); } });
}

function openDetail(acc, trigger){
  const draw = sh => {
    const sim = simulate(S.accounts); const a = acc; const paid = Math.max(0, a.start - a.balance);
    const opts = Object.entries(TIERS).map(([k,t]) => { const amt = Math.max(a.min, Math.ceil(a.balance/t.months)); return `<button role="radio" aria-checked="${a.tier===k}" data-tier="${k}">${t.label}<small>${t.range} · ${money(amt)}/mo</small></button>`; }).join('');
    sh.querySelector('.sheet-body').innerHTML = `
      ${acardHTML(a)}
      <button type="button" class="disclose" id="acctMore" aria-expanded="false" aria-controls="acct-more"><span>Account details</span><span class="mark" aria-hidden="true"></span></button>
      <div id="acct-more" class="more-panel" hidden>
      <div class="row" style="margin:14px 0"><span class="pill type" style="--tc:${TYPE_COLORS[a.type]}">${esc(a.type)}</span> <span class="pill">${a.balance<=0.004?'Knocked out':paceLabel(a)}</span></div>
      <div class="stats">
        <div class="stat"><b>${money2(a.balance)}</b><span>Left to pay</span></div><div class="stat"><b>${money2(paid)}</b><span>Paid so far</span></div>
        <div class="stat"><b>${money2(a.min)}</b><span>Minimum</span></div><div class="stat"><b>${sim.payoff[a.id]?fmtMonth(sim.payoff[a.id]):a.balance<=0.004?'Paid off':'—'}</b><span>Expected payoff</span></div>
        <div class="stat"><b>${a.dueDay?ordinal(a.dueDay):'—'}</b><span>Due each month</span></div><div class="stat"><b>${a.dueDay?nextDue(a.dueDay).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—'}</b><span>Next due</span> ${dueChip(a)}</div>
        <div class="stat" style="grid-column:1/-1"><b>${a.apr?`${money2(sim.interest[a.id]||0)} at ${a.apr}% APR`:'No interest rate entered'}</b><span>Projected interest</span></div>
      </div>
      ${payHistoryHTML(a)}
      <h3 class="micro" style="margin:18px 0 8px">Payoff pace</h3>
      <div class="segmented" role="radiogroup" aria-label="Payoff pace">${opts}</div>
      <p class="muted" style="margin:10px 0 0">${a.tier?`Aims to clear it in about ${plural(TIERS[a.tier].months,'month')}: ${money2(Math.max(a.min,Math.ceil(a.balance/TIERS[a.tier].months)))} a month, plus anything rolled over.`:`No pace set. It pays the minimum until the ${(STRAT[S.settings.strategy]?.label || 'snowball').toLowerCase()} plan sends extra its way. Pick a pace to give it a deadline.`}
      ${a.tier?' <button class="link-btn" id="clearTier">Clear this pace</button>':''}</p>
      <div class="actions">${a.balance>0.004?'<button class="btn primary block" id="dLog">Log a payment</button>':''}<button class="btn block" id="dEdit">Edit account</button>${a.balance>0.004?'<button class="btn block" id="dExtra">What if I pay extra?</button>':''}
      ${a.dueDay?`<a class="btn block" href="${calUrl(a)}" target="_blank" rel="noopener">Add monthly reminder to Google Calendar</a>`:'<p class="small" style="margin:0;text-align:center">Set a due day to add a calendar reminder.</p>'}
      <button class="btn block" data-close2>Close</button></div></div>`;
    sh.querySelector('h2').innerHTML = `${avatar(a, 22, 12)}<span>${esc(a.name)}</span>`;
    sh.querySelectorAll('[data-tier]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.tier; a.tier = a.tier===k?null:k; noteChange('changing the pace on '+a.name); render(); draw(sh); sh.querySelector(`[data-tier="${k}"]`).focus(); }));
    sh.querySelector('#clearTier')?.addEventListener('click', () => { a.tier = null; noteChange('changing the pace on '+a.name); render(); draw(sh); });
    sh.querySelector('#dLog')?.addEventListener('click', e => openLog(a, e.currentTarget));
    sh.querySelector('#acPay')?.addEventListener('click', e => openLog(a, e.currentTarget));
    sh.querySelector('#dEdit').addEventListener('click', e => openAccountForm(a, e.currentTarget));
    sh.querySelector('#dExtra')?.addEventListener('click', e => openExtraFor(a, e.currentTarget));
    sh.querySelector('#acctMore')?.addEventListener('click', () => toggleDisclosure(sh.querySelector('#acctMore')));
    sh.querySelector('[data-close2]').addEventListener('click', closeTop);
    sh.querySelectorAll('[data-rmpay]').forEach(b => b.addEventListener('click', e => askRemovePayment(b.dataset.rmpay, e.currentTarget, () => { if (document.body.contains(sh)) draw(sh); })));
  };
  openDialog({ title:acc.name, body:'', trigger, onMount: draw });
}

function isoToDate(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
}
function lastEventISO(acc){
  const dates = [acc.created, ...S.payments.filter(p => p.accountId === acc.id).map(p => p.date), ...(S.adjustments || []).filter(a => a.accountId === acc.id).map(a => a.date)].filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : todayISO();
}
function recordBalance(acc, previous){
  if (Math.abs(acc.balance - previous) <= 0.004) return;
  if (!Array.isArray(S.adjustments)) S.adjustments = [];
  S.adjustments.push({ id: uid(), accountId: acc.id, date: todayISO(), balance: r2(acc.balance), previous: r2(previous) });
}
function paymentSplit(acc, amount, date){
  const fromISO = lastEventISO(acc);
  const backdated = date < fromISO;
  const split = DebtEngine.splitPayment(acc.balance, acc.apr || 0, amount, isoToDate(fromISO), isoToDate(date));
  return { ...split, backdated, fromISO };
}
function openLog(acc, trigger){
  const sim = simulate(S.accounts); const plan = r2(sim.firstPay[acc.id] || acc.min);
  const dueInterest = DebtEngine.splitPayment(acc.balance, acc.apr || 0, 0, isoToDate(lastEventISO(acc)), isoToDate(todayISO())).interest;
  const payoffAmt = r2(acc.balance + dueInterest);
  const body = `<form novalidate><p class="muted" style="margin-top:0">${esc(acc.name)} · ${money2(acc.balance)} left</p>
    ${field({id:'p_amt',label:'Amount',value:plan.toFixed(2),attrs:'inputmode="decimal"'})}
    <div class="chips" style="margin:-4px 0 14px"><button type="button" class="chip" data-q="${acc.min}">Minimum</button><button type="button" class="chip" data-q="${plan}">Plan</button><button type="button" class="chip" data-q="${payoffAmt}">Pay it off</button></div>
    ${field({id:'p_date',label:'Date',type:'date',value:todayISO()})}
    <p class="small" id="pSplit" style="margin-top:0"></p>
    <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary">Save payment</button></div></form>`;
  openDialog({ title:'Log a payment', body, trigger, onMount: sh => {
    const f = sh.querySelector('form');
    const paint = () => {
      const el = f.querySelector('#pSplit'); if (!el) return;
      const amt = num(f.p_amt.value), date = f.p_date.value;
      if (amt == null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { el.textContent = ''; return; }
      const split = paymentSplit(acc, amt, date);
      el.textContent = split.backdated ? 'This date is before the last balance change, so the full amount comes off the current balance.'
        : split.interest > 0.004 ? `${money2(split.interest)} is interest since ${fmtDay(split.fromISO)}. ${money2(Math.max(0, split.principal))} lowers the balance.`
        : 'No interest has built up since the last balance change. The whole payment lowers the balance.';
    };
    f.querySelector('[data-close]').addEventListener('click', closeTop);
    f.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { f.p_amt.value = (+b.dataset.q).toFixed(2); f.p_amt.focus(); paint(); }));
    f.p_amt.addEventListener('input', paint); f.p_date.addEventListener('input', paint); paint();
    f.addEventListener('submit', e => {
      e.preventDefault();
      const amt = num(f.p_amt.value); const date = f.p_date.value;
      const split = /^\d{4}-\d{2}-\d{2}$/.test(date) && amt != null ? paymentSplit(acc, amt, date) : null;
      const cap = split ? (split.backdated ? acc.balance : r2(acc.balance + split.interest)) : acc.balance;
      const ea = (amt===null||isNaN(amt)||amt<=0) ? 'Enter an amount more than $0.' : amt > cap + 0.004 ? `That’s more than the ${money2(cap)} owed, including interest.` : null;
      const ed = !/^\d{4}-\d{2}-\d{2}$/.test(date) ? 'Pick a date.' : null;
      setErr(f,'p_amt',ea); setErr(f,'p_date',ed);
      if (ea){ f.p_amt.focus(); return; } if (ed){ f.p_date.focus(); return; }
      const prevPlan = plan;
      if (split.backdated) {
        acc.balance = r2(Math.max(0, acc.balance - amt));
        S.payments.push({ id:uid(), accountId:acc.id, amount:r2(amt), date, interest:0, principal:r2(amt), legacy:true });
      } else {
        const applied = DebtEngine.splitPayment(acc.balance, acc.apr || 0, amt, isoToDate(split.fromISO), isoToDate(date));
        acc.balance = applied.balanceAfter;
        S.payments.push({ id:uid(), accountId:acc.id, amount:r2(amt), date, interest:applied.interest, principal:applied.principal, balanceAfter:applied.balanceAfter, legacy:false });
      }
      noteChange('logging a payment');
      closeAll(); render();
      const saved = S.payments[S.payments.length - 1];
      const wait = anubisStrike(amt, acc.balance <= 0.004);
      const note = saved.interest > 0.004 ? `${money2(amt)} logged · ${money2(saved.interest)} interest · ${money2(saved.principal)} principal` : `${money2(amt)} logged`;
      if (acc.balance <= 0.004) setTimeout(() => celebrate(acc, prevPlan), wait); else toast(note);
    });
  }});
}

function openCheck(trigger){
  const list = openAccounts();
  const body = `<form novalidate><p class="muted" style="margin-top:0">Update any balance that doesn’t match your statement.</p>
    ${list.map(a=>field({id:'c_'+a.id,label:esc(a.name),value:a.balance.toFixed(2),attrs:'inputmode="decimal"'})).join('')}
    <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary">Confirm</button></div></form>`;
  openDialog({ title:'Check your balances', body, trigger, onMount: sh => {
    const f = sh.querySelector('form'); f.querySelector('[data-close]').addEventListener('click', closeTop);
    f.addEventListener('submit', e => { e.preventDefault(); let bad = null;
      list.forEach(a => { const v = num(f['c_'+a.id].value); const er = (v===null||isNaN(v)||v<0) ? 'Enter $0 or more.' : null; setErr(f,'c_'+a.id,er); if (er && !bad) bad = 'c_'+a.id; });
      if (bad){ f.querySelector('#'+bad).focus(); return; }
      const plans = simulate(S.accounts).firstPay; const zeroed = [];
      list.forEach(a => { const prev = a.balance; a.balance = r2(num(f['c_'+a.id].value)); if (a.balance > a.start) a.start = a.balance; recordBalance(a, prev); if (a.balance <= 0.004) zeroed.push(a); });
      noteChange('checking balances'); closeAll(); render(); toast('Balances updated'); if (zeroed[0]) celebrate(zeroed[0], plans[zeroed[0].id]); });
  }});
}

function calUrl(a){
  const d = nextDue(a.dueDay); const f = x => `${x.getFullYear()}${String(x.getMonth()+1).padStart(2,'0')}${String(x.getDate()).padStart(2,'0')}`;
  const e = new Date(d); e.setDate(e.getDate()+1);
  const p = new URLSearchParams({ action:'TEMPLATE', text:`Pay ${a.name}`, dates:`${f(d)}/${f(e)}`, details:`Debt Slayer reminder: pay at least ${money2(a.min)} on ${a.name}.`, recur:`RRULE:FREQ=MONTHLY;BYMONTHDAY=${a.dueDay}` });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}
function openCalendar(trigger){
  const list = openAccounts();
  const body = `<p class="muted" style="margin-top:0">Each link opens Google Calendar with a monthly reminder ready to save.</p>
   <ul class="list">${list.map(a=>`<li><span style="flex:1"><b>${esc(a.name)}</b><br><span class="small">${a.dueDay?'Due the '+ordinal(a.dueDay):'No due date set'}</span></span>${a.dueDay?`<a class="btn sm" href="${calUrl(a)}" target="_blank" rel="noopener">Add reminder</a>`:''}</li>`).join('')}</ul>
   <div class="form-actions"><button class="btn" data-close>Done</button></div>`;
  openDialog({ title:'Calendar reminders', body, trigger, onMount: sh => sh.querySelector('.form-actions [data-close]').addEventListener('click', closeTop) });
}

function summaryText(){
  const t = totals(), sim = simulate(S.accounts), now = new Date();
  const mp = S.payments.filter(p => monthKey(new Date(p.date+'T12:00')) === monthKey(now));
  const lines = [`Debt Slayer — ${fmtMonth(now)} summary`, '', `${money2(t.paid)} paid off so far, ${money2(t.left)} still owed.`, `This month: ${plural(mp.length,'payment')} totaling ${money2(mp.reduce((s,p)=>s+p.amount,0))}.`, sim.freeDate ? debtFree(sim.freeDate) + '.' : '', '', 'Payoff order:'];
  orderAll().forEach((a,i) => lines.push(`${i+1}. ${a.name} — ${a.balance<=0.004?'paid off':money2(a.balance)+' left'+(sim.payoff[a.id]?', done '+fmtMonth(sim.payoff[a.id]):'')}`));
  return lines.filter((l,i,arr)=>!(l===''&&arr[i-1]==='')).join('\n');
}
function openSummary(trigger){
  const txt = summaryText();
  const body = `<pre class="summary" id="sumTxt">${esc(txt)}</pre><div class="form-actions"><a class="btn" href="mailto:?subject=${encodeURIComponent('My debt payoff summary')}&body=${encodeURIComponent(txt)}">Email it</a><button class="btn" id="copyBtn">Copy text</button></div>
   <div class="form-actions"><button class="btn" data-close>Cancel</button></div>`;
  openDialog({ title:'Monthly summary', body, trigger, onMount: sh => {
    sh.querySelector('.form-actions [data-close]').addEventListener('click', closeTop);
    sh.querySelector('#copyBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(txt); toast('Copied'); } catch { const r = document.createRange(); r.selectNodeContents(sh.querySelector('#sumTxt')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Text selected — press copy'); } });
  }});
}

// ---------- backup ----------
function download(name, text, type){ const b = new Blob([text], { type }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
function exportJSON(){ download(`debt-slayer-backup-${todayISO()}.json`, JSON.stringify({ app:'debt-slayer', exported:new Date().toISOString(), data:S }, null, 2), 'application/json'); toast('Backup exported'); S.flags.backupTip = true; save(); if (!stack.length) render(); }
function exportCSV(){
  const rows = [['date','account','type','amount','interest','principal']].concat(S.payments.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(p => { const a = S.accounts.find(x=>x.id===p.accountId); return [p.date, a?.name||'', a?.type||'', p.amount.toFixed(2), (Number(p.interest)||0).toFixed(2), (Number(p.principal)||0).toFixed(2)]; }));
  download(`debt-slayer-payments-${todayISO()}.csv`, rows.map(r=>r.map(c=>/[",\n]/.test(c)?`"${String(c).replace(/"/g,'""')}"`:c).join(',')).join('\n'), 'text/csv'); toast('CSV exported');
}
function validBackup(obj){
  const d = obj && (obj.app === 'debt-slayer' || obj.app === 'debt-killer') ? obj.data : obj;
  const n = normalize(d); if (!n) return null;
  const okA = n.accounts.every(a => a && typeof a.id==='string' && typeof a.name==='string' && isFinite(a.start) && isFinite(a.balance) && isFinite(a.min) && TYPES.includes(a.type));
  const okP = n.payments.every(p => p && typeof p.accountId==='string' && isFinite(p.amount) && /^\d{4}-\d{2}-\d{2}$/.test(p.date));
  return okA && okP ? n : null;
}
function importFile(file, trigger){
  if (DEMO) { toast('Exit sample data before importing. Your saved accounts are untouched.'); return; }
  const r = new FileReader();
  r.onload = () => { let n = null; try { n = validBackup(JSON.parse(r.result)); } catch {}
    const msg = $('#impMsg');
    if (!n){ if (msg){ msg.hidden = false; msg.innerHTML = icon.err + '<span>That file isn’t a Debt Slayer backup.</span>'; } else toast('That file isn’t a Debt Slayer backup.'); return; }
    if (msg) msg.hidden = true;
    confirmDialog({ title:'Replace your data?', trigger, text:`This replaces everything on this device with the backup (${plural(n.accounts.length,'account')}, ${plural(n.payments.length,'payment')}).`, ok:'Replace', onOk: () => { S = n; save(); closeAll(); render(); toast('Backup imported'); } });
  };
  r.readAsText(file);
}

function openSettings(trigger){
  const s = S.settings;
  const body = `<form novalidate id="setForm">
   ${field({id:'s_budget',label:'Monthly budget — optional',value:s.budget??'',placeholder:'$0',help:'The total you can put toward debt each month. Anything above your planned payments goes to the target debt. Saving a different number here turns off “use free cash flow” on the Plan tab.',attrs:'inputmode="decimal"'})}
   <div class="field"><label for="s_months">Payments to finish the target</label><select id="s_months" aria-describedby="s_months-h">${[4,5,6,7,8].map(n=>`<option value="${n}" ${s.defaultMonths===n?'selected':''}>${plural(n,'payment')}</option>`).join('')}</select>
   <div class="help" id="s_months-h">Used only when “Finish the current target in a set number of payments” is on. That switch is on the Plan tab.</div></div>
   <button type="button" class="btn block" id="openPlan">Open payoff plan</button>
   <div class="field"><span class="lbl" id="accLbl">Accent color</span>
     <div class="swatches" role="radiogroup" aria-labelledby="accLbl">${ACCENTS.map(([k,n])=>{ const on = (s.accent||'gold')===k; return `<button type="button" role="radio" class="swatch sw-${k}" data-accent="${k}" aria-checked="${on}" aria-label="${n}" tabindex="${on?0:-1}"><i></i></button>`; }).join('')}</div>
     <div class="help">Changes buttons, links and the active tab. Category, pace and due-date colors stay the same.</div></div>
   <div class="switch"><label for="s_dark"><b>Dark mode</b></label><input type="checkbox" role="switch" id="s_dark" ${s.theme==='dark'?'checked':''} ${s.followSystem?'disabled':''}></div>
   <div class="switch"><label for="s_strike"><b>Anubis strike when you log a payment</b></label><input type="checkbox" role="switch" id="s_strike" ${s.strike!==false?'checked':''}></div>
   <div class="switch"><label for="s_sys"><b>Match system appearance</b></label><input type="checkbox" role="switch" id="s_sys" ${s.followSystem?'checked':''}></div>
   <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary">Save changes</button></div>
  </form><hr class="sep">
  <section id="syncSec">${syncSectionHTML()}</section><hr class="sep">
  ${DEMO ? '' : `<button type="button" class="btn block" id="viewSample">View sample data</button><p class="small" style="margin:6px 0 14px">Sample debts stay in this tab. They don’t replace the accounts on this device, and they aren’t synced.</p>`}
  <h3 class="micro">Backup</h3><p class="small" style="margin:6px 0 10px">${storageMsg()}</p>
  <div class="toolbar"><button class="btn sm" id="expJ">Export backup</button><button class="btn sm" id="impJ">Import backup</button><button class="btn sm" id="expC">Export CSV of payments</button>
  <input type="file" id="impFile" accept="application/json,.json" hidden aria-label="Backup file"></div><div class="err" id="impMsg" hidden></div>
  ${DEMO ? '' : '<hr class="sep"><button class="btn block" id="eraseBtn" style="color:var(--red)">Erase everything</button>'}
  <hr class="sep"><div class="about"><img src="logos/anubis/anubis-512.png" alt="Anubis illustration" width="72" height="72" loading="lazy"><div><h3 class="micro" style="margin:0 0 4px">About Debt Slayer</h3><p class="small" style="margin:0">A debt payoff planner. ${storageMsg()}</p></div></div>`;
  openDialog({ title:'Settings', body, trigger, onMount: sh => {
    const f = sh.querySelector('form'); f.querySelector('[data-close]').addEventListener('click', closeTop);
    const prevTheme = s.theme, prevSys = s.followSystem, prevAcc = s.accent;
    const sws = [...sh.querySelectorAll('.swatch')];
    const pick = (b, focus) => { sws.forEach(x => { const on = x === b; x.setAttribute('aria-checked', on); x.tabIndex = on ? 0 : -1; }); s.accent = b.dataset.accent; applyTheme(); if (focus) b.focus(); };
    sws.forEach((b,i) => { b.addEventListener('click', () => pick(b)); b.addEventListener('keydown', e => {
      const d = {ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key]; if (d) { e.preventDefault(); pick(sws[(i+d+sws.length)%sws.length], true); }
      else if (e.key==='Home'||e.key==='End') { e.preventDefault(); pick(sws[e.key==='Home'?0:sws.length-1], true); } }); });
    f.s_dark.addEventListener('change', () => { s.theme = f.s_dark.checked?'dark':'light'; applyTheme(); });
    f.s_sys.addEventListener('change', () => { s.followSystem = f.s_sys.checked; f.s_dark.disabled = s.followSystem; applyTheme(); });
    sh._revert = () => { s.theme = prevTheme; s.followSystem = prevSys; s.accent = prevAcc; applyTheme(); };
    sh.querySelector('#openPlan')?.addEventListener('click', () => { closeAll(); go('plan'); });
    f.addEventListener('submit', e => { e.preventDefault(); const b = num(f.s_budget.value); const er = (b!==null && (isNaN(b)||b<0)) ? 'Budget must be $0 or more.' : null; setErr(f,'s_budget',er); if (er){ f.s_budget.focus(); return; }
      const nextBudget = b || null;
      if (nextBudget !== s.budget) s.useCashFlow = false;
      s.budget = nextBudget; s.defaultMonths = +f.s_months.value; s.strike = f.s_strike.checked; sh._saved = true; noteChange('updating settings'); closeAll(); render(); toast('Settings saved'); });
    sh.querySelector('#viewSample')?.addEventListener('click', () => { closeAll(); startDemo(); });
    sh.querySelector('#expJ').addEventListener('click', exportJSON);
    sh.querySelector('#expC').addEventListener('click', exportCSV);
    bindSyncSection(sh);
    sh.querySelector('#impJ').addEventListener('click', () => sh.querySelector('#impFile').click());
    sh.querySelector('#impFile').addEventListener('change', e => { const file = e.target.files[0]; if (file) importFile(file, sh.querySelector('#impJ')); e.target.value = ''; });
    sh.querySelector('#eraseBtn')?.addEventListener('click', e => confirmDialog({ title:'Are you sure?', trigger:e.currentTarget, text:'This deletes all accounts and payments on this device. This can’t be undone.' + (SYNC && SYNC.user ? ' Your cloud copy stays unless you also erase it.' : ''), ok:'Erase everything',
      extra:`${SYNC && SYNC.user ? '<label class="switch" style="padding-top:0"><span>Also erase the cloud copy</span><input type="checkbox" id="eraseCloud"></label>' : ''}<p class="small" style="margin:0 0 12px">Want a copy first? <button type="button" class="link-btn" id="expFirst">Export a backup</button></p>`,
      onOk: async () => {
        if (DEMO) { exitDemo(); return; }
        const both = !!document.getElementById('eraseCloud')?.checked;
        let cloudCleared = false;
        if (SYNC && SYNC.user && both) {
          try { await SYNC.clearCloud(); cloudCleared = true; } catch { cloudCleared = false; }
          if (!cloudCleared) { closeTop(); toast('Couldn’t erase the cloud copy. Your accounts are still on this device.'); return; }
          localStorage.removeItem(KEY); S = blank();
        } else if (SYNC && SYNC.user) {
          try { await SYNC.signOut({ flush: false }); } catch {}
          localStorage.removeItem(KEY); S = blank();
        } else { localStorage.removeItem(KEY); S = blank(); }
        localStorage.removeItem(UIKEY); UI = {open:{}, expanded:{}};
        simExtra = 0; whatIfAmt = 100; planShowAll = false; planFilter = ''; tab = 'home'; closeAll(); render();
        toast(both ? 'Erased on this device and in the cloud' : 'Erased on this device. The cloud copy was left as it is.');
      } }));
  }});
  // revert unsaved theme preview if closed without saving
  const entry = stack[stack.length-1]; const sheet = entry.el.querySelector('.sheet');
  const orig = entry.el.remove.bind(entry.el); entry.el.remove = () => { if (!sheet._saved) sheet._revert?.(); orig(); };
}

render();
initSync();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
