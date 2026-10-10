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
const fmtMonth = d => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const fmtMonShort = d => `${MON[d.getMonth()]} ${d.getFullYear()}`;
const debtFree = d => d ? `Debt free by ${fmtMonth(d)}` : 'Debt free date unknown';
const ordinal = n => n + (n%100>=11&&n%100<=13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[n%10] || 'th'));
const LOGOS = [
  [/navy\s*federal|\bnfcu\b/i,'navy-federal.png','Navy Federal'],
  [/\baffirm\b/i,'affirm.png','Affirm'],
  [/\bklarna\b/i,'klarna.svg','Klarna'],
  [/after\s*pay/i,'afterpay.svg','Afterpay'],
  [/capital\s*one/i,'capital-one.png','Capital One'],
  [/mission\s*lane/i,'mission-lane.png','Mission Lane'],
  [/synchrony/i,'synchrony.png','Synchrony'],
  [/apple\s*card/i,'apple-card.svg','Apple Card'],
  [/\bchase\b/i,'chase.svg','Chase'],
  [/\bciti(bank)?\b/i,'citi.svg','Citi'],
  [/\bdiscover\b/i,'discover.svg','Discover'],
  [/wells\s*fargo/i,'wells-fargo.svg','Wells Fargo'],
  [/bank\s*of\s*america|\bbofa\b/i,'bank-of-america.svg','Bank of America'],
  [/best\s*buy/i,'best-buy.svg','Best Buy'],
  [/\btarget\b/i,'target.svg','Target'],
  [/\bamex\b|american\s*express/i,'american-express.svg','American Express'],
];
const logoFor = name => { for (const [re,f] of LOGOS) if (re.test(name||'')) return f; return null; };
function avatar(a, size=44, font=15){
  const f = logoFor(a.name);
  if (f) return `<span class="avatar logo-tile" style="width:${size}px;height:${size}px"><img src="logos/${f}" alt="" width="${Math.round(size*.7)}" height="${Math.round(size*.7)}" loading="lazy" onerror="this.parentNode.classList.remove('logo-tile');this.parentNode.style.background='${TYPE_HEX[a.type]}';this.replaceWith(document.createTextNode('${initials(a.name).replace(/'/g,'')}'))"></span>`;
  return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${font}px;background:${TYPE_HEX[a.type]}">${esc(initials(a.name))}</span>`;
}
const initials = n => n.trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase() || '?';
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
const blank = () => ({ v:1, accounts:[], payments:[], settings:{ budget:null, defaultMonths:6, theme:'light', followSystem:false }, flags:{ backupTip:false }, lastFree:null, banner:null });
let S = load();
function load(){
  try { const raw = localStorage.getItem(KEY); if (!raw) return blank(); const d = JSON.parse(raw); return normalize(d) || blank(); } catch { return blank(); }
}
function normalize(d){
  if (!d || typeof d !== 'object' || !Array.isArray(d.accounts) || !Array.isArray(d.payments)) return null;
  const b = blank();
  return { ...b, ...d, settings:{ ...b.settings, ...(d.settings||{}) }, flags:{ ...b.flags, ...(d.flags||{}) } };
}
const UIKEY = 'debt-killer:ui';
let UI = (() => { try { return JSON.parse(localStorage.getItem(UIKEY)) || {}; } catch { return {}; } })();
UI.open = UI.open || {}; UI.expanded = UI.expanded || {};
function saveUI(){ try { localStorage.setItem(UIKEY, JSON.stringify(UI)); } catch {} }
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }

// ---------- payoff engine ----------
function tierMonths(a){ return a.tier ? TIERS[a.tier].months : null; }
function basePayments(accts, defMonths){
  const open = accts.filter(a => a.balance > 0.004).sort((x,y)=>x.balance-y.balance);
  const base = {};
  open.forEach((a, i) => {
    const tm = tierMonths(a);
    let p = a.min;
    if (tm) p = Math.max(a.min, Math.ceil(a.balance / tm));
    else if (i === 0) p = Math.max(a.min, Math.ceil(a.balance / defMonths));
    base[a.id] = Math.min(p, a.balance + a.balance*(a.apr||0)/1200);
  });
  return { open, base };
}
function simulate(accts, { extra = 0, extraFor = null, budget = S.settings.budget, defMonths = S.settings.defaultMonths } = {}){
  const list = accts.map(a => ({ ...a, bal:a.balance }));
  const { open, base } = basePayments(list, defMonths);
  let pool = Object.values(base).reduce((s,v)=>s+v,0);
  if (budget && budget > pool) pool = budget;
  pool += Math.max(0, +extra||0);
  if (extraFor && extraFor.amount > 0 && base[extraFor.id] !== undefined){ base[extraFor.id] += extraFor.amount; pool += extraFor.amount; }
  const start = new Date(); const startM = new Date(start.getFullYear(), start.getMonth(), 1);
  const res = { months:[], payoff:{}, interest:{}, firstPay:{}, totalInterest:0, freeDate:null, stuck:false };
  list.forEach(a => { res.interest[a.id] = 0; });
  let active = open.map(a => list.find(x=>x.id===a.id));
  const totals = [{ date:startM, total:active.reduce((s,a)=>s+a.bal,0) }];
  for (let m = 0; m < 600 && active.length; m++){
    const date = addMonths(startM, m);
    active.forEach(a => { const i = a.bal * (a.apr||0)/1200; a.bal += i; res.interest[a.id] += i; res.totalInterest += i; });
    let left = pool;
    const order = active.slice().sort((x,y)=>x.bal-y.bal);
    const focus = order[0];
    const pays = {};
    order.slice(1).forEach(a => { const p = Math.min(a.bal, base[a.id] ?? a.min, left); pays[a.id] = p; left -= p; });
    // remaining pool goes smallest-first (snowball)
    for (const a of order){ const room = a.bal - (pays[a.id]||0); const p = Math.min(room, left); pays[a.id] = (pays[a.id]||0) + p; left -= p; if (left <= 0.0001) break; }
    order.forEach(a => { a.bal = r2(a.bal - (pays[a.id]||0)); if (m===0) res.firstPay[a.id] = r2(pays[a.id]||0); });
    res.months.push({ date, pays });
    active.forEach(a => { if (a.bal <= 0.005 && !res.payoff[a.id]) res.payoff[a.id] = date; });
    active = active.filter(a => a.bal > 0.005);
    totals.push({ date:addMonths(startM, m+1), total:active.reduce((s,a)=>s+a.bal,0) });
    if (m === 0 && focus && pays[focus.id] === undefined) break;
  }
  if (active.length){ res.stuck = true; } else if (res.months.length) res.freeDate = res.months[res.months.length-1].date;
  if (!open.length) res.freeDate = null;
  res.totals = totals;
  return res;
}

