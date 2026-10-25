const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const O = require('../ocr.js');

const TODAY = '2026-10-25';

// Sample OCR text in the shape of Rayon's bank apps. The images stay off the repo.
const NAVY_FLAGSHIP = `
Visa Signature Flagship Rewards
•••• 9100
Minimum Payment $241.01 Due 11/17/2026
Last Payment Amount $245.79 On 10/19/2026
14 Day Payoff Amount $9,718.43 Through 11/08/2026
Interest Rate 18.00%
`;
const NAVY_AMEX = `More Rewards Amex - 3015`;
const NAVY_PLATINUM = `Visa Platinum - 8303`;
const MISSION_DETAIL = `
Mission Lane
Account details (...6529)
Current balance $1,219.54
Credit line $1,500.00
Last payment $87.33 Fri, Oct 2, 2026
Purchase APR 30.49% variable
`;
const MISSION_HOME = `
Mission Lane
$45.04 minimum Due Nov 2
`;
const WELLS = `
WELLS FARGO AUTOGRAPH VISA CARD ...0716
$2,343.20 Outstanding balance
Minimum payment due 11/05/2026 $81.00
Last payment received 10/06/2026 $121.00
PURCHASES 27.99% variable
CASH ADVANCES 29.99% variable
`;

function acct(partial) {
  return { id: partial.id, name: partial.name, balance: partial.balance, min: partial.min || 0, apr: partial.apr || 0, dueDay: partial.dueDay || null, start: partial.start || partial.balance, last4: partial.last4, type: 'Credit card', ...partial };
}

test('Navy Federal card pages yield balance, APR, minimum, due day, last payment, and last 4', () => {
  const flagship = O.parseStatement(NAVY_FLAGSHIP, { today: TODAY });
  assert.equal(flagship.lender.value, 'Navy Federal');
  assert.equal(flagship.lenderId, 'navy-federal');
  assert.match(flagship.product.value, /Flagship Rewards/);
  assert.equal(flagship.last4.value, '9100');
  assert.equal(flagship.balance.value, 9718.43);
  assert.equal(flagship.balance.kind, 'payoff');
  assert.equal(flagship.balance.label, 'Payoff amount');
  assert.equal(flagship.apr.value, 18);
  assert.equal(flagship.minimum.value, 241.01);
  assert.equal(flagship.dueDate.value, '2026-11-17');
  assert.equal(flagship.dueDay.value, 17);
  assert.equal(flagship.lastPayment.amount, 245.79);
  assert.equal(flagship.lastPayment.date, '2026-10-19');
  assert.equal(flagship.dueDate.value === '2026-11-08', false);

  const amex = O.parseStatement(NAVY_AMEX, { today: TODAY });
  assert.equal(amex.lender.value, 'Navy Federal');
  assert.equal(amex.product.value, 'More Rewards Amex');
  assert.equal(amex.last4.value, '3015');

  const platinum = O.parseStatement(NAVY_PLATINUM, { today: TODAY });
  assert.equal(platinum.product.value, 'Visa Platinum');
  assert.equal(platinum.last4.value, '8303');
});

test('Mission Lane detail and home screens merge onto one account', () => {
  const detail = O.parseStatement(MISSION_DETAIL, { today: TODAY });
  assert.equal(detail.lender.value, 'Mission Lane');
  assert.equal(detail.last4.value, '6529');
  assert.equal(detail.balance.value, 1219.54);
  assert.equal(detail.balance.kind, 'current');
  assert.equal(detail.creditLimit.value, 1500);
  assert.equal(detail.apr.value, 30.49);
  assert.equal(detail.apr.label, 'Purchase APR');
  assert.equal(detail.lastPayment.amount, 87.33);
  assert.equal(detail.lastPayment.date, '2026-10-02');

  const reviews = O.prepareReviews([MISSION_DETAIL, MISSION_HOME], [], { today: TODAY });
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].fields.balance.value, 1219.54);
  assert.equal(reviews[0].fields.minimum.value, 45.04);
  assert.equal(reviews[0].fields.dueDay.value, 2);
  assert.equal(reviews[0].parsed.dueDate.value, '2026-11-02');
  assert.equal(reviews[0].suggestedName, 'Mission Lane 6529');
});

