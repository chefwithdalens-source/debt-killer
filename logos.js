// Local lender marks. Matching stays on this device; names are never sent out.
// PayPal's icon is the Simple Icons mark (CC0), same as the other bundled SVGs.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DebtLogos = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LENDERS = [
    { id: 'navy-federal', file: 'navy-federal.png', label: 'Navy Federal', re: /navy\s*federal|\bnfcu\b/i },
    { id: 'affirm', file: 'affirm.png', label: 'Affirm', re: /\baffirm\b/i },
    { id: 'klarna', file: 'klarna.svg', label: 'Klarna', re: /\bklarna\b/i },
    { id: 'afterpay', file: 'afterpay.svg', label: 'Afterpay', re: /after\s*pay/i },
    { id: 'paypal', file: 'paypal.svg', label: 'PayPal', re: /pay\s*pal/i },
    { id: 'capital-one', file: 'capital-one.png', label: 'Capital One', re: /capital\s*one|\bcap\s*one\b/i },
    { id: 'mission-lane', file: 'mission-lane.png', label: 'Mission Lane', re: /mission\s*lane/i },
    { id: 'synchrony', file: 'synchrony.png', label: 'Synchrony', re: /synchrony/i },
    { id: 'apple-card', file: 'apple-card.svg', label: 'Apple Card', re: /apple\s*card/i },
    { id: 'chase', file: 'chase.svg', label: 'Chase', re: /\bchase\b/i },
    { id: 'citi', file: 'citi.svg', label: 'Citi', re: /\bciti(?:bank)?\b/i },
    { id: 'discover', file: 'discover.svg', label: 'Discover', re: /\bdiscover\b/i },
    { id: 'wells-fargo', file: 'wells-fargo.svg', label: 'Wells Fargo', re: /wells\s*fargo/i },
    { id: 'bank-of-america', file: 'bank-of-america.svg', label: 'Bank of America', re: /bank\s*of\s*america|\bbofa\b|\bboa\b/i },
    { id: 'best-buy', file: 'best-buy.svg', label: 'Best Buy', re: /best\s*buy/i },
    { id: 'target', file: 'target.svg', label: 'Target', re: /\btarget\b/i },
    { id: 'american-express', file: 'american-express.svg', label: 'American Express', re: /\bamex\b|american\s*express/i },
  ];

  const TYPE_GLYPHS = {
    Medical: '<svg class="lender-glyph" viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M5 1h2v4h4v2H7v4H5V7H1V5h4z"/></svg>',
    'Auto loan': '<svg class="lender-glyph" viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M2.2 7.1 3.4 4.4A1 1 0 0 1 4.3 3.8h3.4a1 1 0 0 1 .9.6L9.8 7.1v1.7H8.9a1.15 1.15 0 0 1-2.2 0H5.3a1.15 1.15 0 0 1-2.2 0H2.2z"/></svg>',
    'Student loan': '<svg class="lender-glyph" viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M6 1.3 1.2 3.6 6 5.9l4.8-2.3zM2.4 6.1v2c0 .7 1.6 1.5 3.6 1.5s3.6-.8 3.6-1.5v-2L6 8z"/></svg>',
    'Personal loan': '<svg class="lender-glyph" viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M2 5.3 6 2.4l4 2.9V10H7.3V7.1H4.7V10H2z"/></svg>',
  };

  function firstLetter(name) {
    const m = String(name || '').trim().match(/[A-Za-z0-9]/);
    return m ? m[0].toUpperCase() : '?';
  }

  function byId(id) {
    return LENDERS.find(l => l.id === id) || null;
  }

  function sanitizeLogo(value) {
    if (value === 'none') return 'none';
    return byId(value) ? value : null;
  }

  function matchLender(name) {
    const text = String(name || '');
    for (const lender of LENDERS) if (lender.re.test(text)) return lender;
    return null;
  }

  function fallback(account) {
    const type = account && account.type || '';
    const glyph = Object.prototype.hasOwnProperty.call(TYPE_GLYPHS, type) ? type : null;
    return { kind: glyph ? 'type' : 'monogram', letter: firstLetter(account && account.name), type, glyph };
  }

  function resolveMark(account) {
    const a = account || {};
    const chosen = sanitizeLogo(a.logo);
    if (chosen === 'none') return fallback(a);
    if (chosen) {
      const lender = byId(chosen);
      return { kind: 'logo', id: lender.id, file: lender.file, label: lender.label, letter: firstLetter(a.name) };
    }
    const lender = matchLender(a.name);
    if (lender) return { kind: 'logo', id: lender.id, file: lender.file, label: lender.label, letter: firstLetter(a.name) };
    return fallback(a);
  }

  function glyphSVG(type) {
    return TYPE_GLYPHS[type] || '';
  }

  return { LENDERS, TYPE_GLYPHS, firstLetter, sanitizeLogo, matchLender, resolveMark, glyphSVG };
});
