const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');

const start = new Date(2026, 0, 1);

function cents(n) {
  return Math.round(Number(n) * 100 + (n >= 0 ? 1e-8 : -1e-8));
}

function debt(id, balance, apr, min, extra) {
  return { id, name: id, balance, apr, min, ...extra };
}

function closedFormMonths(principal, apr, payment) {
  const r = apr / 100 / 12;
  if (payment <= 0) return Infinity;
  if (r === 0) return Math.ceil(principal / payment - 1e-9);
  if (payment <= principal * r + 1e-9) return Infinity;
  const n = -Math.log(1 - (r * principal) / payment) / Math.log(1 + r);
  return Math.ceil(n - 1e-8);
}

test('zero APR pays the exact principal and no interest', () => {
  const result = E.project([debt('a', 1200, 0, 100)], { startDate: start });
  assert.equal(result.months, 12);
  assert.equal(result.totalInterest, 0);
  assert.equal(result.totalPaid, 1200);
  assert.equal(result.stuck, false);
  assert.equal(result.freeDate.getFullYear(), 2026);
  assert.equal(result.freeDate.getMonth(), 11);
  result.schedule.forEach(row => {
    assert.equal(row.payment, 100);
    assert.equal(row.interest, 0);
    assert.equal(row.principal, 100);
  });
  assert.equal(result.schedule[11].balance, 0);
});

test('monthly interest matches balance × APR / 12 rounded to the cent', () => {
  assert.equal(cents(E.monthlyInterest(100, 10)), 83);       // 0.8333… → 0.83
  assert.equal(cents(E.monthlyInterest(1000, 19.99)), 1666); // 16.6583… → 16.66
  assert.equal(E.monthlyInterest(1000, 0), 0);
  const result = E.project([debt('a', 1000, 19.99, 50)], { startDate: start, maxMonths: 1 });
  assert.equal(cents(result.schedule[0].interest), 1666);
  assert.equal(cents(result.schedule[0].principal), 5000 - 1666);
  assert.equal(cents(result.schedule[0].balance), 100000 + 1666 - 5000);
});

test('unrounded single loan matches the closed-form month count', () => {
  // $5,000 at 18% APR, $150 a month. n = −ln(1 − rP/M) / ln(1+r).
  const months = closedFormMonths(5000, 18, 150);
  assert.equal(months, 47);
  const result = E.project([debt('a', 5000, 18, 150)], { startDate: start, round: false });
  assert.equal(result.months, months);
  assert.equal(result.stuck, false);
  assert.ok(result.schedule[result.schedule.length - 1].payment < 150);
  assert.ok(Math.abs(result.schedule[result.schedule.length - 2].payment - 150) < 1e-6);
  let bal = 5000, interest = 0, n = 0;
  const r = 0.18 / 12;
  while (bal > 1e-8 && n < 600) {
    const i = bal * r;
    interest += i;
    const pay = Math.min(bal + i, 150);
    bal = bal + i - pay;
    n += 1;
  }
  assert.ok(Math.abs(result.totalInterest - interest) < 1e-6);
  assert.ok(Math.abs(result.totalPaid - (5000 + interest)) < 1e-6);
});

test('cent-rounded schedule conserves principal when the debt is paid off', () => {
  const debts = [debt('a', 5000, 18, 150), debt('b', 800, 6, 25)];
  const result = E.project(debts, { startDate: start, extraMonthly: 100, strategy: 'avalanche' });
  assert.equal(result.stuck, false);
  let principal = 0, paid = 0, interest = 0;
  const bal = { a: 500000, b: 80000 };
  for (const month of result.schedule) {
    for (const row of month.rows) {
      const apr = row.id === 'a' ? 18 : 6;
      const expected = Math.round(bal[row.id] * apr / 1200);
      assert.equal(cents(row.interest), expected);
      assert.equal(cents(row.balance), bal[row.id] + expected - cents(row.payment));
      assert.ok(cents(row.payment) <= bal[row.id] + expected);
      bal[row.id] = cents(row.balance);
      principal += cents(row.principal);
      paid += cents(row.payment);
      interest += cents(row.interest);
    }
    assert.equal(cents(month.payment), month.rows.reduce((s, r) => s + cents(r.payment), 0));
  }
  assert.equal(principal, 580000);
  assert.equal(paid, principal + interest);
  assert.equal(bal.a, 0);
  assert.equal(bal.b, 0);
});