test('Wells Fargo uses outstanding balance, the purchases APR, and the card last 4', () => {
  const wells = O.parseStatement(WELLS, { today: TODAY });
  assert.equal(wells.lender.value, 'Wells Fargo');
  assert.equal(wells.lenderId, 'wells-fargo');
  assert.equal(wells.product.value, 'Autograph Visa');
  assert.equal(wells.last4.value, '0716');
  assert.equal(wells.balance.value, 2343.2);
  assert.equal(wells.balance.kind, 'outstanding');
  assert.equal(wells.minimum.value, 81);
  assert.equal(wells.dueDate.value, '2026-11-05');
  assert.equal(wells.lastPayment.amount, 121);
  assert.equal(wells.lastPayment.date, '2026-10-06');
  assert.equal(wells.apr.value, 27.99);
  assert.equal(wells.apr.label, 'Purchases APR');
  assert.equal(O.suggestName(wells), 'Wells Fargo Autograph Visa 0716');
});

test('a low-confidence amount is flagged and left unchecked', () => {
  const parsed = O.parseStatement(MISSION_DETAIL, {
    today: TODAY,
    words: [{ text: '$1,219.54', confidence: 41 }, { text: '30.49%', confidence: 96 }],
  });
  assert.equal(parsed.balance.low, true);
  assert.ok(parsed.balance.confidence < O.LOW_CONFIDENCE);
  assert.equal(parsed.apr.low, false);
  const review = O.buildReview(parsed, [], []);
  assert.equal(review.fields.balance.checked, false);
  assert.equal(review.fields.apr.checked, true);
});

test('last 4 matches an existing account, and a different card does not take it', () => {
  const accounts = [
    acct({ id: 'flag', name: 'Navy Federal Flagship 9100', balance: 9000, apr: 18, min: 200, dueDay: 17 }),
    acct({ id: 'lane', name: 'Mission Lane', last4: '6529', balance: 1000, apr: 29.99, min: 40 }),
  ];
  const flagship = O.buildReview(O.parseStatement(NAVY_FLAGSHIP, { today: TODAY }), accounts, []);
  assert.equal(flagship.mode, 'existing');
  assert.equal(flagship.accountId, 'flag');
  assert.equal(flagship.fields.balance.checked, true);
  assert.equal(flagship.fields.balance.current, 9000);
  assert.equal(flagship.fields.apr.checked, false);

  const amex = O.buildReview(O.parseStatement(NAVY_AMEX, { today: TODAY }), accounts, []);
  assert.equal(amex.mode, 'create');
  assert.equal(amex.accountId, null);

  const lane = O.prepareReviews([MISSION_DETAIL, MISSION_HOME], accounts, { today: TODAY })[0];
  assert.equal(lane.accountId, 'lane');
  assert.equal(lane.fields.minimum.checked, true);
  assert.equal(lane.fields.minimum.current, 40);
});

test('a balance update is an adjustment, and a new last payment is offered without moving that balance again', () => {
  const state = {
    accounts: [acct({ id: 'flag', name: 'Navy Federal Flagship 9100', balance: 9000, apr: 18, min: 200, dueDay: 12 })],
    payments: [],
    adjustments: [],
  };
  const review = O.buildReview(O.parseStatement(NAVY_FLAGSHIP, { today: TODAY }), state.accounts, state.payments);
  assert.equal(review.payment.checked, true);
  assert.equal(review.payment.logged, false);
  const applied = O.applyScreenshotUpdate(state, [{
    mode: 'existing',
    accountId: 'flag',
    fields: {
      balance: { on: true, value: review.fields.balance.value },
      apr: { on: true, value: review.fields.apr.value },
      minimum: { on: true, value: review.fields.minimum.value },
      dueDay: { on: true, value: review.fields.dueDay.value },
    },
    payment: { on: true, amount: review.payment.amount, date: review.payment.date },
  }], { today: TODAY });
  const acc = applied.accounts[0];
  assert.equal(acc.balance, 9718.43);
  assert.equal(acc.min, 241.01);
  assert.equal(acc.dueDay, 17);
  assert.equal(applied.adjustments.length, 1);
  assert.equal(applied.adjustments[0].previous, 9000);
  assert.equal(applied.adjustments[0].balance, 9718.43);
  assert.equal(applied.adjustments[0].date, TODAY);
  assert.equal(applied.payments.length, 1);
  assert.equal(applied.payments[0].amount, 245.79);
  assert.equal(applied.payments[0].date, '2026-10-19');
  assert.equal(applied.payments[0].balanceHeld, true);
  assert.equal(applied.payments[0].statement, true);
  assert.equal(acc.balance, 9718.43);
  const series = require('../engine.js').history(applied.accounts, applied.payments, applied.adjustments, new Date(TODAY + 'T12:00:00'))[0];
  assert.ok(series.points.some(p => p.kind === 'edit' && p.balance === 9718.43));
  assert.ok(series.points.some(p => p.kind === 'payment' && p.amount === 245.79));
  assert.ok(series.points.every(p => p.balance === 9718.43));
});

