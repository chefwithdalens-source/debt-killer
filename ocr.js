// Read a bank screenshot's text into account fields. The image never leaves the
// browser; this file only interprets text that on-device OCR already produced.
(function (root) {
  const LOW_CONFIDENCE = 0.72;
  const MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const LENDERS = [
    { id: 'navy-federal', name: 'Navy Federal', re: /navy\s*federal|\bnfcu\b|14\s*day\s+payoff|flagship\s+rewards|more\s+rewards\s+amex/i },
    { id: 'mission-lane', name: 'Mission Lane', re: /mission\s*lane/i },
    { id: 'wells-fargo', name: 'Wells Fargo', re: /wells\s*fargo/i },
    { id: 'capital-one', name: 'Capital One', re: /capital\s*one/i },
    { id: 'american-express', name: 'American Express', re: /american\s*express|\bamex\b/i },
    { id: 'chase', name: 'Chase', re: /\bchase\b/i },
    { id: 'citi', name: 'Citi', re: /\bciti(?:bank)?\b/i },
    { id: 'discover', name: 'Discover', re: /\bdiscover\b/i },
    { id: 'bank-of-america', name: 'Bank of America', re: /bank\s*of\s*america|\bbofa\b/i },
    { id: 'synchrony', name: 'Synchrony', re: /\bsynchrony\b/i },
    { id: 'apple-card', name: 'Apple Card', re: /apple\s*card/i },
  ];

  const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const money = s => {
    const n = Number(String(s).replace(/,/g, ''));
    return Number.isFinite(n) ? r2(n) : null;
  };

  function field(value, label, raw, confidence) {
    const c = confidence == null ? 0.93 : confidence;
    return { value, label, raw: raw || String(value), confidence: c, low: c < LOW_CONFIDENCE };
  }

  function normalize(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[•●∙·]/g, '•')
      .replace(/[–—]/g, '-')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function inferYear(month, day, today) {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? new Date(today + 'T12:00:00') : new Date();
    let year = base.getFullYear();
    const candidate = new Date(year, month - 1, day);
    const aheadDays = (candidate - base) / 864e5;
    if (aheadDays > 60) year -= 1;
    return year;
  }

  function parseDate(raw, today) {
    const s = String(raw || '').replace(/\s+/g, ' ').trim();
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
    if (m) {
      let y = +m[3];
      if (y < 100) y += 2000;
      const month = +m[1], day = +m[2];
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      return iso(y, month, day);
    }
    m = /^(?:[A-Za-z]+,?\s+)?([A-Za-z]+)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(s);
    if (!m) return null;
    const month = MONTHS[m[1].toLowerCase()];
    const day = +m[2];
    if (!month || day < 1 || day > 31) return null;
    const year = m[3] ? +m[3] : inferYear(month, day, today);
    return iso(year, month, day);
  }

  function lenderOf(text) {
    for (const lender of LENDERS) if (lender.re.test(text)) return lender;
    return null;
  }

  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\bVisa\b/g, 'Visa').replace(/\bAmex\b/g, 'Amex').trim();
  }

  function productOf(text) {
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/more\s+rewards\s+amex/i.test(line)) return line.replace(/\s*-\s*\d{4}\s*$/, '').replace(/\s+/g, ' ').trim();
      if (/visa\s+platinum/i.test(line)) return line.replace(/\s*-\s*\d{4}.*$/, '').replace(/\s+/g, ' ').trim();
      if (/flagship\s+rewards/i.test(line)) return line.replace(/\s*-\s*\d{4}.*$/, '').replace(/\s+/g, ' ').trim();
      if (/wells\s*fargo/i.test(line) && /visa|card|autograph/i.test(line)) {
        const cleaned = line
          .replace(/wells\s*fargo/ig, '')
          .replace(/(?:•|\*){2,}\s*\d{4}/g, '')
          .replace(/\.{2,}\s*\d{4}/g, '')
          .replace(/\bcard\b/ig, '')
          .replace(/\s+/g, ' ')
          .trim();
        return titleCase(cleaned);
      }
    }
    return null;
  }

  function last4OfText(text) {
    const patterns = [
      /(?:•{2,}|\*{2,}|\.{2,}|x{2,})\s*(\d{4})\b/i,
      /\(\s*\.{2,}\s*(\d{4})\s*\)/,
      /\(\s*…\s*(\d{4})\s*\)/,
      /(?:^|\n)\s*[^\n$]{0,80}?-\s*(\d{4})\s*(?:\n|$)/,
    ];
    for (const re of patterns) {
      const m = re.exec(text);
      if (m) return { value: m[1], raw: m[0].trim() };
    }
    return null;
  }

  function grab(re, text) {
    const m = re.exec(text);
    return m || null;
  }

  function wordConfidence(value, words) {
    if (!words || !words.length || value == null) return null;
    const target = typeof value === 'number' ? value : null;
    const hits = words.filter(w => {
      const text = String(w.text || '');
      if (target != null) {
        const n = Number(text.replace(/[,$%]/g, '').match(/\d+(?:\.\d+)?/)?.[0]);
        return Number.isFinite(n) && Math.abs(n - target) < 0.001;
      }
      const digits = text.replace(/\D/g, '');
      const want = String(value).replace(/\D/g, '');
      return want && digits && (digits === want || (want.length >= 4 && (digits.includes(want) || want.includes(digits))));
    });
    if (!hits.length) return null;
    return hits.reduce((s, w) => s + (Number(w.confidence) || 0), 0) / hits.length / 100;
  }

  function tune(f, words) {
    if (!f) return null;
    const fromWords = wordConfidence(f.value, words);
    if (fromWords == null) return f;
    const confidence = Math.min(f.confidence, fromWords);
    return { ...f, confidence, low: confidence < LOW_CONFIDENCE };
  }

  function parseStatement(text, opts) {
    opts = opts || {};
    const src = normalize(text);
    const today = opts.today || null;
    const words = opts.words || null;
    const lender = lenderOf(src);
    const product = productOf(src);
    const last4 = last4OfText(src);

    let balance = null;
    const balanceRules = [
      { kind: 'current', label: 'Current balance', re: /current\s+balance\s*\$?\s*([0-9,]+\.\d{2})/i },
      { kind: 'outstanding', label: 'Outstanding balance', re: /\$?\s*([0-9,]+\.\d{2})\s+outstanding\s+balance/i },
      { kind: 'outstanding', label: 'Outstanding balance', re: /outstanding\s+balance\s*\$?\s*([0-9,]+\.\d{2})/i },
      { kind: 'statement', label: 'Statement balance', re: /statement\s+balance\s*\$?\s*([0-9,]+\.\d{2})/i },
      { kind: 'payoff', label: 'Payoff amount', re: /(?:\d+\s*day\s+)?payoff\s+amount\s*\$?\s*([0-9,]+\.\d{2})/i },
    ];
    for (const rule of balanceRules) {
      const m = grab(rule.re, src);
      if (!m) continue;
      const value = money(m[1]);
      if (value == null) continue;
      balance = field(value, rule.label, m[0], 0.93);
      balance.kind = rule.kind;
      break;
    }

    let apr = null;
    const aprRules = [
      { label: 'Purchase APR', re: /purchase\s+apr\s*([0-9]+(?:\.\d+)?)\s*%/i },
      { label: 'Purchases APR', re: /purchases\s+([0-9]+(?:\.\d+)?)\s*%/i },
      { label: 'Interest rate', re: /interest\s+rate\s*([0-9]+(?:\.\d+)?)\s*%/i },
    ];
    for (const rule of aprRules) {
      const m = grab(rule.re, src);
      if (!m) continue;
      const value = Math.round(Number(m[1]) * 100) / 100;
      if (!Number.isFinite(value) || value < 0 || value > 100) continue;
      apr = field(value, rule.label, m[0], 0.93);
      break;
    }

    let minimum = null;
    let due = null;
    const minRules = [
      { re: /minimum\s+payment\s*\$?\s*([0-9,]+\.\d{2})\s+due\s+([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i, money: 1, date: 2, label: 'Minimum payment' },
      { re: /minimum\s+payment\s+due\s+([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})\s+\$?\s*([0-9,]+\.\d{2})/i, money: 2, date: 1, label: 'Minimum payment' },
      { re: /\$?\s*([0-9,]+\.\d{2})\s+minimum\s+due\s+((?:[A-Za-z]+,?\s+)?[A-Za-z]+\.?\s+\d{1,2}(?:,?\s+\d{4})?)/i, money: 1, date: 2, label: 'Minimum payment' },
      { re: /minimum\s+payment\s*\$?\s*([0-9,]+\.\d{2})/i, money: 1, date: 0, label: 'Minimum payment' },
    ];
    for (const rule of minRules) {
      const m = grab(rule.re, src);
      if (!m) continue;
      const value = money(m[rule.money]);
      if (value == null) continue;
      minimum = field(value, rule.label, m[0], 0.93);
      if (rule.date) {
        const parsed = parseDate(m[rule.date], today);
        if (parsed) due = field(parsed, 'Due date', m[rule.date], 0.9);
      }
      break;
    }

    let creditLimit = null;
    const limit = grab(/credit\s+(?:line|limit)\s*\$?\s*([0-9,]+\.\d{2})/i, src);
    if (limit) {
      const value = money(limit[1]);
      if (value != null) creditLimit = field(value, 'Credit limit', limit[0], 0.93);
    }

    let lastPayment = null;
    const payRules = [
      { re: /last\s+payment\s+amount\s*\$?\s*([0-9,]+\.\d{2})\s+on\s+([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i, money: 1, date: 2 },
      { re: /last\s+payment\s+received\s+([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})\s+\$?\s*([0-9,]+\.\d{2})/i, money: 2, date: 1 },
      { re: /last\s+payment\s*\$?\s*([0-9,]+\.\d{2})\s+((?:[A-Za-z]+,?\s+)?[A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})/i, money: 1, date: 2 },
    ];
    for (const rule of payRules) {
      const m = grab(rule.re, src);
      if (!m) continue;
      const amount = money(m[rule.money]);
      const date = parseDate(m[rule.date], today);
      if (amount == null || !date) continue;
      const confidence = 0.93;
      lastPayment = { amount, date, label: 'Last payment', raw: m[0], confidence, low: confidence < LOW_CONFIDENCE };
      break;
    }

    const parsed = {
      lender: lender ? field(lender.name, 'Lender', lender.name, 0.95) : null,
      lenderId: lender ? lender.id : null,
      product: product ? field(product, 'Card', product, 0.9) : null,
      last4: last4 ? field(last4.value, 'Last 4', last4.raw, 0.9) : null,
      balance: tune(balance, words),
      apr: tune(apr, words),
      minimum: tune(minimum, words),
      dueDate: tune(due, words),
      dueDay: due ? tune(field(+due.value.slice(8), 'Due day', due.raw, due.confidence), words) : null,
      creditLimit: tune(creditLimit, words),
      lastPayment: lastPayment ? (() => {
        const amountC = wordConfidence(lastPayment.amount, words);
        const dateC = wordConfidence(lastPayment.date, words);
        const parts = [amountC, dateC].filter(n => n != null);
        const confidence = parts.length ? Math.min(lastPayment.confidence, ...parts) : lastPayment.confidence;
        return { ...lastPayment, confidence, low: confidence < LOW_CONFIDENCE };
      })() : null,
    };
    if (parsed.dueDate && parsed.dueDay) parsed.dueDay.low = parsed.dueDate.low || parsed.dueDay.low;
    return parsed;
  }

  function suggestName(parsed) {
    const lender = parsed.lender && parsed.lender.value;
    const product = parsed.product && parsed.product.value;
    const last4 = parsed.last4 && parsed.last4.value;
    let name = '';
    if (product && lender && product.toLowerCase().includes(lender.toLowerCase())) name = product;
    else name = [lender, product].filter(Boolean).join(' ');
    if (!name) name = last4 ? 'Credit card' : 'New account';
    if (last4 && !name.includes(last4)) name += ' ' + last4;
    return name.replace(/\s+/g, ' ').trim();
  }

  function accountLast4(account) {
    if (!account) return null;
    if (account.last4) return String(account.last4).replace(/\D/g, '').slice(-4);
    const named = String(account.name || '');
    const end = named.match(/(?:^|\D)(\d{4})\s*$/);
    return end ? end[1] : null;
  }

  function productTokens(parsed) {
    const product = (parsed.product && parsed.product.value || '').toLowerCase();
    return ['flagship', 'more rewards', 'platinum', 'autograph', 'visa signature'].filter(t => product.includes(t));
  }

  function matchAccount(parsed, accounts) {
    const list = accounts || [];
    const scored = list.map(account => {
      let score = 0;
      const reasons = [];
      const want = parsed.last4 && parsed.last4.value;
      const have = accountLast4(account);
      if (want && have && want === have) { score += 100; reasons.push('last4'); }
      else if (want && have && want !== have) { score -= 40; reasons.push('different last4'); }
      const lender = parsed.lender && parsed.lender.value;
      if (lender && String(account.name || '').toLowerCase().includes(lender.toLowerCase())) { score += 30; reasons.push('lender'); }
      productTokens(parsed).forEach(token => {
        if (String(account.name || '').toLowerCase().includes(token)) { score += 20; reasons.push(token); }
      });
      return { account, score, reasons };
    }).filter(row => row.score >= 40);
    scored.sort((a, b) => b.score - a.score);
    if (!scored.length) return { account: null, score: 0, reasons: [], ambiguous: false };
    if (scored.length > 1 && scored[0].score === scored[1].score) return { account: null, score: scored[0].score, reasons: [], ambiguous: true };
    return { account: scored[0].account, score: scored[0].score, reasons: scored[0].reasons, ambiguous: false };
  }

  function preferField(a, b) {
    if (!a || a.value == null || a.value === '') return b || null;
    if (!b || b.value == null || b.value === '') return a;
    return b.confidence > a.confidence ? b : a;
  }
  function preferAny(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return (b.confidence || 0) > (a.confidence || 0) ? b : a;
  }

  function mergePair(a, b) {
    const out = { ...a, lenderId: a.lenderId || b.lenderId || null, sources: [...(a.sources || []), ...(b.sources || [])] };
    ['lender', 'product', 'last4', 'balance', 'apr', 'minimum', 'dueDate', 'dueDay', 'creditLimit'].forEach(key => {
      out[key] = preferField(a[key], b[key]);
    });
    out.lastPayment = preferAny(a.lastPayment, b.lastPayment);
    return out;
  }

  function mergeStatements(list) {
    const groups = [];
    const byLast4 = new Map();
    const loose = [];
    (list || []).forEach(parsed => {
      const key = parsed.last4 && parsed.last4.value;
      if (!key) { loose.push(parsed); return; }
      if (byLast4.has(key)) groups[byLast4.get(key)] = mergePair(groups[byLast4.get(key)], parsed);
      else { byLast4.set(key, groups.length); groups.push(parsed); }
    });
    loose.forEach(parsed => {
      const lender = parsed.lender && parsed.lender.value;
      const hits = lender ? groups.filter(g => g.lender && g.lender.value === lender) : [];
      if (hits.length === 1) {
        const i = groups.indexOf(hits[0]);
        groups[i] = mergePair(hits[0], parsed);
      } else groups.push(parsed);
    });
    return groups;
  }

  function currentOf(account, key) {
    if (!account) return null;
    if (key === 'minimum') return account.min;
    if (key === 'last4') return accountLast4(account);
    return account[key] == null || account[key] === '' ? null : account[key];
  }

  function differs(key, next, current) {
    if (current == null || current === '') return true;
    if (key === 'last4' || key === 'dueDay') return String(current) !== String(next);
    return Math.abs(Number(current) - Number(next)) > 0.009;
  }

  function paymentLogged(payments, accountId, amount, date) {
    return (payments || []).some(p => p && p.accountId === accountId && p.date === date && Math.abs(Number(p.amount) - Number(amount)) < 0.02);
  }

  function buildReview(parsed, accounts, payments) {
    const match = matchAccount(parsed, accounts);
    const account = match.account;
    const fields = {};
    [['balance', 'balance'], ['apr', 'apr'], ['minimum', 'minimum'], ['dueDay', 'dueDay'], ['creditLimit', 'creditLimit'], ['last4', 'last4']].forEach(([key]) => {
      const src = parsed[key];
      if (!src || src.value == null || src.value === '') return;
      const current = currentOf(account, key);
      const changed = differs(key, src.value, current);
      fields[key] = { ...src, current, checked: !src.low && (account ? changed : true) };
    });
    let payment = null;
    if (parsed.lastPayment) {
      const logged = account ? paymentLogged(payments, account.id, parsed.lastPayment.amount, parsed.lastPayment.date) : false;
      payment = { ...parsed.lastPayment, logged, checked: !parsed.lastPayment.low && !logged };
    }
    return {
      parsed, match, fields, payment,
      suggestedName: suggestName(parsed),
      mode: account ? 'existing' : 'create',
      accountId: account ? account.id : null,
      sources: parsed.sources || [],
    };
  }

  function prepareReviews(items, accounts, opts) {
    opts = opts || {};
    const parsed = (items || []).map((item, i) => {
      const text = typeof item === 'string' ? item : item.text;
      const words = typeof item === 'string' ? null : item.words;
      const one = parseStatement(text, { today: opts.today, words });
      one.sources = [i];
      return one;
    });
    return mergeStatements(parsed).map(one => buildReview(one, accounts || [], opts.payments || []));
  }

  function numOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function applyScreenshotUpdate(state, cards, opts) {
    opts = opts || {};
    const today = opts.today || new Date().toISOString().slice(0, 10);
    let n = 0;
    const nextId = () => (typeof opts.id === 'function' ? opts.id() : 'shot-' + (n++));
    const accounts = (state.accounts || []).map(a => ({ ...a }));
    const payments = (state.payments || []).map(p => ({ ...p }));
    const adjustments = (state.adjustments || []).map(a => ({ ...a }));
    const touched = [];

    (cards || []).forEach(card => {
      const fields = card.fields || {};
      const balanceOn = fields.balance && fields.balance.on;
      const balanceValue = balanceOn ? numOrNull(fields.balance.value) : null;
      let acc = null;
      if (card.mode === 'create') {
        const name = String(card.name || '').trim();
        if (!name || balanceValue == null || balanceValue < 0) return;
        acc = {
          id: nextId(), name, type: card.type || 'Credit card',
          start: r2(balanceValue), balance: r2(balanceValue), min: 0, apr: 0, dueDay: null,
          tier: null, created: today,
        };
        if (card.lenderId) acc.logo = card.lenderId;
        accounts.push(acc);
      } else {
        acc = accounts.find(a => a.id === card.accountId);
        if (!acc) return;
      }

      if (balanceOn && card.mode !== 'create') {
        const next = r2(balanceValue);
        const prev = r2(acc.balance || 0);
        if (Math.abs(next - prev) > 0.004) {
          adjustments.push({ id: nextId(), accountId: acc.id, date: today, balance: next, previous: prev });
          acc.balance = next;
          if (next > Number(acc.start || 0)) acc.start = next;
        }
      }

      if (fields.apr && fields.apr.on) {
        const apr = numOrNull(fields.apr.value);
        if (apr != null && apr >= 0 && apr <= 100) acc.apr = r2(apr);
      }
      if (fields.minimum && fields.minimum.on) {
        const min = numOrNull(fields.minimum.value);
        if (min != null && min >= 0) acc.min = r2(min);
      }
      if (fields.dueDay && fields.dueDay.on) {
        const day = Math.round(numOrNull(fields.dueDay.value) || 0);
        if (day >= 1 && day <= 31) acc.dueDay = day;
      }
      if (fields.creditLimit && fields.creditLimit.on) {
        const limit = numOrNull(fields.creditLimit.value);
        if (limit != null && limit >= 0) acc.creditLimit = r2(limit);
      }
      if (fields.last4 && fields.last4.on) {
        const digits = String(fields.last4.value || '').replace(/\D/g, '').slice(-4);
        if (digits.length === 4) acc.last4 = digits;
      }

      const pay = card.payment;
      if (pay && pay.on) {
        const amount = numOrNull(pay.amount);
        const date = String(pay.date || '');
        if (amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && !paymentLogged(payments, acc.id, amount, date)) {
          const balanceHeld = !!balanceOn;
          const row = {
            id: nextId(), accountId: acc.id, amount: r2(amount), date,
            interest: r2(pay.interest || 0),
            principal: r2(pay.principal != null ? pay.principal : amount),
            statement: true,
          };
          if (balanceHeld) {
            row.legacy = true;
            row.balanceHeld = true;
          } else if (pay.balanceAfter != null) {
            row.legacy = false;
            row.balanceAfter = r2(pay.balanceAfter);
            acc.balance = row.balanceAfter;
          } else {
            row.legacy = true;
            row.interest = 0;
            row.principal = r2(amount);
            acc.balance = r2(Math.max(0, Number(acc.balance || 0) - amount));
          }
          payments.push(row);
        }
      }
      touched.push(acc.id);
    });

    return { accounts, payments, adjustments, touched };
  }

  const api = {
    LOW_CONFIDENCE, parseStatement, mergeStatements, matchAccount, buildReview,
    prepareReviews, applyScreenshotUpdate, suggestName, parseDate, accountLast4,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DebtOcr = api;
})(typeof window !== 'undefined' ? window : globalThis);