test('snowball sends extra to the smaller balance; avalanche to the higher APR', () => {
  const debts = [debt('big', 5000, 22, 100), debt('small', 800, 6, 25)];
  const snow = E.project(debts, { startDate: start, strategy: 'snowball', extraMonthly: 150 });
  const ava = E.project(debts, { startDate: start, strategy: 'avalanche', extraMonthly: 150 });
  const snow1 = Object.fromEntries(snow.schedule[0].rows.map(r => [r.id, cents(r.payment)]));
  const ava1 = Object.fromEntries(ava.schedule[0].rows.map(r => [r.id, cents(r.payment)]));
  assert.equal(snow1.small, 2500 + 15000);
  assert.equal(snow1.big, 10000);
  assert.equal(ava1.big, 10000 + 15000);
  assert.equal(ava1.small, 2500);
  assert.ok(snow.payoff.small < snow.payoff.big);
  assert.ok(ava.payoff.big < ava.payoff.small);
  assert.ok(ava.totalInterest < snow.totalInterest);
});

test('custom order is honored even when it is neither snowball nor avalanche', () => {
  const debts = [debt('a', 5000, 4, 50), debt('b', 400, 20, 25)];
  const result = E.project(debts, { startDate: start, strategy: 'custom', customOrder: ['a', 'b'], extraMonthly: 100 });
  const pays = Object.fromEntries(result.schedule[0].rows.map(r => [r.id, cents(r.payment)]));
  assert.equal(pays.a, 5000 + 10000);
  assert.equal(pays.b, 2500);
  assert.deepEqual(result.orderedIds, ['a', 'b']);
});

test('a paid-off minimum rolls onto the next debt', () => {
  const debts = [debt('b', 100, 0, 50), debt('a', 1000, 0, 50)];
  const result = E.project(debts, { startDate: start, strategy: 'snowball' });
  assert.equal(cents(result.schedule[0].rows.find(r => r.id === 'b').payment), 5000);
  assert.equal(cents(result.schedule[1].rows.find(r => r.id === 'b').payment), 5000);
  assert.equal(result.payoff.b.getMonth(), 1);
  const third = result.schedule[2].rows.find(r => r.id === 'a');
  assert.equal(cents(third.payment), 10000);
  assert.equal(result.months, 11);
  assert.equal(result.totalPaid, 1100);
});

test('a windfall is applied once, in the first month', () => {
  const debts = [debt('b', 200, 0, 50), debt('a', 1000, 0, 50)];
  const base = E.project(debts, { startDate: start });
  const wind = E.project(debts, { startDate: start, windfall: 200 });
  assert.equal(base.months, 12);
  assert.equal(wind.months, 10);
  const m1 = Object.fromEntries(wind.schedule[0].rows.map(r => [r.id, cents(r.payment)]));
  assert.equal(m1.b, 20000);
  assert.equal(m1.a, 10000);
  assert.equal(cents(wind.schedule[1].payment), 10000);
  assert.ok(wind.schedule[1].rows.every(r => r.id !== 'b'));
  assert.equal(cents(wind.schedule[0].unapplied), 0);
});

test('extra monthly payment shortens the loan and cuts interest', () => {
  const debts = [debt('a', 2400, 18, 50)];
  const base = E.project(debts, { startDate: start });
  const extra = E.project(debts, { startDate: start, extraMonthly: 50 });
  assert.ok(extra.months < base.months);
  assert.ok(extra.totalInterest < base.totalInterest);
  assert.equal(cents(extra.schedule[0].payment), 10000);
});