test('a payment that is already logged is not offered or saved again', () => {
  const accounts = [acct({ id: 'lane', name: 'Mission Lane', last4: '6529', balance: 1219.54 })];
  const payments = [{ id: 'p', accountId: 'lane', amount: 87.33, date: '2026-10-02' }];
  const review = O.buildReview(O.parseStatement(MISSION_DETAIL, { today: TODAY }), accounts, payments);
  assert.equal(review.payment.logged, true);
  assert.equal(review.payment.checked, false);
  const applied = O.applyScreenshotUpdate({ accounts, payments, adjustments: [] }, [{
    mode: 'existing', accountId: 'lane', fields: {},
    payment: { on: true, amount: 87.33, date: '2026-10-02' },
  }], { today: TODAY });
  assert.equal(applied.payments.length, 1);
  assert.equal(applied.adjustments.length, 0);
});

test('logging a payment without replacing the balance reduces the balance, and a new card is created from the screenshot', () => {
  const state = { accounts: [], payments: [], adjustments: [] };
  const wells = O.parseStatement(WELLS, { today: TODAY });
  const created = O.applyScreenshotUpdate(state, [{
    mode: 'create',
    name: O.suggestName(wells),
    type: 'Credit card',
    lenderId: wells.lenderId,
    fields: {
      balance: { on: true, value: wells.balance.value },
      apr: { on: true, value: wells.apr.value },
      minimum: { on: true, value: wells.minimum.value },
      dueDay: { on: true, value: wells.dueDay.value },
      last4: { on: true, value: wells.last4.value },
    },
    payment: { on: false },
  }], { today: TODAY, id: () => 'new-wells' });
  assert.equal(created.accounts.length, 1);
  assert.equal(created.accounts[0].name, 'Wells Fargo Autograph Visa 0716');
  assert.equal(created.accounts[0].balance, 2343.2);
  assert.equal(created.accounts[0].start, 2343.2);
  assert.equal(created.accounts[0].apr, 27.99);
  assert.equal(created.accounts[0].min, 81);
  assert.equal(created.accounts[0].dueDay, 5);
  assert.equal(created.accounts[0].last4, '0716');
  assert.equal(created.accounts[0].logo, 'wells-fargo');
  assert.equal(created.adjustments.length, 0);
  assert.equal(created.payments.length, 0);

  const paid = O.applyScreenshotUpdate({
    accounts: [acct({ id: 'flag', name: 'Flagship 9100', balance: 1000 })],
    payments: [], adjustments: [],
  }, [{
    mode: 'existing', accountId: 'flag', fields: {},
    payment: { on: true, amount: 100, date: '2026-10-19', interest: 12, principal: 88, balanceAfter: 912 },
  }], { today: TODAY });
  assert.equal(paid.adjustments.length, 0);
  assert.equal(paid.payments.length, 1);
  assert.equal(paid.payments[0].legacy, false);
  assert.equal(paid.payments[0].balanceAfter, 912);
  assert.equal(paid.accounts[0].balance, 912);
});

test('OCR assets stay on this origin and load only when the feature is opened', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src'));
  assert.match(scriptSrc, /'wasm-unsafe-eval'/);
  assert.equal(scriptSrc.includes("'unsafe-eval'"), false);
  assert.doesNotMatch(scriptSrc, /unsafe-inline/);
  assert.equal(html.includes('tesseract.min.js'), false);
  assert.match(app, /workerBlobURL:\s*false/);
  assert.match(app, /if \(p\.balanceHeld\)/);
  assert.match(app, /data-act="shot"/);
  assert.match(app, /vendor\/tesseract\//);
  assert.doesNotMatch(app, /tessdata\.projectnaptha|cdn\.jsdelivr\.net\/npm\/tesseract/);
  assert.match(sw, /debt-slayer-shell-v7/);
  assert.match(sw, /\.\/ocr\.js/);
  assert.doesNotMatch(sw.slice(0, sw.indexOf('self.addEventListener')), /traineddata|tesseract\.min/);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'vendor/tesseract/eng.traineddata.gz')), true);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js')), true);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'vendor/tesseract/worker.min.js')), true);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'vendor/tesseract/LICENSE'), 'utf8'), /Apache License/);
});
