// Open and close a disclosure. The control is a real button; the panel follows aria-expanded.
(function (root) {
  'use strict';

  function panelFor(button) {
    const id = button && button.getAttribute && button.getAttribute('aria-controls');
    const doc = button && button.ownerDocument;
    return id && doc && doc.getElementById ? doc.getElementById(id) : null;
  }

  function setDisclosure(button, open) {
    const next = !!open;
    button.setAttribute('aria-expanded', next ? 'true' : 'false');
    const panel = panelFor(button);
    if (panel) panel.hidden = !next;
    return next;
  }

  function toggleDisclosure(button) {
    return setDisclosure(button, button.getAttribute('aria-expanded') !== 'true');
  }

  const api = { setDisclosure, toggleDisclosure };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DebtDisclose = api;
})(typeof window !== 'undefined' ? window : globalThis);
