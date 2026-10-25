const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const logos = require('../logos.js');

const root = path.join(__dirname, '..');

test('known lenders match by name, including aliases, and issuers win over stores', () => {
  const id = name => logos.resolveMark({ name }).id;
  assert.equal(id('Affirm'), 'affirm');
  assert.equal(id('affirm monthly'), 'affirm');
  assert.equal(id('Affirm (Target)'), 'affirm');
  assert.equal(id('Klarna'), 'klarna');
  assert.equal(id('AfterPay'), 'afterpay');
  assert.equal(id('PayPal Credit'), 'paypal');
  assert.equal(id('Apple Card'), 'apple-card');
  assert.equal(id('Chase Sapphire'), 'chase');
  assert.equal(id('Cap One Quicksilver'), 'capital-one');
  assert.equal(id('Capital One'), 'capital-one');
  assert.equal(id('Amex Gold'), 'american-express');
  assert.equal(id('American Express'), 'american-express');
  assert.equal(id('Discover it'), 'discover');
  assert.equal(id('Citi Double Cash'), 'citi');
  assert.equal(id('Citibank'), 'citi');
  assert.equal(id('BofA Visa'), 'bank-of-america');
  assert.equal(id('Bank of America'), 'bank-of-america');
  assert.equal(id('Wells Fargo Autograph'), 'wells-fargo');
  assert.equal(id('Synchrony'), 'synchrony');
  assert.equal(id('Navy Federal Amex'), 'navy-federal');
  assert.equal(id('NFCU'), 'navy-federal');
  assert.equal(id('Mission Lane'), 'mission-lane');
  assert.equal(id('Best Buy card'), 'best-buy');
  assert.equal(id('Target RedCard'), 'target');
});

test('unknown names fall back to a first letter, with a type icon for medical and loans', () => {
  const visa = logos.resolveMark({ name: 'Example Visa', type: 'Credit card' });
  assert.equal(visa.kind, 'monogram');
  assert.equal(visa.letter, 'E');
  assert.equal(visa.glyph, null);

  const clinic = logos.resolveMark({ name: "St. Mary's Clinic", type: 'Medical' });
  assert.equal(clinic.kind, 'type');
  assert.equal(clinic.letter, 'S');
  assert.equal(clinic.glyph, 'Medical');
  assert.match(logos.glyphSVG('Medical'), /<svg/);

  for (const type of ['Auto loan', 'Student loan', 'Personal loan']) {
    const mark = logos.resolveMark({ name: 'Demo ' + type, type });
    assert.equal(mark.kind, 'type', type);
    assert.equal(mark.letter, 'D');
    assert.equal(mark.glyph, type);
    assert.match(logos.glyphSVG(type), /<svg/);
  }

  assert.equal(logos.resolveMark({ name: 'Sample Phone Plan', type: 'Buy now pay later' }).kind, 'monogram');
  assert.equal(logos.firstLetter(''), '?');
});

test('a chosen logo overrides the name, and an unknown choice is ignored', () => {
  assert.equal(logos.resolveMark({ name: 'Example Visa', logo: 'chase' }).id, 'chase');
  assert.equal(logos.resolveMark({ name: 'Chase Sapphire', logo: 'none' }).kind, 'monogram');
  assert.equal(logos.resolveMark({ name: 'Chase Sapphire', logo: 'https://evil.example/logo.svg' }).id, 'chase');
  assert.equal(logos.sanitizeLogo('../secrets'), null);
  assert.equal(logos.sanitizeLogo('paypal'), 'paypal');
});

test('every lender file is local and the service worker precaches it', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /debt-slayer-shell-v7/);
  assert.match(sw, /\.\/logos\.js/);
  for (const lender of logos.LENDERS) {
    assert.equal(lender.file.includes('..'), false);
    assert.equal(fs.existsSync(path.join(root, 'logos', lender.file)), true, lender.file);
    assert.match(sw, new RegExp('./logos/' + lender.file.replace('.', '\\.')));
  }
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(app, /DebtLogos\.resolveMark/);
  assert.match(app, /id="f_logo"/);
  assert.match(app, /class="calm-name"/);
  assert.match(app, /class="snap-who"/);
  assert.match(css, /\.snap \.lender-mark\{display:none!important\}/);
  assert.doesNotMatch(app + sw, /https?:\/\/[^'")\s]*logo/i);
});
