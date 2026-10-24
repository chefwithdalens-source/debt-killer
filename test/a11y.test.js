const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function lin(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function lum(hex) {
  const n = hex.replace('#', '');
  return 0.2126 * lin(parseInt(n.slice(0, 2), 16)) + 0.7152 * lin(parseInt(n.slice(2, 4), 16)) + 0.0722 * lin(parseInt(n.slice(4, 6), 16));
}
function contrast(a, b) {
  const L1 = lum(a), L2 = lum(b);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

test('due-this-week text meets WCAG AA on the page and on the chip', () => {
  const light = css.match(/(?<!\[data-theme=dark\] )\.u-week\{color:(#[0-9A-Fa-f]{6})\}/g).pop();
  const dark = css.match(/\[data-theme=dark\] \.u-week\{color:(#[0-9A-Fa-f]{6})\}/g).pop();
  const chip = css.match(/\.due\.due-week\{background:(#[0-9A-Fa-f]{6});color:(#[0-9A-Fa-f]{6})\}/g).pop();
  const chipDark = css.match(/\[data-theme=dark\] \.due\.due-week\{background:(#[0-9A-Fa-f]{6});color:(#[0-9A-Fa-f]{6})\}/g).pop();
  const lightText = light.match(/#[0-9A-Fa-f]{6}/)[0];
  const darkText = dark.match(/#[0-9A-Fa-f]{6}/)[0];
  const chipBg = chip.match(/#[0-9A-Fa-f]{6}/g)[0];
  const chipFg = chip.match(/#[0-9A-Fa-f]{6}/g)[1];
  const chipDarkBg = chipDark.match(/#[0-9A-Fa-f]{6}/g)[0];
  const chipDarkFg = chipDark.match(/#[0-9A-Fa-f]{6}/g)[1];
  assert.ok(contrast(lightText, '#FFFFFF') >= 4.5, lightText + ' on white');
  assert.ok(contrast(lightText, '#f4f2ee') >= 4.5, lightText + ' on the warm page');
  assert.ok(contrast(chipFg, chipBg) >= 4.5, chipFg + ' on ' + chipBg);
  assert.ok(contrast(darkText, '#121419') >= 4.5, darkText + ' on charcoal');
  assert.ok(contrast(darkText, '#1B1E26') >= 4.5, darkText + ' on the dark card');
  assert.ok(contrast(chipDarkFg, chipDarkBg) >= 4.5, chipDarkFg + ' on ' + chipDarkBg);
});

test('the page sets a content security policy and has no inline handlers', () => {
  const meta = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(meta, 'CSP meta tag');
  const csp = meta[1];
  assert.match(csp, /script-src [^;]*'self'/);
  assert.match(csp, /script-src [^;]*https:\/\/cdn\.jsdelivr\.net/);
  assert.doesNotMatch(csp.split(';').find(d => d.trim().startsWith('script-src')), /unsafe-inline/);
  assert.match(csp, /connect-src [^;]*https:\/\/\*\.supabase\.co/);
  assert.match(csp, /connect-src [^;]*wss:\/\/\*\.supabase\.co/);
  assert.match(csp, /worker-src [^;]*'self'/);
  assert.equal(html.includes('onclick='), false);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'sw.js')), true);
});

test('the service worker caches the shell for offline use and keeps data off the cache', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.match(sw, /request\.method !== 'GET'/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /url\.search/);
  assert.match(sw, /caches\.delete/);
  assert.match(sw, /await fetch\(request\)/);
  assert.match(sw, /debt-slayer-shell-v3/);
  assert.doesNotMatch(sw, /localStorage\./);
});
