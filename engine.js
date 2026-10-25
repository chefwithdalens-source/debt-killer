// Debt payoff engine. Monthly interest is balance × APR / 12, rounded to the
// nearest cent (half up), then the payment is applied:
//   next = balance + interest − payment
// Snowball aims extra dollars at the smallest balance, avalanche at the highest
// APR, and custom at a caller-supplied order. Each month the order is rebuilt.
// Every open debt is paid its planned amount (minimum, or a higher floor).
// Dollars left over — including a paid-off debt's planned amount — roll to the
// next debt in that order. A one-time windfall is added in the first month only.
// A due day does not change the interest math. It places that debt's payment,
// and its payoff date, on that day of the month (the 1st when no due day is set).
(function (root) {
  'use strict';

  const STRATEGIES = ['snowball', 'avalanche', 'custom'];

  function toCents(n) {
    const x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.round(x * 100 + (x >= 0 ? 1e-8 : -1e-8));
  }

  function roundCents(n) {
    return toCents(n) / 100;
  }

  // Monthly interest in dollars, using the same cent rounding as the schedule.
  function monthlyInterest(balance, apr) {
    return Math.round(toCents(balance) * (Number(apr) || 0) / 1200) / 100;
  }

  function byId(a, b) {
    return String(a.id).localeCompare(String(b.id));
  }

  function sortDebts(debts, strategy, customOrder) {
    const list = (debts || []).filter(d => d && (Number(d.balance) || 0) > 0.004);
    if (strategy === 'avalanche') {
      return list.slice().sort((a, b) => (Number(b.apr) || 0) - (Number(a.apr) || 0) || (Number(a.balance) || 0) - (Number(b.balance) || 0) || byId(a, b));
    }
    if (strategy === 'custom') {
      const rank = new Map((customOrder || []).map((id, i) => [id, i]));
      return list.slice().sort((a, b) => {
        const ra = rank.has(a.id) ? rank.get(a.id) : 100000;
        const rb = rank.has(b.id) ? rank.get(b.id) : 100000;
        return ra - rb || (Number(a.balance) || 0) - (Number(b.balance) || 0) || byId(a, b);
      });
    }
    return list.slice().sort((a, b) => (Number(a.balance) || 0) - (Number(b.balance) || 0) || (Number(b.apr) || 0) - (Number(a.apr) || 0) || byId(a, b));
  }

  // Planned monthly amount for each open debt, before extra and budget surplus.
  // tierMonths (on the debt) raises that debt toward a payoff in N months.
  // accelerateFocus raises whichever debt is first in `strategy` the same way.
  function plannedFloors(debts, opts) {
    opts = opts || {};
    const floors = {};
    const open = (debts || []).filter(d => d && (Number(d.balance) || 0) > 0.004);
    open.forEach(d => {
      let p = Math.max(0, Number(d.min) || 0);
      const tm = Number(d.tierMonths);
      if (tm > 0) p = Math.max(p, Math.ceil(d.balance / tm - 1e-9));
      floors[d.id] = p;
    });
    if (opts.accelerateFocus) {
      const focus = sortDebts(open, opts.strategy || 'snowball', opts.customOrder)[0];
      const n = Number(opts.focusMonths) > 0 ? Number(opts.focusMonths) : 6;
      if (focus) floors[focus.id] = Math.max(floors[focus.id] || 0, Math.ceil(focus.balance / n - 1e-9));
    }
    if (opts.extraFor && Number(opts.extraFor.amount) > 0 && floors[opts.extraFor.id] != null) {
      floors[opts.extraFor.id] = roundCents(floors[opts.extraFor.id] + Number(opts.extraFor.amount));
    }
    return floors;
  }

  function monthDate(start, i) {
    return new Date(start.getFullYear(), start.getMonth() + i, 1);
  }

  // The 1st when the debt has no due day. Day 31 in a short month clamps to the last day.
  function dueOnDate(monthDate, dueDay) {
    const y = monthDate.getFullYear(), m = monthDate.getMonth();
    if (!(dueDay >= 1)) return new Date(y, m, 1);
    const last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(dueDay, last));
  }

  function parseISODate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function daysBetween(from, to) {
    if (!(from instanceof Date) || !(to instanceof Date) || isNaN(from) || isNaN(to)) return 0;
    const utc = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((utc(to) - utc(from)) / 86400000);
  }

  // Interest between two dates. A 30-day gap matches monthlyInterest (balance × APR / 12, to the cent).
  function accruedInterest(balance, apr, from, to) {
    const days = daysBetween(from, to);
    if (days <= 0 || !(Number(balance) > 0) || !(Number(apr) > 0)) return 0;
    const monthly = Math.round(toCents(balance) * (Number(apr) || 0) / 1200);
    return Math.round(monthly * days / 30) / 100;
  }

  // interest is what accrued; principal is payment − interest (negative when the payment doesn't cover it).
  // balanceAfter = balance + interest − payment, floored at 0.
  function splitPayment(balance, apr, amount, from, to) {
    const bal = Math.max(0, Number(balance) || 0);
    const pay = Math.max(0, Number(amount) || 0);
    const interest = accruedInterest(bal, apr, from, to);
    const raw = bal + interest - pay;
    if (raw <= 0.004) {
      const owed = roundCents(bal + interest);
      const applied = Math.min(pay, owed);
      return { interest, principal: roundCents(applied - interest), balanceAfter: 0, unapplied: roundCents(pay - applied) };
    }
    return { interest, principal: roundCents(pay - interest), balanceAfter: roundCents(raw), unapplied: 0 };
  }

  // Fill interest and principal on payments that don't have them yet.
  // Legacy payments already reduced the stored balance by the full amount, so this
  // does not change account.balance. principal + interest = amount.
  function annotatePayments(accounts, payments) {
    const byAcct = new Map((accounts || []).map(a => [a.id, a]));
    const list = (payments || []).map(p => ({ ...p }));
    const grouped = new Map();
    list.forEach(p => {
      if (!p || p.accountId == null) return;
      if (!grouped.has(p.accountId)) grouped.set(p.accountId, []);
      grouped.get(p.accountId).push(p);
    });
    grouped.forEach((pays, id) => {
      const a = byAcct.get(id);
      pays.sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.id || '').localeCompare(String(y.id || '')));
      if (!a) {
        pays.forEach(p => {
          if (typeof p.interest !== 'number' || typeof p.principal !== 'number') {
            p.interest = 0;
            p.principal = roundCents(p.amount);
            p.legacy = true;
          }
        });
        return;
      }
      let bal = Math.max(0, Number(a.start) || Number(a.balance) || 0);
      let prev = parseISODate(a.created) || parseISODate(pays[0].date) || new Date();
      pays.forEach(p => {
        const when = parseISODate(p.date) || prev;
        if (typeof p.interest !== 'number' || typeof p.principal !== 'number') {
          const interest = accruedInterest(bal, a.apr || 0, prev, when);
          p.interest = interest;
          p.principal = roundCents((Number(p.amount) || 0) - interest);
          p.legacy = true;
        }
        if (p.balanceHeld) { /* The screenshot balance already included this payment. */ }
        else if (p.legacy !== false && p.balanceAfter == null) bal = roundCents(Math.max(0, bal - (Number(p.amount) || 0)));
        else if (typeof p.balanceAfter === 'number') bal = p.balanceAfter;
        else bal = roundCents(Math.max(0, bal + (Number(p.interest) || 0) - (Number(p.amount) || 0)));
        prev = when;
      });
    });
    return list;
  }

  // Balance over time. Interest on a legacy payment is a same-day rise; the balance
  // then drops by the full payment, which is what older saves already did.
  // A new payment (legacy === false, with balanceAfter) drops the balance by principal only,
  // after interest was added. Manual edits are applied on their date.
  // The series ends on the stored balance, so an unrecorded edit doesn't leave a gap.
  function history(accounts, payments, adjustments, today) {
    const todayD = today instanceof Date && !isNaN(today) ? today : new Date();
    const todayISO = isoDate(todayD);
    const ann = annotatePayments(accounts, payments);
    const adj = adjustments || [];
    return (accounts || []).map(a => {
      const mineP = ann.filter(p => p.accountId === a.id);
      const mineA = adj.filter(x => x && x.accountId === a.id && x.date);
      const created = a.created || (mineP[0] && mineP[0].date) || todayISO;
      let bal = roundCents(Math.max(0, Number(a.start) || 0));
      const points = [{ date: created, balance: bal, kind: 'open' }];
      const events = [
        ...mineP.map((p, i) => ({ ...p, kind: 'payment', _i: i })),
        ...mineA.map((x, i) => ({ ...x, kind: 'edit', _i: mineP.length + i })),
      ].sort((x, y) => String(x.date).localeCompare(String(y.date))
        || (x.kind === y.kind ? 0 : x.kind === 'payment' ? -1 : 1)
        || x._i - y._i);
      events.forEach(ev => {
        if (ev.kind === 'edit') {
          bal = roundCents(Math.max(0, Number(ev.balance) || 0));
          points.push({ date: ev.date, balance: bal, kind: 'edit' });
          return;
        }
        const interest = Number(ev.interest) || 0;
        if (interest > 0.004) points.push({ date: ev.date, balance: roundCents(bal + interest), kind: 'interest', interest });
        if (ev.balanceHeld) { /* The screenshot balance already included this payment. */ }
        else if (ev.legacy !== false && ev.balanceAfter == null) bal = roundCents(Math.max(0, bal - (Number(ev.amount) || 0)));
        else if (typeof ev.balanceAfter === 'number') bal = ev.balanceAfter;
        else bal = roundCents(Math.max(0, bal + interest - (Number(ev.amount) || 0)));
        points.push({
          date: ev.date, balance: bal, kind: 'payment', interest,
          principal: Number(ev.principal) || 0, amount: Number(ev.amount) || 0,
        });
      });
      const current = roundCents(Math.max(0, Number(a.balance) || 0));
      if (Math.abs(bal - current) > 0.009) points.push({ date: todayISO, balance: current, kind: 'reconcile' });
      return { id: a.id, points };
    });
  }

  function balanceAsOf(series, iso) {
    let total = 0;
    (series || []).forEach(s => {
      let bal = 0;
      (s.points || []).forEach(p => { if (String(p.date) <= String(iso)) bal = p.balance; });
      total += bal;
    });
    return roundCents(total);
  }

  function project(debts, opts) {
    opts = opts || {};
    const useCents = opts.round !== false;
    const toU = dollars => useCents ? toCents(dollars) : (Number(dollars) || 0);
    const fromU = u => useCents ? u / 100 : u;
    const interestU = (balU, apr) => useCents
      ? Math.round(balU * (Number(apr) || 0) / 1200)
      : balU * (Number(apr) || 0) / 1200;
    const eps = useCents ? 0 : 1e-8;
    const maxMonths = opts.maxMonths > 0 ? opts.maxMonths : 600;
    const start = opts.startDate instanceof Date && !isNaN(opts.startDate) ? opts.startDate : new Date();
    const raw = (debts || []).filter(d => d && (Number(d.balance) || 0) > 0.004);
    const floors = opts.paymentFloors || {};
    const spec = raw.map(d => {
      const min = Math.max(0, Number(d.min) || 0);
      const floor = floors[d.id] != null ? Math.max(0, Number(floors[d.id])) : min;
      const dueDay = Number(d.dueDay) >= 1 ? Math.min(31, Math.round(Number(d.dueDay))) : null;
      return { id: d.id, name: d.name || '', apr: Number(d.apr) || 0, min, dueDay, floorU: toU(floor), balU: toU(d.balance) };
    });
    const orderedIds = sortDebts(spec.map(d => ({ id: d.id, name: d.name, apr: d.apr, balance: fromU(d.balU) })), opts.strategy, opts.customOrder).map(d => d.id);
    const empty = {
      schedule: [], payoff: {}, interest: {}, firstPay: {}, totalInterest: 0, totalPaid: 0,
      months: 0, freeDate: null, stuck: false, alreadyFree: spec.length === 0, orderedIds,
      underwater: [], startBalance: 0, monthlyCommitment: 0,
    };
    if (!spec.length) return empty;

    let sumFloors = 0;
    spec.forEach(d => { sumFloors += d.floorU; });
    let commitment = sumFloors;
    if (opts.budget != null && opts.budget !== '' && isFinite(Number(opts.budget))) {
      const b = toU(opts.budget);
      if (b > commitment) commitment = b;
    }
    commitment += toU(Math.max(0, Number(opts.extraMonthly) || 0));
    const windfallU = toU(Math.max(0, Number(opts.windfall) || 0));

    const underwater = spec.filter(d => d.apr > 0 && d.floorU + eps < interestU(d.balU, d.apr)).map(d => d.id);
    const interest = {};
    const payoff = {};
    const firstPay = {};
    spec.forEach(d => { interest[d.id] = 0; });
    let totalInterestU = 0;
    let totalPaidU = 0;
    const schedule = [];
    const startBalanceU = spec.reduce((s, d) => s + d.balU, 0);

    for (let m = 0; m < maxMonths; m++) {
      if (!spec.some(d => d.balU > eps)) break;
      const date = monthDate(start, m);
      spec.forEach(d => {
        if (d.balU <= eps) { d._int = 0; return; }
        const interestPart = interestU(d.balU, d.apr);
        d._int = interestPart;
        d.balU += interestPart;
        interest[d.id] = (interest[d.id] || 0) + interestPart;
        totalInterestU += interestPart;
      });
      const ordered = sortDebts(spec.filter(d => d.balU > eps).map(d => ({ id: d.id, name: d.name, apr: d.apr, balance: fromU(d.balU) })), opts.strategy, opts.customOrder)
        .map(o => spec.find(s => s.id === o.id));
      let pool = commitment + (m === 0 ? windfallU : 0);
      const pays = {};
      ordered.forEach(d => {
        const pay = Math.min(d.balU, d.floorU);
        pays[d.id] = pay;
        pool -= pay;
      });
      if (pool < 0) pool = 0;
      ordered.forEach(d => {
        if (pool <= eps) return;
        const room = d.balU - (pays[d.id] || 0);
        if (room <= eps) return;
        const add = Math.min(room, pool);
        pays[d.id] = (pays[d.id] || 0) + add;
        pool -= add;
      });
      const rows = [];
      let paymentU = 0, interestRowU = 0, principalU = 0, balanceU = 0;
      ordered.forEach(d => {
        const interestPart = d._int || 0;
        const payment = pays[d.id] || 0;
        const principal = payment - interestPart;
        d.balU -= payment;
        const due = dueOnDate(date, d.dueDay);
        if (d.balU <= (useCents ? 0.5 : 1e-6)) {
          d.balU = 0;
          if (!payoff[d.id]) payoff[d.id] = due;
        }
        if (m === 0) firstPay[d.id] = fromU(payment);
        paymentU += payment;
        interestRowU += interestPart;
        principalU += principal;
        rows.push({
          id: d.id, name: d.name, dueDay: d.dueDay, due, interest: fromU(interestPart), payment: fromU(payment),
          principal: fromU(principal), balance: fromU(d.balU),
        });
      });
      rows.sort((a, b) => (a.due - b.due) || ordered.findIndex(d => d.id === a.id) - ordered.findIndex(d => d.id === b.id));
      spec.forEach(d => {
        balanceU += d.balU;
        if (m === 0 && firstPay[d.id] == null) firstPay[d.id] = 0;
        d._int = 0;
      });
      totalPaidU += paymentU;
      schedule.push({
        date, rows, payment: fromU(paymentU), interest: fromU(interestRowU),
        principal: fromU(principalU), balance: fromU(balanceU), unapplied: fromU(pool),
      });
    }

    const still = spec.some(d => d.balU > eps);
    Object.keys(interest).forEach(id => { interest[id] = fromU(interest[id]); });
    let free = null;
    Object.keys(payoff).forEach(id => { if (!free || payoff[id] > free) free = payoff[id]; });
    return {
      schedule, payoff, interest, firstPay,
      totalInterest: fromU(totalInterestU),
      totalPaid: fromU(totalPaidU),
      months: schedule.length,
      freeDate: still || !schedule.length ? null : free,
      stuck: still,
      alreadyFree: false,
      orderedIds,
      underwater,
      startBalance: fromU(startBalanceU),
      monthlyCommitment: fromU(commitment),
    };
  }

  // Each debt paid in isolation at its own minimum. No rollover and no extra.
  function minimumsOnly(debts, opts) {
    opts = opts || {};
    const interest = {};
    const payoff = {};
    let totalInterest = 0;
    let never = 0;
    let months = 0;
    (debts || []).forEach(d => {
      if (!d || (Number(d.balance) || 0) <= 0.004) return;
      const result = project([d], {
        strategy: 'snowball',
        extraMonthly: 0,
        windfall: 0,
        budget: null,
        paymentFloors: { [d.id]: Math.max(0, Number(d.min) || 0) },
        maxMonths: opts.maxMonths || 600,
        startDate: opts.startDate,
        round: opts.round,
      });
      interest[d.id] = result.totalInterest;
      totalInterest += result.totalInterest;
      if (result.stuck) never += 1;
      months = Math.max(months, result.months);
      if (result.payoff[d.id]) payoff[d.id] = result.payoff[d.id];
    });
    return {
      totalInterest: opts.round === false ? totalInterest : roundCents(totalInterest),
      never, months, interest, payoff,
    };
  }

  function compare(debts, opts) {
    opts = opts || {};
    const minimums = minimumsOnly(debts, opts);
    const strategies = STRATEGIES.map(strategy => {
      const paymentFloors = plannedFloors(debts, { ...opts, strategy });
      const result = project(debts, { ...opts, strategy, paymentFloors });
      const interestSaved = (opts.round === false ? (minimums.totalInterest - result.totalInterest) : roundCents(minimums.totalInterest - result.totalInterest));
      return { strategy, result, interestSaved };
    });
    return { strategies, minimumsOnly: minimums };
  }

  function asDate(value) {
    if (value instanceof Date && !isNaN(value)) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    return parseISODate(value);
  }

  function addDays(date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  }

  // Sunday through Saturday, matching the calendar.
  function weekContaining(value) {
    const d = asDate(value) || new Date();
    const start = addDays(d, -d.getDay());
    const end = addDays(start, 6);
    return { start: isoDate(start), end: isoDate(end) };
  }

  function shiftWeek(weekStartISO, deltaWeeks) {
    const start = parseISODate(weekStartISO) || new Date();
    return weekContaining(addDays(start, (Number(deltaWeeks) || 0) * 7));
  }

  function pointBalance(series, iso) {
    let bal = 0;
    let seen = false;
    ((series && series.points) || []).forEach(p => {
      if (String(p.date) <= String(iso)) { bal = p.balance; seen = true; }
    });
    return seen ? bal : 0;
  }

  // One Sunday–Saturday week. Start balance is the day before the week, so a
  // payment on the first day is not already baked into the start number.
  // End balance stops at today when the week is still in progress.
  function weeklySnapshot(accounts, payments, adjustments, weekStartISO, today) {
    const week = weekContaining(weekStartISO);
    const todayD = asDate(today) || new Date();
    const todayISO = isoDate(todayD);
    const asOfEnd = week.end < todayISO ? week.end : todayISO;
    const dayBefore = isoDate(addDays(parseISODate(week.start), -1));
    const ann = annotatePayments(accounts, payments);
    const series = history(accounts, payments, adjustments, todayD);
    const byId = new Map(series.map(s => [s.id, s]));
    const rows = [];
    (accounts || []).forEach(a => {
      if (!a) return;
      const mine = byId.get(a.id);
      const openedOn = a.created || (mine && mine.points[0] && mine.points[0].date) || todayISO;
      if (openedOn > asOfEnd) return;
      const addedThisWeek = openedOn >= week.start && openedOn <= week.end && openedOn <= todayISO;
      const start = openedOn <= dayBefore ? pointBalance(mine, dayBefore) : 0;
      const end = pointBalance(mine, asOfEnd);
      const pays = ann.filter(p => p.accountId === a.id && p.date >= week.start && p.date <= week.end && p.date <= todayISO);
      const paid = roundCents(pays.reduce((n, p) => n + (Number(p.amount) || 0), 0));
      const interest = roundCents(pays.reduce((n, p) => n + (Number(p.interest) || 0), 0));
      const principal = roundCents(pays.reduce((n, p) => n + (Number(p.principal) || 0), 0));
      const paidOff = end <= 0.004 && (start > 0.004 || paid > 0.004);
      if (start <= 0.004 && end <= 0.004 && paid <= 0.004 && !addedThisWeek) return;
      rows.push({
        id: a.id, name: a.name || '', opened: roundCents(Math.max(0, Number(a.start) || 0)),
        start, end, paid, interest, principal, addedThisWeek, paidOff,
        payments: pays.map(p => ({
          id: p.id || '', date: p.date, amount: roundCents(Number(p.amount) || 0),
          interest: roundCents(Number(p.interest) || 0), principal: roundCents(Number(p.principal) || 0),
          legacy: p.legacy === true,
        })),
      });
    });
    const sum = key => roundCents(rows.reduce((n, r) => n + (Number(r[key]) || 0), 0));
    const original = roundCents(rows.reduce((n, r) => n + (Number(r.opened) || 0), 0));
    const debt = sum('end');
    return {
      start: week.start, end: week.end, asOf: asOfEnd, today: todayISO, rows,
      totals: {
        debt, startDebt: sum('start'), change: roundCents(debt - sum('start')),
        paid: sum('paid'), interest: sum('interest'), principal: sum('principal'),
        original, percentPaid: original > 0.004 ? (original - debt) / original : 0,
      },
    };
  }

  // Average monthly payments over a recent window (12 weeks by default).
  // A 30-day month matches the engine. Too short a window, or no payments, is not a pace.
  function measurePace(payments, opts) {
    opts = opts || {};
    const today = asDate(opts.today) || new Date();
    const todayISO = isoDate(today);
    const weeks = opts.weeks > 0 ? opts.weeks : 12;
    const minDays = opts.minDays > 0 ? opts.minDays : 28;
    let start = addDays(today, -(weeks * 7 - 1));
    const since = asDate(opts.since);
    if (since && since > start) start = since;
    const startISO = isoDate(start);
    const days = daysBetween(start, today) + 1;
    const pays = (payments || []).filter(p => p && String(p.date) >= startISO && String(p.date) <= todayISO);
    const paid = roundCents(pays.reduce((n, p) => n + (Number(p.amount) || 0), 0));
    const enough = days >= minDays && pays.length > 0 && paid > 0.004;
    return {
      enough, paid, days, count: pays.length, start: startISO, end: todayISO,
      monthly: enough ? roundCents(paid * 30 / days) : 0,
    };
  }

  function scaledFloors(open, pace) {
    const floors = {};
    const weights = open.map(d => Math.max(0, Number(d.min) || 0));
    const sum = weights.reduce((n, w) => n + w, 0);
    if (!(sum > 0)) {
      open.forEach(d => { floors[d.id] = 0; });
      return floors;
    }
    let assigned = 0;
    open.forEach((d, i) => {
      if (i === open.length - 1) floors[d.id] = roundCents(Math.max(0, pace - assigned));
      else {
        const share = roundCents(pace * weights[i] / sum);
        floors[d.id] = share;
        assigned = roundCents(assigned + share);
      }
    });
    return floors;
  }

  // Run `monthly` dollars through the cent-rounded schedule.
  // At or above the minimums, the extra rolls by strategy. Below the minimums,
  // the floors are scaled to the pace, because a budget under the floors is ignored.
  function projectMonthly(debts, monthly, opts) {
    opts = opts || {};
    const open = (debts || []).filter(d => d && (Number(d.balance) || 0) > 0.004);
    const pace = Math.max(0, Number(monthly) || 0);
    const sumMin = roundCents(open.reduce((n, d) => n + Math.max(0, Number(d.min) || 0), 0));
    const floors = {};
    let budget = null;
    if (pace + 0.004 >= sumMin) {
      open.forEach(d => { floors[d.id] = Math.max(0, Number(d.min) || 0); });
      budget = pace;
    } else {
      Object.assign(floors, scaledFloors(open, pace));
    }
    return project(open, {
      strategy: opts.strategy || 'snowball',
      customOrder: opts.customOrder,
      paymentFloors: floors,
      budget,
      extraMonthly: 0,
      windfall: 0,
      startDate: opts.startDate || asDate(opts.today) || new Date(),
      round: opts.round,
      maxMonths: opts.maxMonths,
    });
  }

  function paceOutlook(debts, payments, opts) {
    opts = opts || {};
    const open = (debts || []).filter(d => d && (Number(d.balance) || 0) > 0.004);
    if (!open.length) {
      return { basis: 'free', alreadyFree: true, notOnTrack: false, monthly: 0, freeDate: null, result: null, pace: null };
    }
    const pace = measurePace(payments, opts);
    if (!pace.enough) {
      const floors = opts.paymentFloors || plannedFloors(open, opts);
      const result = project(open, {
        strategy: opts.strategy || 'snowball',
        customOrder: opts.customOrder,
        paymentFloors: floors,
        budget: opts.budget,
        extraMonthly: opts.extraMonthly,
        windfall: opts.windfall,
        startDate: opts.startDate || asDate(opts.today) || new Date(),
        round: opts.round,
        maxMonths: opts.maxMonths,
      });
      const notOnTrack = !!(result.stuck || !result.freeDate);
      return { basis: 'plan', alreadyFree: false, notOnTrack, monthly: result.monthlyCommitment, freeDate: notOnTrack ? null : result.freeDate, result, pace };
    }
    const result = projectMonthly(open, pace.monthly, opts);
    const notOnTrack = !!(result.stuck || !result.freeDate);
    return { basis: 'pace', alreadyFree: false, notOnTrack, monthly: pace.monthly, freeDate: notOnTrack ? null : result.freeDate, result, pace };
  }

  // A local timestamp, so the month key follows the calendar on this device.
  function captureStamp(date) {
    const dt = date instanceof Date && !isNaN(date) ? date : new Date();
    const p = n => String(n).padStart(2, '0');
    const month = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}`;
    return { month, capturedAt: `${month}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}` };
  }

  function normalizeSnapshots(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(x => x && typeof x.accountId === 'string' && /^\d{4}-\d{2}$/.test(x.month) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(String(x.capturedAt || '')) && isFinite(+x.balance)).map(x => {
      const row = {
        id: typeof x.id === 'string' && x.id ? x.id : 'snap',
        accountId: x.accountId,
        month: x.month,
        capturedAt: String(x.capturedAt),
        balance: roundCents(Math.max(0, +x.balance)),
        apr: isFinite(+x.apr) && +x.apr >= 0 ? roundCents(x.apr) : 0,
        min: isFinite(+x.min) && +x.min >= 0 ? roundCents(x.min) : 0,
        dueDay: isFinite(+x.dueDay) && +x.dueDay >= 1 && +x.dueDay <= 31 ? Math.round(+x.dueDay) : null,
      };
      if (/^\d{4}-\d{2}-\d{2}$/.test(x.dueDate || '')) row.dueDate = x.dueDate;
      if (x.creditLimit != null && x.creditLimit !== '' && isFinite(+x.creditLimit) && +x.creditLimit >= 0) row.creditLimit = roundCents(x.creditLimit);
      return row;
    });
  }

  // Every reading is kept. A month's row is the latest timestamp for that card.
  function monthlySeries(snapshots, accountId) {
    const rows = normalizeSnapshots(snapshots).filter(s => s.accountId === accountId);
    const ordered = rows.slice().sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || String(a.id).localeCompare(String(b.id)));
    const best = new Map();
    ordered.forEach(s => best.set(s.month, s));
    const months = [...best.values()].sort((a, b) => a.month.localeCompare(b.month));
    return months.map((s, i) => {
      const prev = i ? months[i - 1] : null;
      return {
        ...s,
        balanceChange: prev ? roundCents(s.balance - prev.balance) : null,
        aprChange: prev ? roundCents(s.apr - prev.apr) : null,
        minChange: prev ? roundCents(s.min - prev.min) : null,
      };
    });
  }

  function monthLabel(month) {
    const parts = /^(\d{4})-(\d{2})$/.exec(month || '');
    if (!parts) return month || '';
    return new Date(+parts[1], +parts[2] - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // Compare cards that were read in both of the two latest months. A new card
  // does not look like the older cards grew.
  function screenshotTrend(snapshots) {
    const rows = normalizeSnapshots(snapshots);
    const ordered = rows.slice().sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || String(a.id).localeCompare(String(b.id)));
    const best = new Map();
    ordered.forEach(s => best.set(s.accountId + '|' + s.month, s));
    const latest = [...best.values()];
    const months = [...new Set(latest.map(s => s.month))].sort();
    if (!months.length) return null;
    if (months.length === 1) return { kind: 'start', month: months[0], since: monthLabel(months[0]) };
    const prevM = months[months.length - 2];
    const curM = months[months.length - 1];
    const prevRows = latest.filter(s => s.month === prevM);
    const curRows = latest.filter(s => s.month === curM);
    let delta = 0;
    let shared = 0;
    prevRows.forEach(p => {
      const c = curRows.find(r => r.accountId === p.accountId);
      if (!c) return;
      shared += 1;
      delta = roundCents(delta + (c.balance - p.balance));
    });
    if (!shared) return { kind: 'span', from: months[0], to: curM, since: monthLabel(months[0]), until: monthLabel(curM) };
    return { kind: 'change', delta, shared, from: prevM, to: curM, since: monthLabel(prevM) };
  }

  const api = {
    STRATEGIES, toCents, roundCents, monthlyInterest, sortDebts, plannedFloors, project, minimumsOnly, compare,
    dueOnDate, accruedInterest, splitPayment, annotatePayments, history, balanceAsOf,
    weekContaining, shiftWeek, weeklySnapshot, measurePace, projectMonthly, paceOutlook,
    captureStamp, normalizeSnapshots, monthlySeries, screenshotTrend, monthLabel,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DebtEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
