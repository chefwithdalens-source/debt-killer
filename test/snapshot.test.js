const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');

const today = new Date(2026, 9, 25); // Sunday

test('weeks run Sunday through Saturday and stop at the current week', () => {
  assert.deepEqual(E.weekContaining('2026-10-25'), { start: '2026-10-25', end: '2026-10-31' });
  assert.deepEqual(E.weekContaining(new Date(2026, 9, 24)), { start: '2026-10-18', end: '2026-10-24' });
  assert.deepEqual(E.shiftWeek('2026-10-25', -1), { start: '2026-10-18', end: '2026-10-24' });
  assert.equal(E.shiftWeek('2026-10-18', 1).start, '2026-10-25');
});

test('a week counts payments on both boundary days and labels legacy splits', () => {
  const accounts = [
    { id: 'a', name: 'Card', start: 1000, balance: 900, apr: 0, min: 10, created: '2026-01-01' },
    { id: 'b', name: 'New', start: 300, balance: 300, apr: 0, min: 25, created: '2026-10-21' },
    { id: 'c', name: 'Gone', start: 80, balance: 0, apr: 0, min: 20, created: '2026-01-01' },
  ];
  const payments = [
    { id: 'p1', accountId: 'a', date: '2026-10-17', amount: 10 },
    { id: 'p2', accountId: 'a', date: '2026-10-18', amount: 20 },
    { id: 'p3', accountId: 'a', date: '2026-10-24', amount: 30 },
    { id: 'p4', accountId: 'a', date: '2026-10-25', amount: 40 },
    { id: 'p5', accountId: 'c', date: '2026-10-22', amount: 80 },
  ];
  const snap = E.weeklySnapshot(accounts, payments, [], '2026-10-18', today);
  assert.equal(snap.start, '2026-10-18');
  assert.equal(snap.end, '2026-10-24');
  assert.equal(snap.asOf, '2026-10-24');
  const card = snap.rows.find(r => r.id === 'a');
  assert.equal(card.start, 990);
  assert.equal(card.end, 940);
  assert.equal(card.paid, 50);
  assert.deepEqual(card.payments.map(p => p.date), ['2026-10-18', '2026-10-24']);
  assert.equal(card.payments.every(p => p.legacy), true);
  const added = snap.rows.find(r => r.id === 'b');
  assert.equal(added.start, 0);
  assert.equal(added.end, 300);
  assert.equal(added.addedThisWeek, true);
  const gone = snap.rows.find(r => r.id === 'c');
  assert.equal(gone.start, 80);
  assert.equal(gone.end, 0);
  assert.equal(gone.paidOff, true);
  assert.equal(snap.totals.paid, 130);
  assert.equal(snap.totals.debt, 1240);
  assert.equal(snap.totals.change, 170);
});

test('a legacy payment keeps its interest and principal labels', () => {
  const accounts = [{ id: 'a', name: 'Card', start: 100, balance: 80, apr: 18, min: 10, created: '2026-01-01' }];
  const payments = [{ id: 'p', accountId: 'a', date: '2026-10-20', amount: 20, interest: 5, principal: 15, legacy: true }];
  const row = E.weeklySnapshot(accounts, payments, [], '2026-10-18', today).rows[0];
  assert.equal(row.interest, 5);
  assert.equal(row.principal, 15);
  assert.equal(row.payments[0].legacy, true);
  assert.equal(row.end, 80);
});

test('a new payment uses the stored balance after interest', () => {
  const accounts = [{ id: 'a', name: 'Card', start: 1000, balance: 910, apr: 18, min: 50, created: '2026-01-01' }];
  const payments = [{ id: 'p', accountId: 'a', date: '2026-10-20', amount: 100, interest: 10, principal: 90, balanceAfter: 910, legacy: false }];
  const row = E.weeklySnapshot(accounts, payments, [], '2026-10-18', today).rows[0];
  assert.equal(row.start, 1000);
  assert.equal(row.end, 910);
  assert.equal(row.payments[0].legacy, false);
  assert.equal(row.interest, 10);
  assert.equal(row.principal, 90);
});

test('no payment history falls back to the plan and still has a date', () => {
  const out = E.paceOutlook(
    [{ id: 'a', name: 'A', balance: 1200, apr: 0, min: 100 }],
    [],
    { today, strategy: 'snowball' }
  );
  assert.equal(out.basis, 'plan');
  assert.equal(out.alreadyFree, false);
  assert.equal(out.notOnTrack, false);
  assert.equal(out.result.months, 12);
  assert.ok(out.freeDate instanceof Date);
});

test('too little history also follows the plan', () => {
  const out = E.paceOutlook(
    [{ id: 'a', balance: 500, apr: 0, min: 100 }],
    [{ accountId: 'a', date: '2026-10-20', amount: 100 }],
    { today, since: '2026-10-15', strategy: 'snowball' }
  );
  assert.equal(out.basis, 'plan');
  assert.equal(out.pace.enough, false);
  assert.equal(out.notOnTrack, false);
  assert.ok(out.freeDate);
});

test('a pace that does not cover interest is not on track', () => {
  const out = E.paceOutlook(
    [{ id: 'a', name: 'Card', balance: 10000, apr: 36, min: 50 }],
    [{ accountId: 'a', date: '2026-10-01', amount: 140 }],
    { today, since: '2026-01-01', strategy: 'snowball' }
  );
  assert.equal(out.basis, 'pace');
  assert.equal(out.pace.days, 84);
  assert.equal(out.monthly, 50);
  assert.equal(out.notOnTrack, true);
  assert.equal(out.freeDate, null);
  assert.equal(out.result.stuck, true);
});

test('paid-off debts are already free', () => {
  const out = E.paceOutlook([{ id: 'a', balance: 0, apr: 18, min: 50 }], [], { today });
  assert.equal(out.alreadyFree, true);
  assert.equal(out.basis, 'free');
  assert.equal(out.notOnTrack, false);
  assert.equal(out.freeDate, null);
});

test('pace above the minimums charges interest and finishes sooner', () => {
  const debts = [
    { id: 'a', name: 'A', balance: 300, apr: 12, min: 50 },
    { id: 'b', name: 'B', balance: 300, apr: 0, min: 50 },
  ];
  const pace = E.paceOutlook(debts, [{ accountId: 'a', date: '2026-01-01', amount: 560 }], {
    today: new Date(2026, 0, 15), since: '2025-01-01', strategy: 'snowball',
  });
  const mins = E.project(debts, { strategy: 'snowball', paymentFloors: { a: 50, b: 50 }, startDate: new Date(2026, 0, 15) });
  assert.equal(pace.basis, 'pace');
  assert.equal(pace.monthly, 200);
  assert.equal(pace.notOnTrack, false);
  assert.ok(pace.result.totalInterest > 0);
  assert.ok(pace.result.months < mins.months);
  assert.ok(pace.freeDate instanceof Date);
});
