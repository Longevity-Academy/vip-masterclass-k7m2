'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/campaign-navigation.js'), 'utf8');
function setup(search, hrefs, vip = true) {
  const base = vip ? '/vip-masterclass-k7m2/' : '/blueprint-november-r4x9/';
  const location = new URL('https://www.longevitylifeacademy.com' + base + 'support/' + search);
  const links = hrefs.map(href => ({ href, getAttribute() { return this.href; }, setAttribute(_, value) { this.href = value; } }));
  const events = {};
  const document = { readyState: 'complete', querySelectorAll: () => links, addEventListener(name, fn) { events[name] = fn; } };
  vm.runInNewContext(source, { location, document, URL, URLSearchParams });
  return { links, events };
}
test('approved invitation carries existing CID, code and optional member through content links', () => {
  const h = setup('?cid=118859&code=MASTERCLASS-VIP&member=1234567', ['../', '/vip-masterclass-k7m2/privacy.html', 'https://www.longevitylifeacademy.com/vip-masterclass-k7m2/']);
  for (const a of h.links) {
    const u = new URL(a.href, 'https://www.longevitylifeacademy.com/vip-masterclass-k7m2/support/');
    assert.equal(u.searchParams.get('cid'), '118859');
    assert.equal(u.searchParams.get('code'), 'MASTERCLASS-VIP');
    assert.equal(u.searchParams.get('member'), '1234567');
  }
});
test('all approved CIDs propagate; missing, wrong and duplicate CID cannot add invitation access', () => {
  for (const [vip, ids] of [[true, ['118853', '118859']], [false, ['118854', '118855', '118860', '118861']]]) {
    const base = vip ? '/vip-masterclass-k7m2/' : '/blueprint-november-r4x9/';
    for (const cid of ids) assert.match(setup('?cid=' + cid, [base], vip).links[0].href, new RegExp('cid=' + cid));
    for (const search of ['', '?cid=999', '?cid=' + ids[0] + '&CID=' + ids[0]]) assert.equal(setup(search, [base], vip).links[0].href, base);
  }
});
test('pure hash anchors, cross-origin links and other campaigns remain byte-for-byte unchanged', () => {
  const hrefs = ['#apply', '#enrollModal', 'https://example.invalid/vip-masterclass-k7m2/', '/blueprint-november-r4x9/', 'mailto:advisor@longevitylifeacademy.com', 'javascript:void(0)'];
  assert.deepEqual(setup('?cid=118853&member=1234567', hrefs).links.map(a => a.href), hrefs);
});
test('relative checkout prefixes and existing destination parameters are preserved without inventing member/code', () => {
  const a = setup('?cid=118854', ['checkout.html?plan=monthly#pay'], false).links[0];
  assert.equal(a.href, 'checkout.html?plan=monthly&cid=118854#pay');
  assert.ok(!a.href.includes('member='));
  assert.ok(!a.href.includes('code='));
});
test('CRM separators and CID case normalize without retaining a conflicting destination CID', () => {
  const a = setup('?code=MASTERCLASS-VIP?CID=118861', ['/blueprint-november-r4x9/?CID=118854&cid=118855#enrollModal'], false).links[0];
  const u = new URL(a.href, 'https://www.longevitylifeacademy.com');
  assert.deepEqual(u.searchParams.getAll('cid'), ['118861']);
  assert.equal(u.searchParams.has('CID'), false);
  assert.equal(u.searchParams.get('code'), 'MASTERCLASS-VIP');
  assert.equal(u.hash, '#enrollModal');
});
test('newly inserted links are decorated on click without cancelling the event', () => {
  const h = setup('?cid=118859', []);
  const a = { href: '../', getAttribute() { return this.href; }, setAttribute(_, value) { this.href = value; } };
  h.events.click({ target: { closest: () => a } });
  assert.equal(a.href, '../?cid=118859');
});
