'use strict';
// Offline contract regression. Every network call is intercepted; no CRM/AC mutations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const planScript = scripts.find(s => s.includes('window.LLA_PLAN = (function'));
const ecommScript = scripts.find(s => s.includes('LLA self-service checkout'));
function storage() {
  const data = new Map();
  return { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}
function harness({ dedicated = true, failOrder = false, failAssign = false, search = '?cid=118853&member=1234567' } = {}) {
  const elements = new Map(), events = {}, requests = [], ac = [];
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { id, value: '', checked: false, textContent: '', style: {},
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
        querySelector: () => element(id + '-heading'), querySelectorAll: () => [element(id + '-paragraph')] });
    }
    return elements.get(id);
  }
  const ctx = {
    URL, URLSearchParams, Date, Promise, JSON, console,
    navigator: { userAgent: 'offline-mock' }, sessionStorage: storage(), localStorage: storage(),
    location: { search, href: 'https://www.longevitylifeacademy.com/vip-masterclass-k7m2/' + search,
      hostname: 'www.longevitylifeacademy.com' },
    document: { referrer: '', getElementById: element, querySelector: () => element('course-name'),
      body: { style: {} }, addEventListener: (name, fn) => (events[name] ||= []).push(fn) },
    setInterval: () => 0, setTimeout: fn => { fn(); return 0; },
    JulieInternationalCheckout: { personal: () => ({ e164: '+12125550123', stateCode: 'NY' }), applyPayload: () => {} },
    LLA_AC: { send: name => ac.push(name) },
    LLA_CAMPAIGN_ACCESS: { allowed: true, cid: '118853' },
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      if (url.endsWith('/api/lead/ecomm')) {
        if (failOrder) throw new Error('mock_timeout');
        return { status: 200, json: async () => ({ stid: '1234567', orderid: '7654321' }) };
      }
      if (url.endsWith('/api/checkout/assign')) return { ok: !failAssign, status: failAssign ? 503 : 204 };
      throw new Error('UNEXPECTED_ENDPOINT: ' + url);
    }
  };
  ctx.window = ctx;
  const invitedMember = new URLSearchParams(search).get('member');
  if (invitedMember) ctx.sessionStorage.setItem('lla_member_id', invitedMember);
  vm.createContext(ctx);
  vm.runInContext(planScript.replace('window.JULIE_FREE_VIP = true;', 'window.JULIE_FREE_VIP = ' + dedicated + ';'), ctx);
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../assets/julie-payment-safety.js'), 'utf8'), ctx);
  vm.runInContext(ecommScript, ctx);
  element('emName').value = 'Offline Contract';
  element('emEmail').value = 'offline-contract@example.invalid';
  element('emPhone').value = '2125550123';
  element('emDate').value = 'November 14, 2026 · 12:00 PM ET';
  const fields = { fullName: element('emName').value, email: element('emEmail').value,
    phone: element('emPhone').value, startDate: element('emDate').value };
  function guest() {
    vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../assets/julie-guest-access.js'), 'utf8'), ctx);
  }
  async function click(id) {
    let stopped = false, prevented = false;
    const ev = { target: { closest: () => element(id) },
      stopPropagation: () => { stopped = true; }, preventDefault: () => { prevented = true; } };
    for (const fn of events.click || []) fn(ev);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    return { stopped, prevented };
  }
  return { ctx, element, requests, ac, fields, guest, click };
}
test('no query token: VIP is default and Standard CTA cannot downgrade it', () => {
  const h = harness();
  assert.equal(h.ctx.LLA_PLAN.get().id, 'vip');
  assert.equal(h.ctx.LLA_PLAN.get().value, 0);
  h.ctx.LLA_PLAN.apply('standard');
  assert.equal(h.ctx.LLA_PLAN.get().id, 'vip');
});
test('real zero-dollar order DTO, 100% discount metadata and Nov14 identity', async () => {
  const h = harness();
  assert.equal(h.ctx.LLA_ECOMM.validateLead(h.fields).ok, true);
  const result = await h.ctx.LLA_ECOMM.submitLead(h.fields); // no promo field required
  assert.equal(result.ok, true);
  const p = h.requests[0].body;
  assert.equal(p.FirstPayment, 0);
  assert.equal(p.NumberOfPayments, 0);
  assert.equal(p.LeftToPay, 0);
  assert.equal(p.DiscountPercent, 100);
  assert.equal(p.StudentId, 1234567);
  assert.equal(p.MainAbroadCourseId, 283);
  assert.equal(p.AbroadCourseId, 1823);
  assert.equal(p.PreferredCourseId, 170142);
  assert.equal(p.PrefferdCourseID, 170142);
  assert.equal(p.SemesterID, 2394);
  assert.match(p.DynamicParameters, /masterclassplan=vip/);
  assert.match(p.DynamicParameters, /masterclassdiscountpercent=100(?:&|$)/);
  assert.match(p.DynamicParameters, /masterclassdiscountamount=79(?:&|$)/);
});
test('guest registration bypasses payments, assigns class, and deduplicates orders', async () => {
  const h = harness(); h.guest();
  assert.equal(h.element('emPromo').value, 'GUESTLIST');
  assert.equal(h.element('emPromo').readOnly, true);
  assert.equal(h.element('checkoutPackageTitle').textContent, 'FREE VIP Masterclass Access');
  const event = await h.click('emGo2');
  assert.deepEqual(event, { stopped: true, prevented: true });
  assert.equal(h.requests.length, 2);
  assert.match(h.requests[0].url, /\/api\/lead\/ecomm$/);
  assert.match(h.requests[1].url, /\/api\/checkout\/assign$/);
  assert.equal(h.requests[1].body.SecondaryCourseID, 170142);
  assert.equal(h.requests[1].body.StudentID, 1234567);
  assert.equal(h.requests[1].body.OrderID, 7654321);
  assert.equal(h.element('ckDone').style.display, 'block');
  assert.match(h.element('ckDone-paragraph').textContent, /FREE VIP/);
  await h.click('emGo2');
  assert.equal(h.requests.length, 2);
});
test('uncertain order timeout is never replayed, even on a second click', async () => {
  const h = harness({ failOrder: true }); h.guest();
  await h.click('emGo2');
  await h.click('emGo2');
  assert.equal(h.requests.length, 1);
  assert.match(h.element('emErr2').textContent, /may already be in/);
  assert.notEqual(h.element('ckDone').style.display, 'block');
});
test('failed class assignment cannot show registration confirmed', async () => {
  const h = harness({ failAssign: true }); h.guest();
  await h.click('emGo2');
  assert.equal(h.requests.filter(r => r.url.endsWith('/api/lead/ecomm')).length, 1);
  assert.equal(h.requests.filter(r => r.url.endsWith('/api/checkout/assign')).length, 3);
  assert.notEqual(h.element('ckDone').style.display, 'block');
  assert.match(h.element('emErr2').textContent, /could not confirm/);
});
test('staging remains isolated and all requests are mocked', async () => {
  const h = harness({ search: '?env=staging&utm_source=offline&cid=118853&member=1234567' }); h.guest();
  await h.click('emGo2');
  assert.equal(h.requests.length, 2);
  for (const request of h.requests) assert.match(request.url, /\/staging\/api\//);
});
test('paid-mode fallback still prices Standard at49 and VIP at79', async () => {
  const h = harness({ dedicated: false });
  h.ctx.LLA_PLAN.apply('standard');
  await h.ctx.LLA_ECOMM.submitLead(h.fields);
  assert.equal(h.requests[0].body.FirstPayment, 49);
  assert.equal(h.requests[0].body.NumberOfPayments, 1);
  assert.equal(h.requests[0].body.DiscountPercent, undefined);
  h.ctx.LLA_PLAN.apply('vip');
  await h.ctx.LLA_ECOMM.submitLead(h.fields);
  assert.equal(h.requests[1].body.FirstPayment, 79);
  assert.equal(h.requests[1].body.DiscountPercent, undefined);
});
test('missing personal member invitation cannot create a new member or order', async () => {
  const h = harness({ search: '?cid=118853' }); h.guest();
  await h.click('emGo2');
  assert.equal(h.requests.length, 0);
  assert.match(h.element('emErr2').textContent, /personal invitation/);
  const result = await h.ctx.LLA_ECOMM.submitLead(h.fields);
  assert.equal(result.error, 'member_invitation_required');
  assert.equal(h.requests.length, 0);
});
test('unapproved campaign cannot create an order', async () => {
  const h = harness(); h.ctx.LLA_CAMPAIGN_ACCESS.allowed = false; h.guest();
  await h.click('emGo2');
  assert.equal(h.requests.length, 0);
  const result = await h.ctx.LLA_ECOMM.submitLead(h.fields);
  assert.equal(result.error, 'campaign_not_allowed');
});