// ---------- derived ----------
const openAccounts = () => S.accounts.filter(a=>a.balance>0.004).sort((a,b)=>a.balance-b.balance);
const orderAll = () => [...openAccounts(), ...S.accounts.filter(a=>a.balance<=0.004)];
const totals = () => { const left = S.accounts.reduce((s,a)=>s+a.balance,0); const total = S.accounts.reduce((s,a)=>s+Math.max(a.start,a.balance),0); return { left, total, paid: Math.max(0,total-left) }; };
function paidThisMonth(){ const k = monthKey(new Date()); return S.payments.filter(p=>monthKey(new Date(p.date+'T12:00'))===k).reduce((s,p)=>s+p.amount,0); }
function paceLabel(a){ return a.tier ? TIERS[a.tier].label + ' pace' : 'Snowball pace'; }

function noteChange(action){
  const sim = simulate(S.accounts);
  const now = sim.freeDate ? sim.freeDate.toISOString() : null;
  if (S.lastFree && now && S.lastFree !== now){
    const diff = monthsBetween(new Date(now), new Date(S.lastFree));
    if (diff !== 0) S.banner = { text: `${plural(Math.abs(diff),'month')} ${diff>0?'sooner':'later'} after ${action}.`, good: diff>0 };
  }
  S.lastFree = now; save();
}

// ---------- routing ----------
let tab = 'home';
let simExtra = 0;
function go(t){ tab = t; render(); $('#main').focus({preventScroll:true}); window.scrollTo(0,0); }
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
$('#settingsBtn').addEventListener('click', e => openSettings(e.currentTarget));
$('#fab').addEventListener('click', e => openAccountForm(null, e.currentTarget));
$('#headerAdd').addEventListener('click', e => openAccountForm(null, e.currentTarget));

