const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../disclose.js');

function doc() {
  const nodes = new Map();
  return {
    getElementById: id => nodes.get(id) || null,
    add(id, el) { el.ownerDocument = this; nodes.set(id, el); return el; },
  };
}
function button(attrs) {
  const a = { ...attrs };
  return {
    ownerDocument: null,
    setAttribute(k, v) { a[k] = String(v); },
    getAttribute(k) { return a[k] == null ? null : a[k]; },
  };
}

test('a disclosure button toggles aria-expanded and the panel', () => {
  const document = doc();
  const panel = { hidden: true, id: 'home-more' };
  document.add('home-more', panel);
  const btn = button({ 'aria-controls': 'home-more', 'aria-expanded': 'false' });
  btn.ownerDocument = document;
  assert.equal(D.toggleDisclosure(btn), true);
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.hidden, false);
  assert.equal(D.toggleDisclosure(btn), false);
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.hidden, true);
  D.setDisclosure(btn, true);
  assert.equal(panel.hidden, false);
});

test('home and account views lead with the headline and hide the rest behind a button', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const home = app.slice(app.indexOf('function viewHome()'), app.indexOf('function simText()'));
  assert.match(home, /Total debt/);
  assert.match(home, /Next payment/);
  assert.match(home, /Debt-free/);
  assert.match(home, /aria-expanded="false"/);
  assert.match(home, /aria-controls="home-more"/);
  assert.match(home, /data-act="disclose"/);
  const detail = app.slice(app.indexOf('function acardHTML'), app.indexOf('function payHistoryHTML'));
  assert.match(detail, /Minimum/);
  assert.match(detail, /Next due/);
  const sheet = app.slice(app.indexOf('function openDetail'), app.indexOf('function isoToDate'));
  assert.match(sheet, /aria-controls="acct-more"/);
  assert.match(sheet, /aria-expanded="false"/);
  assert.match(sheet, /toggleDisclosure/);
  assert.equal(app.includes('function globeHTML'), false);
  assert.equal(app.includes('function homeFeedHTML'), false);
  assert.equal(app.includes('function spearHTML'), false);
});
