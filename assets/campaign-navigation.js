/* Preserve an existing invitation through campaign content pages.
 * Navigation only: no storage, eligibility, form, CRM or payment behavior. */
(function () {
  'use strict';
  var vip = location.pathname.indexOf('/vip-masterclass-k7m2/') === 0;
  var base = vip ? '/vip-masterclass-k7m2/' : '/blueprint-november-r4x9/';
  if (location.pathname.indexOf(base) !== 0) return;
  var allowed = vip ? ['118853', '118859'] : ['118854', '118855', '118860', '118861'];
  var query = String(location.search || '').replace(/^\?/, '').replace(/\?(?=[A-Za-z_][A-Za-z0-9_]*=)/g, '&').replace(/&amp;/gi, '&');
  var params = new URLSearchParams(query), cids = [];
  params.forEach(function (value, key) { if (key.toLowerCase() === 'cid') cids.push(value); });
  if (cids.length !== 1 || allowed.indexOf(cids[0]) === -1) return;
  var cid = cids[0];
  function decorate(a) {
    if (!a) return;
    var raw = a.getAttribute('href');
    if (!raw || raw.charAt(0) === '#') return;
    try {
      var u = new URL(raw, location.href);
      if (u.origin !== location.origin || u.pathname.indexOf(base) !== 0) return;
      var keys = [];
      u.searchParams.forEach(function (_, key) { if (key.toLowerCase() === 'cid') keys.push(key); });
      keys.forEach(function (key) { u.searchParams.delete(key); });
      u.searchParams.set('cid', cid);
      ['code', 'member'].forEach(function (key) {
        if (params.has(key)) u.searchParams.set(key, params.get(key));
      });
      // Keep relative href prefixes: existing checkout handlers depend on them.
      a.setAttribute('href', raw.split(/[?#]/)[0] + u.search + u.hash);
    } catch (e) {}
  }
  function all() { document.querySelectorAll('a[href]').forEach(decorate); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all);
  else all();
  ['click', 'auxclick', 'contextmenu'].forEach(function (name) {
    document.addEventListener(name, function (event) {
      decorate(event.target && event.target.closest ? event.target.closest('a[href]') : null);
    }, true);
  });
})();