function applyTheme(){
  let t = S.settings.theme;
  if (S.settings.followSystem) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

function render(){
  applyTheme();
  document.querySelectorAll('[data-tab]').forEach(b => b.dataset.tab === tab ? b.setAttribute('aria-current','page') : b.removeAttribute('aria-current'));
  document.querySelector('.tabbar').style.setProperty('--ti', ['home','accounts','calendar','progress'].indexOf(tab));
  const m = $('#main');
  const empty = !S.accounts.length;
  m.innerHTML = `<div class="view">${empty ? viewEmpty() : tab==='accounts' ? viewAccounts() : tab==='calendar' ? viewCalendar() : tab==='progress' ? viewProgress() : viewHome()}</div>`;
  updateFab();
  bindView();
}
function updateFab(){ $('#fab').hidden = true; $('#headerAdd').hidden = !S.accounts.length; }

const icon = {
  info:'<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  err:'<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 6.5v7M12 16.5v.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
};

function viewEmpty(){
  return `<section class="welcome">
    <picture class="anubis-hero" aria-hidden="true">
      <source type="image/webp" srcset="logos/anubis/anubis-800.webp 800w, logos/anubis/anubis-1400.webp 1400w, logos/anubis/anubis-2048.webp 2048w" sizes="(min-width:900px) 620px, (min-width:700px) 540px, 92vw">
      <img src="logos/anubis/anubis-800.jpg" alt="" width="800" height="677" decoding="async">
    </picture>
    <div class="empty card glass">
      <h1>Start the battle</h1>
      <p>Add each debt you owe. Debt Killer lines them up smallest first and tells you what to pay next.</p>
      <button class="btn primary" data-act="add">Add your first account</button>
      <p class="small" style="margin:18px 0 0">${STORAGE_MSG}</p>
    </div></section>`;
}

function gauge(pct, size=120, dark=true){
  const r = size/2 - 10, c = Math.PI * r; // half-circle gauge
  const p = Math.max(0, Math.min(1, pct));
  return `<svg class="gauge" width="${size}" height="${size/2+18}" viewBox="0 0 ${size} ${size/2+18}" role="img" aria-label="${Math.round(p*100)} percent paid">
    <path d="M10 ${size/2+6} A ${r} ${r} 0 0 1 ${size-10} ${size/2+6}" fill="none" stroke="${dark?'rgba(255,255,255,.14)':'var(--fill2)'}" stroke-width="12" stroke-linecap="round"/>
    <path d="M10 ${size/2+6} A ${r} ${r} 0 0 1 ${size-10} ${size/2+6}" fill="none" style="stroke:var(--amber);filter:drop-shadow(0 0 6px var(--amber-glow))" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c*p} ${c}"/>
    <text x="${size/2}" y="${size/2+2}" text-anchor="middle" font-size="22" font-weight="700" fill="${dark?'#f4f1ea':'currentColor'}">${Math.round(p*100)}%</text>
    <text x="${size/2}" y="${size/2+16}" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="1.2" fill="${dark?'#c9c4b8':'currentColor'}">PAID</text></svg>`;
}

function homeFeedHTML(){
  const t = totals(); const sim = simulate(S.accounts); const open = openAccounts();
  const next = open[0];
  const toPay = Object.values(sim.firstPay).reduce((s,v)=>s+v,0);
  const paidM = paidThisMonth();
  const pct = t.total ? t.paid/t.total : 0;
  return `
  <div class="grid two feed-grid">
    <section class="card hero span-all" aria-label="Total debt">
      <div class="row between" style="flex-wrap:wrap;gap:10px"><span class="micro">Total debt</span>
        ${sim.freeDate ? `<button class="badge" data-act="toProgress">${debtFree(sim.freeDate)} ›</button>` : ''}</div>
      <div class="hero-grid">
        <div style="flex:1;min-width:220px"><div class="big">${money(t.left)} left to pay</div>
          <div class="bar" role="progressbar" aria-label="Debt paid" aria-valuenow="${Math.round(pct*100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct*100}%"></i></div>
          <div class="row between" style="margin-top:8px;font-size:14px;color:#c9c4b8"><span>${money(t.paid)} paid</span><span>${money(t.total)} total</span></div>
          ${sim.totalInterest>0.5?`<div style="margin-top:8px;font-size:13px;color:#c9c4b8">About ${money(sim.totalInterest)} in projected interest</div>`:''}
        </div>
        <div>${gauge(pct, 140)}</div>
      </div>
    </section>
    ${next ? `<section class="card glass">
      <div class="micro">Next · ${esc(next.name)}</div>
      <div class="mid">${money2(next.balance)} left to pay</div>
      <div class="bar"><i style="width:${next.start? (1-next.balance/next.start)*100:0}%"></i></div>
      <div class="row between" style="margin-top:12px"><span class="muted">${next.dueDay?dueChip(next):'No due date'}</span>
      <button class="btn primary sm" data-act="log" data-id="${next.id}">Pay ${money2(sim.firstPay[next.id]||next.min)} now</button></div>
      <button class="link-btn" data-act="extraFor" data-id="${next.id}" style="margin-top:14px">What if I pay extra?</button>
    </section>` : ''}
    <section class="card glass">
      <div class="micro">This month</div>
      <div class="mid">${money2(Math.max(0,toPay - paidM))} to pay</div>
      <div class="bar"><i style="width:${toPay? Math.min(100,paidM/toPay*100):0}%"></i></div>
      <div class="muted" style="margin-top:12px">${money2(paidM)} paid of ${money2(toPay)} planned</div>
    </section>
    <section class="card glass span-all" aria-labelledby="simT">
      <h2 class="micro" id="simT">What if you paid extra</h2>
      <p class="muted" style="margin:6px 0 10px">Try one account at a time, or everything together.</p>
      <div class="chips" role="group" aria-label="Try extra on one account" style="margin-bottom:16px">${openAccounts().map(a=>`<button class="chip try-acc" data-act="extraFor" data-id="${a.id}">${avatar(a,22,9)}<span>${esc(a.name)}</span></button>`).join('')}</div>
      <div class="micro" style="margin-top:4px">All accounts</div>
      <div class="sim-input"><span class="mid">$</span><label class="sr-only" for="simIn">Extra per month</label><input id="simIn" inputmode="decimal" placeholder="0" value="${simExtra||''}"><span class="muted">a month</span></div>
      <div class="chips" role="group" aria-label="Quick amounts">${[50,100,200,500].map(v=>`<button class="chip" data-extra="${v}" aria-pressed="${simExtra===v}">$${v}</button>`).join('')}<button class="chip" data-extra="0">Clear</button></div>
      <p id="simOut" class="muted" aria-live="polite" style="margin:14px 0 0;font-size:15px"></p>
    </section>
  </div>`;
}
let homeExplore = false, lastGlobePct = null;
function progressColor(p){
  // continuous warm->cool ramp in OKLCH: red -> orange -> yellow -> lime/mint -> green
  const K=[[0,.67,.22,28],[.1,.67,.22,28],[.35,.79,.18,62],[.6,.88,.18,96],[.82,.86,.2,128],[1,.79,.21,148]];
  p=Math.max(0,Math.min(1,p)); let i=0; while(i<K.length-2 && p>K[i+1][0]) i++;
  const [a,b]=[K[i],K[i+1]]; const f=(p-a[0])/((b[0]-a[0])||1); const L=a[1]+(b[1]-a[1])*f, C=a[2]+(b[2]-a[2])*f, H=a[3]+(b[3]-a[3])*f;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}
function globeHTML(pct, left){
  const col = progressColor(pct); const fill = 0.06 + 0.94*pct; // thin layer at 0%
  const lvl = 186 - fill*172;                                      // y of liquid surface in a 200x200 box
  const from = lastGlobePct === null ? lvl : 186 - (0.06 + 0.94*lastGlobePct)*172;
  const wave = (amp,ph) => { let d=`M-200 ${0}`; for (let x=-200;x<=400;x+=10) d += ` L${x} ${(Math.sin((x+ph)/24)*amp).toFixed(2)}`; return d + ' L400 220 L-200 220 Z'; };
  const label = `Total debt left ${money(left)}, ${Math.round(pct*100)}% paid`;
  return `<div class="globe" role="img" aria-label="${esc(label)}" style="--pc:${col}">
   <svg viewBox="0 0 200 200" aria-hidden="true">
    <defs>
      <clipPath id="gClip"><circle cx="100" cy="100" r="86"/></clipPath>
      <radialGradient id="gGlass" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".04"/></radialGradient>
      <linearGradient id="gLiq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--pc);stop-opacity:.95"/><stop offset="1" style="stop-color:var(--pc);stop-opacity:.7"/></linearGradient>
      <radialGradient id="gSpec" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <circle cx="100" cy="100" r="86" class="g-body"/>
    <g clip-path="url(#gClip)">
      <g class="g-liquid" style="transform:translateY(${from}px)" data-to="${lvl}">
        <path class="g-wave w2" d="${wave(3.2,40)}" style="fill:var(--pc);opacity:.45"/>
        <path class="g-wave w1" d="${wave(4,0)}" fill="url(#gLiq)"/>
        <path class="g-meniscus" d="${wave(4,0).split(' L400 220')[0]}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/>
        ${[30,70,110,150].map((x,i)=>`<circle class="g-bubble" cx="${x}" cy="${40+i*12}" r="${1.6+i%2}" style="--bd:${i*1.3}s"/>`).join('')}
        <ellipse cx="70" cy="30" rx="30" ry="5" fill="#fff" opacity=".18"/>
      </g>
    </g>
    <circle cx="100" cy="100" r="86" fill="url(#gGlass)"/>
    <ellipse cx="72" cy="52" rx="28" ry="16" fill="url(#gSpec)" opacity=".75" transform="rotate(-30 72 52)"/>
    <circle cx="100" cy="100" r="86" fill="none" class="g-rim"/>
   </svg>
   <div class="globe-text"><span class="globe-amt">${money(left)}</span><span class="globe-sub">left to pay</span></div>
  </div>`;
}
function viewHome(){
  const t = totals(); const sim = simulate(S.accounts); const open = openAccounts();
  const pct = t.total ? t.paid/t.total : 0;
  const html = `<h1 class="large-title">Home</h1>
  <section class="globe-hero" aria-label="Debt progress">
    ${globeHTML(pct, t.left)}
    <p class="globe-free">${sim.freeDate ? `<button class="badge" data-act="toProgress">${debtFree(sim.freeDate)} ›</button>` : open.length ? '' : 'Every account is paid off. Nice work.'}</p>
    <p class="globe-pct"><b>${Math.round(pct*100)}% paid</b> · ${money(t.paid)} of ${money(t.total)} · ${plural(open.length,'account')} to go</p>
    <button class="btn explore glass" data-act="explore" aria-expanded="${homeExplore}" aria-controls="homeFeed">${homeExplore?'Show less ↑':'Explore more ↓'}</button>
  </section>
  <div class="grid home-banners">    ${S.banner ? `<div class="banner span-all ${S.banner.good?'good':''}" role="status"><span><b>${esc(S.banner.text.split(' after ')[0])}</b> after ${esc(S.banner.text.split(' after ').slice(1).join(' after '))}</span><button aria-label="Dismiss" data-act="dismissBanner">✕</button></div>` : ''}
    ${!S.flags.backupTip ? `<div class="banner span-all" role="note"><span>${icon.info}</span><span>Tip: ${STORAGE_MSG}</span><button class="btn sm" data-act="export" style="margin-left:auto;width:auto">Export</button><button aria-label="Dismiss tip" data-act="dismissTip" style="margin-left:0">✕</button></div>`:''}
</div>
  <div id="homeFeed" class="feed" ${homeExplore?'':'hidden'}>${homeFeedHTML()}</div>`;
  lastGlobePct = pct;
  return html;
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
  const label = `${a.name}. ${done?'Paid off':money2(a.balance)+' left'}. ${done?'':'Snowball number '+rank+'. '}${a.tier?TIERS[a.tier].label+' pace':'Snowball pace'}. ${d?(d.full||d.text):'No due date'}.`;
  return `<button class="acct tile glass ${a.tier&&!done?'t-'+a.tier:''} ${done?'t-done':''}" data-act="detail" data-id="${a.id}" aria-label="${esc(label)}">
    <div class="tile-top">${avatar(a,36,13)}<span style="flex:1"></span>${miniRing(pct, done?'var(--green-bar)':CAT[a.type].strong)}${done?'<span class="rank rank-done" aria-hidden="true">✓</span>':`<span class="rank" aria-hidden="true">#${rank}</span>`}</div>
    <div class="name">${esc(a.name)}</div>
    <div class="tile-bal">${done?money(a.start):money2(a.balance)}</div>
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
  <div class="section-head"><h2>Snowball order</h2><span class="muted">${open.length?plural(open.length,'account')+' to go':'All done'}</span></div>
  <p class="tip">${icon.info}<span>Why smallest first? Each paid-off debt is a quick win, and its payment rolls into the next one. The #1, #2… badges show the order.</span></p>
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
function viewCalendar(){
  const y = calMonth.getFullYear(), m = calMonth.getMonth(); const t = midnight(new Date());
  const map = duesInMonth(y, m); const first = new Date(y, m, 1).getDay(); const days = dim(y, m);
  const sim = simulate(S.accounts);
  let cells = '';
  for (let i=0;i<first;i++) cells += '<div class="cal-cell blank" aria-hidden="true"></div>';
  for (let d=1; d<=days; d++){
    const date = new Date(y, m, d); const list = map[d] || []; const isToday = +date === +t;
    const urg = list.map(a=>dueInfo(a)).filter(x=>x && +x.date===+date || (x && x.level==='overdue' && +x.date===+date));
    const lvl = urg.some(x=>x.level==='overdue') ? 'overdue' : urg.some(x=>x.level==='today') ? 'today' : '';
    const label = `${MONTHS[m]} ${d}${isToday?', today':''}${list.length?`, ${plural(list.length,'payment')} due: ${list.map(a=>a.name).join(', ')}`:''}${lvl==='overdue'?', overdue':lvl==='today'?', due today':''}`;
    const inner = `<span class="cal-num">${d}</span>${lvl?`<span class="cal-flag flag-${lvl}" aria-hidden="true">${lvl==='overdue'?'!':'•'}</span>`:''}
      <span class="cal-dots" aria-hidden="true">${list.slice(0,4).map(a=>`<i style="background:${CAT[a.type].strong};--c:${CAT[a.type].strong}"></i>`).join('')}</span>
      <span class="cal-pills" aria-hidden="true">${list.slice(0,3).map(a=>`<span class="cal-pill" style="--cat:${CAT[a.type].strong}">${avatar(a,16,8)}<span>${esc(a.name)}</span></span>`).join('')}${list.length>3?`<span class="small">+${list.length-3} more</span>`:''}</span>`;
    cells += list.length ? `<button class="cal-cell has ${isToday?'today':''} ${lvl?'u-'+lvl:''}" data-act="calDay" data-day="${d}" aria-label="${esc(label)}">${inner}</button>` : `<div class="cal-cell ${isToday?'today':''}" aria-label="${esc(label)}" role="gridcell">${inner}</div>`;
  }
  // upcoming 7 days (plus overdue)
  const up = openAccounts().map(a=>({a,d:dueInfo(a)})).filter(x=>x.d && (x.d.level!=='later')).sort((x,y)=>URGENCY_ORDER[x.d.level]-URGENCY_ORDER[y.d.level]||x.d.date-y.d.date);
  const cats = [...new Set(openAccounts().filter(a=>a.dueDay).map(a=>a.type))];
  return `<h1 class="large-title">Calendar</h1><p class="subtitle">Due dates for your open accounts</p>
  <section class="card glass cal">
    <div class="cal-head"><h2 class="mid" style="margin:0" aria-live="polite">${MONTHS[m]} ${y}</h2>
      <div class="row" style="gap:6px"><button class="icon-btn" data-act="calPrev" aria-label="Previous month">‹</button><button class="btn sm" data-act="calToday">Today</button><button class="icon-btn" data-act="calNext" aria-label="Next month">›</button></div></div>
    <div class="cal-grid cal-dow" aria-hidden="true">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div>${x}</div>`).join('')}</div>
    <div class="cal-grid" role="grid" aria-label="${MONTHS[m]} ${y}">${cells}</div>
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
    render(); document.querySelector(`[data-act=${a}]`)?.focus(); }));
  m.querySelectorAll('[data-act=calDay]').forEach(b => b.addEventListener('click', () => openDay(+b.dataset.day, b)));
}

