const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('the app uses the Apple-like stack and self-hosts Inter', () => {
  assert.match(css, /--font:-apple-system,BlinkMacSystemFont,system-ui,"Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif/);
  assert.match(css, /font-family:"Inter"/);
  assert.match(css, /fonts\/Inter-Variable-Latin\.woff2/);
  assert.match(css, /font-variant-numeric:tabular-nums/);
  assert.equal(fs.existsSync(path.join(root, 'fonts', 'Inter-Variable-Latin.woff2')), true);
  const ofl = fs.readFileSync(path.join(root, 'fonts', 'OFL-Inter.txt'), 'utf8');
  assert.match(ofl, /SIL Open Font License/);
  assert.match(sw, /fonts\/Inter-Variable-Latin\.woff2/);
  assert.match(sw, /debt-slayer-shell-v7/);
  const blob = css + html + sw;
  assert.doesNotMatch(blob, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});
