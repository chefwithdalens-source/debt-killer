// Debt payoff engine. Monthly interest is balance × APR / 12, rounded to the
// nearest cent (half up), then the payment is applied:
//   next = balance + interest − payment
// Snowball aims extra dollars at the smallest balance, avalanche at the highest
// APR, and custom at a caller-supplied order. Each month the order is rebuilt.
// Every open debt is paid its planned amount (minimum, or a higher floor).
// Dollars left over — including a paid-off debt's planned amount — roll to the
// next debt in that order. A one-time windfall is added in the first month only.
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
      return { id: d.id, name: d.name || '', apr: Number(d.apr) || 0, min, floorU: toU(floor), balU: toU(d.balance) };
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
        if (d.balU <= (useCents ? 0.5 : 1e-6)) {
          d.balU = 0;
          if (!payoff[d.id]) payoff[d.id] = date;
        }
        if (m === 0) firstPay[d.id] = fromU(payment);
        paymentU += payment;
        interestRowU += interestPart;
        principalU += principal;
        rows.push({
          id: d.id, name: d.name, interest: fromU(interestPart), payment: fromU(payment),
          principal: fromU(principal), balance: fromU(d.balU),
        });
      });
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
    return {
      schedule, payoff, interest, firstPay,
      totalInterest: fromU(totalInterestU),
      totalPaid: fromU(totalPaidU),
      months: schedule.length,
      freeDate: still || !schedule.length ? null : schedule[schedule.length - 1].date,
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

  const api = {
    STRATEGIES, toCents, roundCents, monthlyInterest, sortDebts, plannedFloors, project, minimumsOnly, compare,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DebtEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