// ---------- Per-account what-if (preview only) ----------
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
function anubisStrike(amount){
  if (S.settings.strike === false) return;
  document.querySelector('.strike')?.remove();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div'); el.className = 'strike glass' + (reduced ? ' still' : ''); el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
  el.innerHTML = `<div class="strike-stage" aria-hidden="true"><img src="logos/anubis/anubis-800.webp" alt="">
    <svg class="strike-fx" viewBox="0 0 200 140"><g class="s-card"><g class="s-l"><rect x="58" y="70" width="44" height="40" rx="6"/><rect x="62" y="80" width="30" height="6" rx="2" class="s-strip"/></g><g class="s-r"><rect x="98" y="70" width="44" height="40" rx="6"/><rect x="102" y="96" width="24" height="5" rx="2" class="s-strip"/></g></g>
    <path class="s-slash" d="M30 128 L172 34"/>${[0,1,2,3,4,5].map(i=>`<circle class="s-spark" cx="100" cy="88" r="2.2" style="--sx:${[-40,30,-22,44,-8,16][i]}px;--sy:${[-30,-36,22,10,-44,30][i]}px"/>`).join('')}</svg></div>
    <div class="strike-txt"><b>${money2(amount)}</b> struck down</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), reduced ? 1400 : 1150);
  setTimeout(() => el.remove(), reduced ? 1700 : 1450);
}

// ---------- Payoff celebration ----------
function celebrate(acc, prevPlan){
  if (acc.celebrated) return; acc.celebrated = true; save();
  const next = openAccounts()[0];
  const roll = prevPlan || acc.min;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { if (!reduced && navigator.vibrate) navigator.vibrate([30,40,60]); } catch {}
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
  // reconstruct history: today's balance + payments made after each date
  const pays = S.payments.filter(p=>accts.some(a=>a.id===p.accountId)).sort((a,b)=>a.date.localeCompare(b.date));
  const now = accts.reduce((s,a)=>s+a.balance,0);
  const pts = []; let tot = now + pays.reduce((s,p)=>s+p.amount,0);
  const created = accts.map(a=>a.created||todayISO()).sort()[0] || todayISO();
  const t0 = pays.length && pays[0].date < created ? pays[0].date : created;
  pts.push({ date:new Date(t0+'T12:00'), total:tot });
  pays.forEach(p => { tot -= p.amount; pts.push({ date:new Date(p.date+'T12:00'), total:Math.max(0,tot) }); });
  if (!pays.length) return [];
  pts.push({ date:new Date(), total:now });
  return pts;
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
  <div class="legend"><span><i style="background:var(--green-bar)"></i>Actual paid down</span><span><i style="background:var(--blue)"></i>Projected plan (dashed)</span></div>
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

function viewProgress(){
  const t = totals(); const sim = simulate(S.accounts); const knocked = S.accounts.filter(a=>a.balance<=0.004).length;
  const single = S.accounts.length === 1;
  const noPay = !S.payments.length;
  const head = `<h1 class="large-title">Progress</h1><p class="subtitle" style="font-size:17px;font-weight:600;color:var(--text)">${sim.freeDate?debtFree(sim.freeDate):openAccounts().length?'Add payments to see a debt-free date':'You are debt free!'}</p>
  <div class="grid three">
    <div class="card glass"><div class="micro">Paid off</div><div class="mid">${money(t.paid)}</div></div>
    <div class="card glass"><div class="micro">Still owed</div><div class="mid">${money(t.left)}</div></div>
    <div class="card glass"><div class="micro">Activity</div><div class="mid" style="font-size:18px">${plural(S.payments.length,'payment')} · ${knocked} knocked out</div></div>
  </div>
  <div class="toolbar" style="margin-top:14px"><button class="btn sm" data-act="summary">Share monthly summary</button></div>`;
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
        ${months.map((m,i)=>{ const bal = sim.totals[i+1]?.total ?? 0; const end = i===sim.months.length-1; return `<li class="${end?'end':''}"><b>${fmtMonth(m.date)}</b> · pay ${money2(m.pays[a.id]||0)}<br><span class="small">${end?'Paid off 🎉':money2(bal)+' left after'}</span></li>`; }).join('')}
        ${sim.months.length>24?`<li><span class="small">…${plural(sim.months.length-24,'more month')}</span></li>`:''}</ol></section>
      ${lineCard}
      <p class="muted span-all" style="margin:4px">Comparisons by account and type appear once you add more accounts.</p></div>`;
  }
  return head + `<div class="grid two" style="margin-top:14px">${lineCard}
    <section class="card glass"><h2 class="micro">Payoff order</h2><ol class="list" style="margin-top:8px">${orderAll().map((a,i)=>`<li><span class="avatar" style="width:34px;height:34px;font-size:13px;background:${TYPE_HEX[a.type]}">${i+1}</span><span style="flex:1"><b>${esc(a.name)}</b><br><span class="small">${a.balance<=0.004?'Knocked out':'Done '+(sim.payoff[a.id]?fmtMonth(sim.payoff[a.id]):'—')}${a.apr&&sim.interest[a.id]>0.5?` · ${money(sim.interest[a.id])} interest`:''}</span></span><b>${money(a.balance)}</b></li>`).join('')}</ol></section>
    <section class="card glass"><h2 class="micro">Paid off by account</h2><div style="margin-top:12px">${barChart(orderAll())}</div></section>
    <section class="card glass span-all"><h2 class="micro">Where the debt sits</h2><div style="margin-top:12px">${donut(S.accounts)}</div></section></div>`;
}