test('a budget above the minimums behaves like that much total payment', () => {
  const debts = [debt('b', 400, 0, 50), debt('a', 1000, 0, 50)];
  const byBudget = E.project(debts, { startDate: start, budget: 200 });
  const byExtra = E.project(debts, { startDate: start, extraMonthly: 100 });
  assert.equal(byBudget.months, byExtra.months);
  assert.equal(byBudget.totalPaid, byExtra.totalPaid);
  assert.equal(cents(byBudget.schedule[0].payment), 20000);
});

test('a budget below the minimums does not reduce planned payments', () => {
  const result = E.project([debt('a', 1000, 0, 80)], { startDate: start, budget: 10 });
  assert.equal(cents(result.schedule[0].payment), 8000);
  assert.equal(result.monthlyCommitment, 80);
});

test('minimum below interest never pays the debt off', () => {
  const result = E.project([debt('a', 1000, 24, 10)], { startDate: start });
  assert.equal(result.stuck, true);
  assert.equal(result.freeDate, null);
  assert.equal(result.months, 600);
  assert.ok(result.underwater.includes('a'));
  assert.ok(result.schedule[0].balance > 1000);
  assert.ok(result.schedule[0].principal < 0);
  const alone = E.minimumsOnly([debt('a', 1000, 24, 10)], { startDate: start });
  assert.equal(alone.never, 1);
});

test('compare reports lower interest for avalanche and savings against isolated minimums', () => {
  const debts = [debt('big', 5000, 22, 100), debt('small', 800, 6, 25)];
  const cmp = E.compare(debts, { startDate: start, extraMonthly: 150, accelerateFocus: false });
  const snow = cmp.strategies.find(s => s.strategy === 'snowball');
  const ava = cmp.strategies.find(s => s.strategy === 'avalanche');
  assert.ok(ava.result.totalInterest < snow.result.totalInterest);
  assert.ok(snow.interestSaved > 0);
  assert.ok(ava.interestSaved > snow.interestSaved);
  assert.equal(cmp.minimumsOnly.never, 0);
});

test('planned floors raise only the focus debt when accelerate is on', () => {
  const debts = [debt('small', 600, 12, 25), debt('big', 4000, 20, 80)];
  const plain = E.plannedFloors(debts, { strategy: 'snowball', accelerateFocus: false });
  assert.equal(plain.small, 25);
  assert.equal(plain.big, 80);
  const boosted = E.plannedFloors(debts, { strategy: 'snowball', accelerateFocus: true, focusMonths: 6 });
  assert.equal(boosted.small, 100);
  assert.equal(boosted.big, 80);
  const ava = E.plannedFloors(debts, { strategy: 'avalanche', accelerateFocus: true, focusMonths: 6 });
  assert.equal(ava.big, Math.ceil(4000 / 6));
  assert.equal(ava.small, 25);
  const tiered = E.plannedFloors([debt('small', 600, 12, 25, { tierMonths: 3 })], { strategy: 'snowball' });
  assert.equal(tiered.small, 200);
});

test('sort order ties break on id and custom unknowns fall back to balance', () => {
  const same = [debt('b', 100, 10, 10), debt('a', 100, 10, 10)];
  assert.deepEqual(E.sortDebts(same, 'snowball').map(d => d.id), ['a', 'b']);
  const custom = E.sortDebts([debt('a', 50, 1, 10), debt('b', 20, 1, 10), debt('c', 5, 1, 10)], 'custom', ['a']);
  assert.deepEqual(custom.map(d => d.id), ['a', 'c', 'b']);
});

test('no open debts is already free and does not invent interest', () => {
  const result = E.project([debt('a', 0, 20, 10)], { startDate: start });
  assert.equal(result.alreadyFree, true);
  assert.equal(result.months, 0);
  assert.equal(result.totalInterest, 0);
  assert.equal(result.stuck, false);
});

test('last payment is partial and never exceeds the balance plus interest', () => {
  const result = E.project([debt('a', 1000, 0, 300)], { startDate: start });
  assert.deepEqual(result.schedule.map(m => cents(m.payment)), [30000, 30000, 30000, 10000]);
  assert.equal(result.schedule[3].balance, 0);
  assert.equal(result.totalPaid, 1000);
});
