/* Guest access: a hashed, time-limited access code applied through the existing
 * "I have promo code" field. Not referenced anywhere in page copy. When valid,
 * the CRM lead/order is created exactly as today (notes carry the code) and the
 * buyer skips the card form. No Meta events, no charge, no change to pricing. */
(function () {
  'use strict';
  var HASHES = ['e74dc39609ebb5ece7a9f1af4bfc3cfbec7627f0c9588958b099986292073374'];
  var EXPIRES_AT = Date.UTC(2026, 10, 15, 21, 59, 59); /* 2026-11-15 23:59:59 Israel */
  var dedicatedVIP = window.JULIE_FREE_VIP === true;
  var active = dedicatedVIP ? 'GUESTLIST' : '';
  function $(id) { return document.getElementById(id); }
  function norm(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function sha256(s) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function fields() {
    return {
      fullName: $('emName').value, email: $('emEmail').value, phone: $('emPhone').value,
      smsConsent: $('emSms').checked, startDate: ($('emDate') || {}).value || '',
      promoCode: active ? (active + ' (guest access, 100%)') : ''
    };
  }
  function setErr(msg) { var e = $('emErr2'); e.textContent = msg; e.classList.add('on'); }
  function reflect() {
    var tu = $('emTuition'), go = $('emGo2'), ap = $('emApply');
    if (active) {
      if (tu) tu.textContent = dedicatedVIP ? '$0.00 · FREE VIP access' : '$0.00 · Guest access';
      if (go) go.textContent = 'Complete registration';
      if (ap) ap.textContent = 'Applied';
      if (dedicatedVIP) {
        if ($('checkoutPackageTitle')) $('checkoutPackageTitle').textContent = 'FREE VIP Masterclass Access';
        if ($('checkoutPackageSummary')) $('checkoutPackageSummary').textContent = '$0 / 60-minute class + 30-minute private Q&A';
      }
    }
  }
  function finish(ids) {
    var m = $('enrollModal'), ck = $('ckScreen'), order = $('ckOrder'), done = $('ckDone');
    var plan = (window.LLA_PLAN && LLA_PLAN.get && LLA_PLAN.get()) || {};
    var h = done.querySelector('h1'), ps = done.querySelectorAll('p');
    if (h) h.textContent = 'Registration confirmed';
    if (ps[0]) ps[0].textContent = 'Your ' + (dedicatedVIP ? 'FREE VIP' : 'guest') + ' seat for the Longevity Masterclass with Julie Gibson Clark is reserved. No payment is due. Your Zoom access details will be sent to ' + $('emEmail').value + ' before the session.';
    var ref = $('ckReceiptReference');
    if (ref) ref.textContent = 'Order #' + (ids.orderid || '') + ' · ' + (plan.course_name || 'Longevity Masterclass') + ' · ' + ($('emDate') || {}).value;
    try { if (ref && sessionStorage.getItem('lla_member_id') && ids.stid) ref.textContent += ' · Member ID ' + ids.stid; } catch (e) {}
    ['ckVipCoupon', 'ckCourseLink'].forEach(function (id) { var el = $(id); if (el) el.style.display = 'none'; });
    m.classList.remove('open'); order.style.display = 'none'; done.style.display = 'block';
    ck.style.display = 'block'; document.body.style.overflow = 'hidden'; ck.scrollTop = 0;
    try { var s3 = $('ckSt3'); if (s3) s3.classList.add('done'); var b2 = $('ckBar2'); if (b2) b2.classList.add('done'); } catch (e) {}
    try { window.LLA_AC && LLA_AC.send && LLA_AC.send('LGV_Guest_Access_Registered'); } catch (e) {}
  }
  /* A free seat has no payment report, so the class is assigned here (same CRM call the
   * French Atelier $0 course orders use): StudentID + OrderID + class -> Students/ProfileInfo. */
  function assignClass(ids) {
    if (!ids || !ids.stid || !ids.orderid) return Promise.reject(new Error('no_ids'));
    var cfg = LLA_ECOMM.config || {};
    var base = String(cfg.workerBase || '').replace(/\/$/, '') + (cfg.env === 'staging' ? '/staging' : '');
    var cls = dedicatedVIP ? { courseId: 170142, semesterId: 2394 } : LLA_ECOMM.classForSession((($('emDate') || {}).value) || '');
    var body = { StudentID: Number(ids.stid), OrderID: Number(ids.orderid), SecondaryCourseID: Number(cls.courseId),
                 AssignNotes: dedicatedVIP ? 'FREE VIP customer invitation, 100 percent discount, Longevity Masterclass' : 'Guest access code, free seat, Longevity Masterclass' };
    function go(left) {
      return fetch(base + '/api/checkout/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { if (r.ok || r.status === 204) return true; throw new Error('assign_' + r.status); })
        .catch(function (e) { if (left > 0) return new Promise(function (res) { setTimeout(res, 1500); }).then(function () { return go(left - 1); }); throw e; });
    }
    return go(2);
  }
  /* Campaign invitation link: a hashed token carried by the link (?g=...) turns on guest
   * access by itself, so no code is shown or typed. Kept for this browser tab only. */
  var LINK_HASHES = ['914d6f92b2584c6ed280ee91884ff70aa17809448de5c43a4aa24b41b63c1778'];
  (function () {
    if (dedicatedVIP) {
      if (window.LLA_PLAN) {
        var applyPlan = window.LLA_PLAN.apply;
        window.LLA_PLAN.apply = function () {
          var result = applyPlan.apply(this, arguments);
          reflect();
          return result;
        };
        window.LLA_PLAN.apply('vip');
      }
      var promo = $('emPromo');
      if (promo) { promo.value = 'GUESTLIST'; promo.readOnly = true; }
      reflect();
      setInterval(reflect, 400);
      return;
    }
    var tok = '';
    try {
      var m = /(?:^|[?&])g=([A-Za-z0-9]{6,40})(?:&|$)/.exec(location.search);
      if (m) { tok = m[1]; sessionStorage.setItem('lla_guest_link', tok); }
      else tok = sessionStorage.getItem('lla_guest_link') || '';
    } catch (e) {}
    if (!tok) return;
    sha256(tok).then(function (hx) {
      if (LINK_HASHES.indexOf(hx) === -1 || Date.now() >= EXPIRES_AT) return;
      active = 'INVITELINK'; reflect();
      setInterval(function () { if (active) reflect(); }, 400);
    });
  })();
  /* One order per person: what this browser already sent is remembered per member ID
   * (or per email when there is no member link). */
  var REC = 'lla_guest_orders_v1';
  function recKey(f) {
    var m = ''; try { m = sessionStorage.getItem('lla_member_id') || ''; } catch (e) {}
    return m ? 'm:' + m : 'e:' + String(f.email || '').trim().toLowerCase();
  }
  function recAll() { try { return JSON.parse(localStorage.getItem(REC) || '{}') || {}; } catch (e) { return {}; } }
  function recGet(k) { return recAll()[k] || null; }
  function recSet(k, v) { try { var o = recAll(); if (v) { v.ts = Date.now(); o[k] = v; } else delete o[k]; localStorage.setItem(REC, JSON.stringify(o)); } catch (e) {} }
  var busy = false;
  document.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('#emApply, #emGo2') : null;
    if (!t) return;
    if (t.id === 'emApply') {
      if (dedicatedVIP) { ev.stopPropagation(); ev.preventDefault(); reflect(); return; }
      var code = norm($('emPromo').value);
      if (!code) return;
      ev.stopPropagation(); ev.preventDefault();
      sha256(code).then(function (hx) {
        if (HASHES.indexOf(hx) !== -1 && Date.now() < EXPIRES_AT) { active = code; reflect(); }
        else { active = ''; t.textContent = 'Not valid for this package'; }
      });
      return;
    }
    if (!active) return;
    ev.stopPropagation(); ev.preventDefault();
    if (busy) return;
    var f = fields(), e2 = $('emErr2'); e2.textContent = ''; e2.classList.remove('on');
    if (!window.LLA_ECOMM) { setErr('Something went wrong, please refresh and try again.'); return; }
    if (!window.LLA_CAMPAIGN_ACCESS || !window.LLA_CAMPAIGN_ACCESS.allowed) { setErr('Please use the approved campaign link in your invitation email.'); return; }
    var members = new URLSearchParams(location.search).getAll('member');
    if (members.length !== 1 || !/^[1-9]\d{5,9}$/.test(members[0])) { setErr('Please use your personal invitation link so we can add the masterclass to your existing member record. No new member or order has been created.'); return; }
    var v = LLA_ECOMM.validateLead(f);
    if (!v.ok) { setErr('Please check your details.'); return; }
    f.phone = v.phone;
    busy = true; t.disabled = true; t.textContent = 'Confirming your seat…';
    var key = recKey(f), prev = recGet(key), work;
    if (prev && prev.orderid) {
      /* the order already exists: only finish the class assignment, never open a second order */
      work = (prev.assigned ? Promise.resolve() : assignClass(prev).then(function () { recSet(key, { stid: prev.stid, orderid: prev.orderid, assigned: true }); }))
        .then(function () { finish(prev); });
    } else if (prev && prev.attempted) {
      work = Promise.reject(new Error('unconfirmed_attempt'));
    } else {
      recSet(key, { attempted: true });
      work = LLA_ECOMM.submitLead(f).then(function (r) {
        if (!r || !r.ok) {
          if (r && r.status >= 400 && r.status < 500) recSet(key, null); /* rejected, nothing was created */
          throw new Error('order_failed');
        }
        var ids = LLA_ECOMM.getCheckoutIds() || {};
        recSet(key, { stid: String(ids.stid), orderid: String(ids.orderid), assigned: false });
        return assignClass(ids).then(function () {
          recSet(key, { stid: String(ids.stid), orderid: String(ids.orderid), assigned: true });
          finish(ids);
        });
      });
    }
    work.catch(function (e) {
      setErr(e && e.message === 'unconfirmed_attempt'
        ? 'Your registration may already be in. Please do not submit again. Contact advisor@longevitylifeacademy.com and we will confirm your seat.'
        : 'We could not confirm your registration. Please contact advisor@longevitylifeacademy.com.');
    }).finally(function () { busy = false; t.disabled = false; reflect(); });
  }, true);
  document.addEventListener('input', function (ev) {
    if (!dedicatedVIP && ev.target && ev.target.id === 'emPromo' && active && norm(ev.target.value) !== active) {
      active = ''; var ap = $('emApply'); if (ap) ap.textContent = 'Apply';
      var go = $('emGo2'); if (go) go.textContent = 'Continue to payment';
      var tu = $('emTuition'), p = (window.LLA_PLAN && LLA_PLAN.get && LLA_PLAN.get()) || {};
      if (tu && p.value != null) tu.textContent = '$' + Number(p.value).toFixed(2);
    }
  }, true);
})();