function bindView(){
  const m = $('#main');
  bindExtra(m);
  const gl = m.querySelector('.g-liquid'); if (gl) requestAnimationFrame(() => requestAnimationFrame(() => { gl.style.transform = `translateY(${gl.dataset.to}px)`; }));
  const feed = m.querySelector('#homeFeed'); if (feed && !feed.hidden) observeReveal(feed);
  m.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', e => act(b.dataset.act, b, e)));
  m.querySelectorAll('[data-extra]').forEach(b => b.addEventListener('click', () => { simExtra = +b.dataset.extra; $('#simIn').value = simExtra||''; refreshSim(); }));
  const si = $('#simIn'); if (si){ si.addEventListener('input', () => { simExtra = Math.max(0, parseFloat(si.value.replace(/[^0-9.]/g,''))||0); refreshSim(); }); refreshSim(); }
  m.querySelectorAll('.chart').forEach(c => {
    const tip = c.querySelector('.tip-box'); if (!tip) return;
    const show = e => { const el = e.target.closest('[data-tip]'); if (!el){ tip.style.opacity=0; return; } tip.textContent = el.dataset.tip; const r = c.getBoundingClientRect(); const pt = e.touches?e.touches[0]:e; tip.style.left = Math.min(r.width-160, Math.max(0, pt.clientX - r.left + 10))+'px'; tip.style.top = (pt.clientY - r.top - 36)+'px'; tip.style.opacity = 1; };
    c.addEventListener('pointermove', show); c.addEventListener('pointerdown', show); c.addEventListener('pointerleave', () => tip.style.opacity = 0);
  });
}
let revealObs = null;
function observeReveal(root){
  const items = root.querySelectorAll('.feed-grid > *');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches){ items.forEach(i=>i.classList.add('in')); return; }
  revealObs?.disconnect(); revealObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ e.target.classList.add('in'); revealObs.unobserve(e.target); } }), { rootMargin:'0px 0px -8% 0px' });
  items.forEach(i => { i.classList.add('reveal'); revealObs.observe(i); });
}
function refreshSim(){ const o = $('#simOut'); if (o) o.innerHTML = simText(); document.querySelectorAll('[data-extra]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.extra===simExtra && simExtra>0))); }

function act(a, el){
  const id = el.dataset.id; const acc = S.accounts.find(x=>x.id===id);
  switch(a){
    case 'add': return openAccountForm(null, el);
    case 'toProgress': return go('progress');
    case 'dismissBanner': S.banner = null; save(); return render();
    case 'dismissTip': S.flags.backupTip = true; save(); return render();
    case 'export': return exportJSON();
    case 'log': return openLog(acc, el);
    case 'detail': return openDetail(acc, el);
    case 'check': return openCheck(el);
    case 'calAll': return openCalendar(el);
    case 'summary': return openSummary(el);
    case 'extraFor': return openExtraFor(acc, el);
    case 'explore': { homeExplore = !homeExplore; const f = $('#homeFeed'); f.hidden = !homeExplore; el.setAttribute('aria-expanded', String(homeExplore)); el.textContent = homeExplore ? 'Show less ↑' : 'Explore more ↓';
      const sm = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      if (homeExplore){ observeReveal(f); f.scrollIntoView({ behavior: sm, block: 'start' }); } else window.scrollTo({ top: 0, behavior: sm }); return; }
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

function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400); }

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

function openAccountForm(acc, trigger){
  const edit = !!acc;
  const body = `<form novalidate id="acctForm">
    ${field({id:'f_name',label:'Name',value:acc?.name||'',placeholder:'Affirm, Best Buy, Platinum One',attrs:'autocomplete="off"'})}
    <div class="field"><label for="f_type">Type</label><select id="f_type" aria-describedby="f_type-h">${TYPES.map(t=>`<option ${acc?.type===t?'selected':''}>${t}</option>`).join('')}</select><div class="help" id="f_type-h" ${edit?'hidden':''}>Picked automatically from the name.</div></div>
    <div class="two-col">${field({id:'f_start',label:'Starting balance',value:acc?.start??'',placeholder:'$0.00',attrs:'inputmode="decimal"'})}
    ${field({id:'f_bal',label:'Current balance',value:edit?acc.balance:'',placeholder:'Same as start',attrs:'inputmode="decimal"'})}</div>
    <div class="two-col">${field({id:'f_min',label:'Minimum payment',value:acc?.min??'',placeholder:'$0.00',attrs:'inputmode="decimal"'})}
    ${field({id:'f_apr',label:'Interest rate (APR) — optional',value:acc?.apr||'',placeholder:'e.g. 24.99',help:'Add it for a more accurate payoff date.',attrs:'inputmode="decimal"'})}</div>
    <div class="field"><label for="f_due">Due day</label><select id="f_due" aria-describedby="f_due-h"><option value="">No due date</option>${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${acc?.dueDay===i+1?'selected':''}>${ordinal(i+1)}</option>`).join('')}</select><div class="help" id="f_due-h">Used to flag what is due soon and to build a reminder.</div></div>
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
      const first = !S.accounts.length;
      if (edit){ Object.assign(acc, data); noteChange('editing '+name); }
      else { S.accounts.push({ id:uid(), tier:null, created:todayISO(), ...data }); noteChange('adding '+name); }
      if (first) S.flags.backupTip = false;
      save(); closeAll(); render(); toast(edit ? 'Changes saved' : 'Account added');
    });
  }});
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
      <div class="row" style="margin-bottom:14px">${avatar(a,56,18)}<div><span class="pill type" style="--tc:${TYPE_COLORS[a.type]}">${esc(a.type)}</span> <span class="pill">${a.balance<=0.004?'Knocked out':paceLabel(a)}</span></div></div>
      <div class="stats">
        <div class="stat"><b>${money2(a.balance)}</b><span>Left to pay</span></div><div class="stat"><b>${money2(paid)}</b><span>Paid so far</span></div>
        <div class="stat"><b>${money2(a.min)}</b><span>Minimum</span></div><div class="stat"><b>${sim.payoff[a.id]?fmtMonth(sim.payoff[a.id]):a.balance<=0.004?'Paid off':'—'}</b><span>Expected payoff</span></div>
        <div class="stat"><b>${a.dueDay?ordinal(a.dueDay):'—'}</b><span>Due each month</span></div><div class="stat"><b>${a.dueDay?nextDue(a.dueDay).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—'}</b><span>Next due</span> ${dueChip(a)}</div>
        <div class="stat" style="grid-column:1/-1"><b>${a.apr?`${money2(sim.interest[a.id]||0)} at ${a.apr}% APR`:'No interest rate entered'}</b><span>Projected interest</span></div>
      </div>
      <h3 class="micro" style="margin:18px 0 8px">Payoff pace</h3>
      <div class="segmented" role="radiogroup" aria-label="Payoff pace">${opts}</div>
      <p class="muted" style="margin:10px 0 0">${a.tier?`Aims to clear it in about ${plural(TIERS[a.tier].months,'month')}: ${money2(Math.max(a.min,Math.ceil(a.balance/TIERS[a.tier].months)))} a month, plus anything rolled over.`:'No pace set. It pays the minimum and waits its turn in the snowball. Pick a pace to give it a deadline.'}
      ${a.tier?' <button class="link-btn" id="clearTier">Back to snowball pace</button>':''}</p>
      <div class="actions">${a.balance>0.004?'<button class="btn primary block" id="dLog">Log a payment</button>':''}<button class="btn block" id="dEdit">Edit account</button>${a.balance>0.004?'<button class="btn block" id="dExtra">What if I pay extra?</button>':''}
      ${a.dueDay?`<a class="btn block" href="${calUrl(a)}" target="_blank" rel="noopener">Add monthly reminder to Google Calendar</a>`:'<p class="small" style="margin:0;text-align:center">Set a due day to add a calendar reminder.</p>'}
      <button class="btn block" data-close2>Close</button></div>`;
    sh.querySelector('h2').textContent = a.name;
    sh.querySelectorAll('[data-tier]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.tier; a.tier = a.tier===k?null:k; noteChange('changing the pace on '+a.name); render(); draw(sh); sh.querySelector(`[data-tier="${k}"]`).focus(); }));
    sh.querySelector('#clearTier')?.addEventListener('click', () => { a.tier = null; noteChange('changing the pace on '+a.name); render(); draw(sh); });
    sh.querySelector('#dLog')?.addEventListener('click', e => openLog(a, e.currentTarget));
    sh.querySelector('#dEdit').addEventListener('click', e => openAccountForm(a, e.currentTarget));
    sh.querySelector('#dExtra')?.addEventListener('click', e => openExtraFor(a, e.currentTarget));
    sh.querySelector('[data-close2]').addEventListener('click', closeTop);
  };
  openDialog({ title:acc.name, body:'', trigger, onMount: draw });
}

function openLog(acc, trigger){
  const sim = simulate(S.accounts); const plan = r2(sim.firstPay[acc.id] || acc.min);
  const body = `<form novalidate><p class="muted" style="margin-top:0">${esc(acc.name)} · ${money2(acc.balance)} left</p>
    ${field({id:'p_amt',label:'Amount',value:plan.toFixed(2),attrs:'inputmode="decimal"'})}
    <div class="chips" style="margin:-4px 0 14px"><button type="button" class="chip" data-q="${acc.min}">Minimum</button><button type="button" class="chip" data-q="${plan}">Plan</button><button type="button" class="chip" data-q="${acc.balance}">Pay it off</button></div>
    ${field({id:'p_date',label:'Date',type:'date',value:todayISO()})}
    <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary">Save payment</button></div></form>`;
  openDialog({ title:'Log a payment', body, trigger, onMount: sh => {
    const f = sh.querySelector('form');
    f.querySelector('[data-close]').addEventListener('click', closeTop);
    f.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { f.p_amt.value = (+b.dataset.q).toFixed(2); f.p_amt.focus(); }));
    f.addEventListener('submit', e => {
      e.preventDefault();
      const amt = num(f.p_amt.value); const date = f.p_date.value;
      const ea = (amt===null||isNaN(amt)||amt<=0) ? 'Enter an amount more than $0.' : amt > acc.balance + 0.004 ? `That’s more than the ${money2(acc.balance)} left.` : null;
      const ed = !/^\d{4}-\d{2}-\d{2}$/.test(date) ? 'Pick a date.' : null;
      setErr(f,'p_amt',ea); setErr(f,'p_date',ed);
      if (ea){ f.p_amt.focus(); return; } if (ed){ f.p_date.focus(); return; }
      const prevPlan = plan; acc.balance = r2(Math.max(0, acc.balance - amt));
      S.payments.push({ id:uid(), accountId:acc.id, amount:r2(amt), date });
      noteChange('logging a payment');
      closeAll(); render();
      if (acc.balance <= 0.004) celebrate(acc, prevPlan); else { toast(`${money2(amt)} logged`); anubisStrike(amt); }
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
      list.forEach(a => { a.balance = r2(num(f['c_'+a.id].value)); if (a.balance > a.start) a.start = a.balance; if (a.balance <= 0.004) zeroed.push(a); });
      noteChange('checking balances'); closeAll(); render(); toast('Balances updated'); if (zeroed[0]) celebrate(zeroed[0], plans[zeroed[0].id]); });
  }});
}

function calUrl(a){
  const d = nextDue(a.dueDay); const f = x => `${x.getFullYear()}${String(x.getMonth()+1).padStart(2,'0')}${String(x.getDate()).padStart(2,'0')}`;
  const e = new Date(d); e.setDate(e.getDate()+1);
  const p = new URLSearchParams({ action:'TEMPLATE', text:`Pay ${a.name}`, dates:`${f(d)}/${f(e)}`, details:`Debt Killer reminder: pay at least ${money2(a.min)} on ${a.name}.`, recur:`RRULE:FREQ=MONTHLY;BYMONTHDAY=${a.dueDay}` });
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
  const lines = [`Debt Killer — ${fmtMonth(now)} summary`, '', `${money2(t.paid)} paid off so far, ${money2(t.left)} still owed.`, `This month: ${plural(mp.length,'payment')} totaling ${money2(mp.reduce((s,p)=>s+p.amount,0))}.`, sim.freeDate ? debtFree(sim.freeDate) + '.' : '', '', 'Payoff order:'];
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
function exportJSON(){ download(`debt-killer-backup-${todayISO()}.json`, JSON.stringify({ app:'debt-killer', exported:new Date().toISOString(), data:S }, null, 2), 'application/json'); toast('Backup exported'); S.flags.backupTip = true; save(); if (!stack.length) render(); }
function exportCSV(){
  const rows = [['date','account','type','amount']].concat(S.payments.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(p => { const a = S.accounts.find(x=>x.id===p.accountId); return [p.date, a?.name||'', a?.type||'', p.amount.toFixed(2)]; }));
  download(`debt-killer-payments-${todayISO()}.csv`, rows.map(r=>r.map(c=>/[",\n]/.test(c)?`"${String(c).replace(/"/g,'""')}"`:c).join(',')).join('\n'), 'text/csv'); toast('CSV exported');
}
function validBackup(obj){
  const d = obj && obj.app === 'debt-killer' ? obj.data : obj;
  const n = normalize(d); if (!n) return null;
  const okA = n.accounts.every(a => a && typeof a.id==='string' && typeof a.name==='string' && isFinite(a.start) && isFinite(a.balance) && isFinite(a.min) && TYPES.includes(a.type));
  const okP = n.payments.every(p => p && typeof p.accountId==='string' && isFinite(p.amount) && /^\d{4}-\d{2}-\d{2}$/.test(p.date));
  return okA && okP ? n : null;
}
function importFile(file, trigger){
  const r = new FileReader();
  r.onload = () => { let n = null; try { n = validBackup(JSON.parse(r.result)); } catch {}
    const msg = $('#impMsg');
    if (!n){ if (msg){ msg.hidden = false; msg.innerHTML = icon.err + '<span>That file isn’t a Debt Killer backup.</span>'; } return; }
    if (msg) msg.hidden = true;
    confirmDialog({ title:'Replace your data?', trigger, text:`This replaces everything on this device with the backup (${plural(n.accounts.length,'account')}, ${plural(n.payments.length,'payment')}).`, ok:'Replace', onOk: () => { S = n; save(); closeAll(); render(); toast('Backup imported'); } });
  };
  r.readAsText(file);
}

function openSettings(trigger){
  const s = S.settings;
  const body = `<form novalidate id="setForm">
   ${field({id:'s_budget',label:'Monthly budget — optional',value:s.budget??'',placeholder:'$0',help:'The total you can put toward debt each month. Anything above your planned payments goes to the smallest balance.',attrs:'inputmode="decimal"'})}
   <div class="field"><label for="s_months">Default number of payments</label><select id="s_months" aria-describedby="s_months-h">${[4,5,6,7,8].map(n=>`<option value="${n}" ${s.defaultMonths===n?'selected':''}>${plural(n,'payment')}</option>`).join('')}</select>
   <div class="help" id="s_months-h">For an account with no pace set, the one you’re focused on aims to be paid off in this many monthly payments.</div></div>
   <div class="switch"><label for="s_dark"><b>Dark mode</b></label><input type="checkbox" role="switch" id="s_dark" ${s.theme==='dark'?'checked':''} ${s.followSystem?'disabled':''}></div>
   <div class="switch"><label for="s_strike"><b>Anubis strike when you log a payment</b></label><input type="checkbox" role="switch" id="s_strike" ${s.strike!==false?'checked':''}></div>
   <div class="switch"><label for="s_sys"><b>Match system appearance</b></label><input type="checkbox" role="switch" id="s_sys" ${s.followSystem?'checked':''}></div>
   <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary">Save changes</button></div>
  </form><hr class="sep">
  <h3 class="micro">Backup</h3><p class="small" style="margin:6px 0 10px">${STORAGE_MSG}</p>
  <div class="toolbar"><button class="btn sm" id="expJ">Export backup</button><button class="btn sm" id="impJ">Import backup</button><button class="btn sm" id="expC">Export CSV of payments</button>
  <input type="file" id="impFile" accept="application/json,.json" hidden aria-label="Backup file"></div><div class="err" id="impMsg" hidden></div>
  <hr class="sep"><button class="btn block" id="eraseBtn" style="color:var(--red)">Erase everything</button>
  <hr class="sep"><div class="about"><img src="logos/anubis/anubis-512.png" alt="Anubis illustration" width="72" height="72" loading="lazy"><div><h3 class="micro" style="margin:0 0 4px">About Debt Killer</h3><p class="small" style="margin:0">A debt-snowball planner that keeps everything in this browser. ${STORAGE_MSG}</p></div></div>`;
  openDialog({ title:'Settings', body, trigger, onMount: sh => {
    const f = sh.querySelector('form'); f.querySelector('[data-close]').addEventListener('click', closeTop);
    const prevTheme = s.theme, prevSys = s.followSystem;
    f.s_dark.addEventListener('change', () => { s.theme = f.s_dark.checked?'dark':'light'; applyTheme(); });
    f.s_sys.addEventListener('change', () => { s.followSystem = f.s_sys.checked; f.s_dark.disabled = s.followSystem; applyTheme(); });
    sh._revert = () => { s.theme = prevTheme; s.followSystem = prevSys; applyTheme(); };
    f.addEventListener('submit', e => { e.preventDefault(); const b = num(f.s_budget.value); const er = (b!==null && (isNaN(b)||b<0)) ? 'Budget must be $0 or more.' : null; setErr(f,'s_budget',er); if (er){ f.s_budget.focus(); return; }
      s.budget = b || null; s.defaultMonths = +f.s_months.value; s.strike = f.s_strike.checked; sh._saved = true; noteChange('updating settings'); closeAll(); render(); toast('Settings saved'); });
    sh.querySelector('#expJ').addEventListener('click', exportJSON);
    sh.querySelector('#expC').addEventListener('click', exportCSV);
    sh.querySelector('#impJ').addEventListener('click', () => sh.querySelector('#impFile').click());
    sh.querySelector('#impFile').addEventListener('change', e => { const file = e.target.files[0]; if (file) importFile(file, sh.querySelector('#impJ')); e.target.value = ''; });
    sh.querySelector('#eraseBtn').addEventListener('click', e => confirmDialog({ title:'Are you sure?', trigger:e.currentTarget, text:'This deletes all accounts and payments on this device. This can’t be undone.', ok:'Erase everything',
      extra:'<p class="small" style="margin:0 0 12px">Want a copy first? <button type="button" class="link-btn" id="expFirst">Export a backup</button></p>',
      onOk:() => { localStorage.removeItem(KEY); localStorage.removeItem(UIKEY); UI = {open:{},expanded:{}}; S = blank(); simExtra = 0; tab = 'home'; closeAll(); render(); toast('Everything erased'); } }));
  }});
  // revert unsaved theme preview if closed without saving
  const entry = stack[stack.length-1]; const sheet = entry.el.querySelector('.sheet');
  const orig = entry.el.remove.bind(entry.el); entry.el.remove = () => { if (!sheet._saved) sheet._revert?.(); orig(); };
}

render();
})();
