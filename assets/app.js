/* Post & Parcel demo app — event names MUST match generator/taxonomy.py */
(function () {
  'use strict';

  // ---------------------------------------------------------------- tracking
  var amp = window.amplitude;
  function track(name, props, options) {
    try { if (amp) amp.track(name, props || {}, options || undefined); } catch (e) { console.warn(e); }
    if (window.location.search.indexOf('debug=1') > -1) console.log('[track]', name, props || {}, options || '');
  }
  function identify(props) {
    try {
      if (!amp || !amp.Identify) return;
      var id = new amp.Identify();
      Object.keys(props).forEach(function (k) { id.set(k, props[k]); });
      amp.identify(id);
    } catch (e) { console.warn(e); }
  }

  // ---------------------------------------------------------------- state
  var KEY = 'pp_demo_state_v1';
  var defaults = {
    onboarded: false, loginStatus: 'guest', userId: null, persona: null,
    packstationActivated: false, activationPending: null, bonusMember: false,
    notifications: null, saved: [], labels: []
  };
  var state;
  try { state = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { state = Object.assign({}, defaults); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ } }

  var params = new URLSearchParams(window.location.search);
  // Variant overrides for demoing the feature experiments' treatment UI
  var variants = {
    activation: params.get('exp_activation') || 'control',   // packstation-instant-activation
    wallet: params.get('exp_wallet') || 'control'            // express-checkout-wallet
  };
  var paypalMode = params.get('paypal'); // 'fail' | 'ok' | null (random)

  // ---------------------------------------------------------------- data
  var SHIPMENTS = {
    '00340434161094015902': { product: 'Parcel', status: 'out_for_delivery', label: 'Out for delivery', from: 'Sportwear Online GmbH',
      events: [['Today, 07:42', 'The shipment has been loaded onto the delivery vehicle'], ['Today, 05:10', 'Processed at parcel centre Leipzig'], ['Yesterday, 19:31', 'Shipment picked up from sender']] },
    '00340434161094022210': { product: 'Small parcel', status: 'in_transit', label: 'In transit', from: 'Bookstore Halle',
      events: [['Yesterday, 22:05', 'Processed at parcel centre Radefeld'], ['Yesterday, 16:40', 'Shipment handed over at post office']] },
    '00340434161094033871': { product: 'Parcel', status: 'ready_for_pickup', label: 'Ready at Packstation', from: 'Electronics Express',
      events: [['Today, 09:12', 'Delivered to Packstation 112, Merseburger Str.'], ['Today, 06:01', 'Out for delivery']] },
    '00340434161094040016': { product: 'Parcel', status: 'delivered', label: 'Delivered', from: 'Home & Living Store',
      events: [['Mon, 14:22', 'Delivered to neighbour (Schmidt)'], ['Mon, 08:03', 'Out for delivery']] }
  };
  function shipmentFor(tn) {
    if (SHIPMENTS[tn]) return SHIPMENTS[tn];
    var keys = Object.keys(SHIPMENTS);
    var pick = SHIPMENTS[keys[parseInt(tn.slice(-1), 10) % keys.length || 0]];
    return Object.assign({}, pick, { from: 'Unknown sender' });
  }
  var PRODUCTS = [
    { id: 'small_parcel_s', name: 'Small parcel S', detail: 'Up to 2 kg, 35 × 25 × 10 cm', price: 3.99 },
    { id: 'small_parcel_m', name: 'Small parcel M', detail: 'Up to 2 kg, 60 × 30 × 15 cm', price: 4.79 },
    { id: 'parcel_2kg', name: 'Parcel 2 kg', detail: 'Tracked, insured up to €500', price: 6.19 },
    { id: 'parcel_5kg', name: 'Parcel 5 kg', detail: 'Tracked, insured up to €500', price: 7.69 },
    { id: 'parcel_10kg', name: 'Parcel 10 kg', detail: 'Tracked, insured up to €500', price: 10.49 }
  ];
  var DEST_SURCHARGE = { domestic: 0, eu: 10.3, world: 31.0 };
  var LOCATIONS = [
    { id: 'ps112', type: 'packstation', name: 'Packstation 112', addr: 'Merseburger Str. 40, Leipzig', dist: '350 m', hours: 'Open 24/7' },
    { id: 'ps087', type: 'packstation', name: 'Packstation 87', addr: 'Lützner Str. 19, Leipzig', dist: '1.2 km', hours: 'Open 24/7' },
    { id: 'po01', type: 'post_office', name: 'Post office Lindenau', addr: 'Lindenauer Markt 8, Leipzig', dist: '900 m', hours: 'Mon–Fri 9:00–18:00, Sat 9:00–13:00' },
    { id: 'po02', type: 'post_office', name: 'Post office Hauptbahnhof', addr: 'Willy-Brandt-Platz 5, Leipzig', dist: '3.1 km', hours: 'Mon–Sat 8:00–20:00' },
    { id: 'sh01', type: 'parcel_shop', name: 'Parcel shop Kiosk am Park', addr: 'Karl-Heine-Str. 64, Leipzig', dist: '600 m', hours: 'Mon–Sat 7:00–21:00' },
    { id: 'bx01', type: 'parcel_box', name: 'Parcel box Plagwitz', addr: 'Zschochersche Str. 23, Leipzig', dist: '1.6 km', hours: 'Drop-off only' }
  ];
  var PERSONAS = {
    anna: { name: 'Anna', segment: 'online_shopper', postNumber: true, payment: 'paypal' },
    jonas: { name: 'Jonas', segment: 'small_seller', postNumber: false, payment: 'credit_card' },
    mia: { name: 'Mia', segment: 'private_sender', postNumber: false, payment: 'direct_debit' }
  };

  // ---------------------------------------------------------------- helpers
  var view = document.getElementById('view');
  var sheetRoot = document.getElementById('sheet-root');
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function eur(n) { return '€' + n.toFixed(2); }
  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function go(route) { if (location.hash === '#/' + route) render(); else location.hash = '#/' + route; }
  function openSheet(html, onMount) {
    sheetRoot.innerHTML = '<div class="sheet-backdrop" data-close="1"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
    var bd = sheetRoot.firstChild;
    bd.addEventListener('click', function (e) { if (e.target.getAttribute('data-close')) closeSheet(); });
    if (onMount) onMount(bd.querySelector('.sheet'));
    var f = bd.querySelector('button, input'); if (f) f.focus();
  }
  function closeSheet() { sheetRoot.innerHTML = ''; }
  function currentUserProps() {
    return {
      login_status: state.loginStatus,
      packstation_activated: state.packstationActivated,
      bonus_program_member: state.bonusMember,
      customer_segment: state.persona ? PERSONAS[state.persona].segment : 'unknown',
      has_post_number: state.persona ? PERSONAS[state.persona].postNumber : false,
      preferred_payment_method: state.persona ? PERSONAS[state.persona].payment : 'unknown',
      device_type: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
    };
  }

  // ---------------------------------------------------------------- onboarding
  var ONB = [
    { title: 'Track every parcel in one place', text: 'Scan the barcode or enter the tracking number. You get a push message when your parcel is on its way.',
      icon: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>' },
    { title: 'Send parcels without a printer', text: 'Buy postage in the app and show the QR code at a post office, Packstation or to your delivery person.',
      icon: '<rect x="4" y="4" width="16" height="16"/><path d="M8 8h3v3H8zM13 13h3v3h-3zM13 8h3M8 13v3"/>' },
    { title: 'Pick up at a Packstation, 24/7', text: 'Activate this phone once and open Packstation compartments straight from the app.',
      icon: '<rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M10 3v18"/>' }
  ];
  function renderOnboarding(step) {
    step = step || 0;
    if (step === 0) track('Onboarding Started', {});
    if (step < ONB.length) {
      var s = ONB[step];
      view.innerHTML = '<section class="onboarding"><div><div class="onb-art"><svg viewBox="0 0 24 24" aria-hidden="true">' + s.icon + '</svg></div>' +
        '<h1>' + esc(s.title) + '</h1><p class="lede">' + esc(s.text) + '</p></div><div>' +
        '<div class="dots">' + ONB.map(function (_, i) { return '<span class="' + (i === step ? 'on' : '') + '"></span>'; }).join('') + '</div>' +
        '<div class="stack"><button class="btn btn-primary" id="onb-next">Next</button>' +
        '<button class="btn btn-ghost" id="onb-skip">Skip intro</button></div></div></section>';
      document.getElementById('onb-next').onclick = function () { renderOnboarding(step + 1); };
      document.getElementById('onb-skip').onclick = function () { renderOnboarding(ONB.length); };
      return;
    }
    if (step === ONB.length) {
      view.innerHTML = '<section class="onboarding"><div><div class="onb-art"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 004 0"/></svg></div>' +
        '<h1>Know when your parcel arrives</h1><p class="lede">We announce deliveries with a 90-minute time window and tell you when a parcel is ready for pickup.</p></div>' +
        '<div class="stack"><button class="btn btn-primary" id="notif-allow">Allow notifications</button><button class="btn btn-secondary" id="notif-deny">Not now</button></div></section>';
      document.getElementById('notif-allow').onclick = function () { state.notifications = true; save(); track('Notification Permission Responded', { granted: true }); identify({ push_enabled: true }); renderOnboarding(step + 1); };
      document.getElementById('notif-deny').onclick = function () { state.notifications = false; save(); track('Notification Permission Responded', { granted: false }); identify({ push_enabled: false }); renderOnboarding(step + 1); };
      return;
    }
    view.innerHTML = '<section class="onboarding"><div><h1>Get more with an account</h1><p class="lede">Save up to 100 shipments, see parcels sent to your Post Number automatically and collect bonus points.</p></div>' +
      '<div class="stack"><button class="btn btn-primary" id="onb-login">Log in</button><button class="btn btn-secondary" id="onb-register">Create account</button>' +
      '<button class="btn btn-ghost" id="onb-guest">Continue as guest</button></div></section>';
    function finish(path) {
      state.onboarded = true; save();
      track('Onboarding Completed', { onboarding_path: path, notifications_granted: !!state.notifications });
    }
    document.getElementById('onb-login').onclick = function () { finish('login'); openLogin('login'); };
    document.getElementById('onb-register').onclick = function () { finish('register'); openLogin('register'); };
    document.getElementById('onb-guest').onclick = function () { finish('guest'); identify(currentUserProps()); go('track'); };
  }

  // Demo login: persona picker instead of credentials (no password fields on a public demo)
  function openLogin(method) {
    openSheet('<h2 style="margin-top:0">' + (method === 'register' ? 'Create a demo account' : 'Log in to a demo account') + '</h2>' +
      '<p class="small">This demo has no real accounts. Pick a persona to continue.</p><div class="stack">' +
      Object.keys(PERSONAS).map(function (k) {
        var p = PERSONAS[k];
        return '<button class="choice" data-persona="' + k + '"><span><strong>' + p.name + '</strong><br><span class="small">' + p.segment.replace('_', ' ') + (p.postNumber ? ', has a Post Number' : '') + '</span></span></button>';
      }).join('') + '</div>', function (el) {
      el.querySelectorAll('[data-persona]').forEach(function (b) {
        b.onclick = function () {
          var key = b.getAttribute('data-persona');
          state.persona = key; state.loginStatus = 'registered';
          state.userId = state.userId || ('pp-demo-' + key + '-' + Math.random().toString(36).slice(2, 8));
          save();
          if (amp) amp.setUserId(state.userId);
          identify(currentUserProps());
          track('Account Login Completed', { login_method: method === 'register' ? 'registration' : 'dhl_account', customer_segment: PERSONAS[key].segment });
          closeSheet(); toast('Logged in as ' + PERSONAS[key].name); go('track');
        };
      });
    });
  }

  // ---------------------------------------------------------------- track
  function labelCard(tn) {
    var s = shipmentFor(tn);
    var ok = s.status === 'delivered' || s.status === 'ready_for_pickup';
    return '<button class="label-card" data-tn="' + tn + '"><div class="label-band"><span class="tn">' + tn.replace(/(\d{4})(?=\d)/g, '$1 ') + '</span><span class="prod">' + esc(s.product) + '</span></div>' +
      '<div class="label-body"><div><h3>' + esc(s.from) + '</h3><p class="small">' + esc(s.events[0][1]) + '</p></div><span class="stamp' + (ok ? ' ok' : '') + '">' + esc(s.label) + '</span><div class="barcode" aria-hidden="true"></div></div></button>';
  }
  function renderTrack() {
    var list = state.saved.length ? state.saved : [];
    view.innerHTML = '<h1 id="track-hero-title">Where is my parcel?</h1><p class="lede">Enter the tracking number or scan the barcode on the receipt.</p>' +
      '<form class="track-entry" id="track-form"><label for="tn">Tracking number</label><div class="row">' +
      '<input id="tn" inputmode="numeric" autocomplete="off" placeholder="e.g. 00340434161094015902">' +
      '<button type="button" class="icon-btn" id="scan-btn" aria-label="Scan barcode"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M16 8v8"/></svg></button>' +
      '<button type="submit" class="icon-btn" aria-label="Track"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg></button></div></form>' +
      '<p class="small" style="margin-top:8px">Try <button class="btn-ghost" style="padding:0;border:0;background:none;cursor:pointer" id="try-tn">00340434161094015902</button></p>' +
      '<div class="row" style="margin:18px 0 6px"><button class="btn btn-secondary" id="ship-cta">Send a parcel</button></div>' +
      '<h2>Your shipments</h2>' + (list.length ? list.map(labelCard).join('') :
        '<div class="panel"><p>No saved shipments yet.</p><p class="small">Track a parcel and tap “Save shipment” to keep it here.' + (state.loginStatus === 'guest' ? ' Guests can save up to 10, accounts up to 100.' : '') + '</p></div>');
    document.getElementById('track-form').onsubmit = function (e) {
      e.preventDefault();
      var tn = document.getElementById('tn').value.replace(/\s/g, '');
      if (tn.length < 12) { toast('Enter the full tracking number. It has 12 to 20 digits.'); return; }
      doTrack(tn, 'manual_entry');
    };
    document.getElementById('try-tn').onclick = function () { document.getElementById('tn').value = '00340434161094015902'; };
    document.getElementById('scan-btn').onclick = openScanner;
    document.getElementById('ship-cta').onclick = function () { shipEntry = 'home_cta'; go('ship'); };
    view.querySelectorAll('[data-tn]').forEach(function (b) { b.onclick = function () { doTrack(b.getAttribute('data-tn'), 'saved_list'); }; });
  }
  function doTrack(tn, method) {
    var s = shipmentFor(tn);
    track('Shipment Tracked', { tracking_method: method, shipment_status: s.status, product_type: s.product === 'Parcel' ? 'parcel' : 'small_parcel', is_saved: state.saved.indexOf(tn) > -1 });
    go('shipment/' + tn);
  }
  function openScanner() {
    openSheet('<h2 style="margin-top:0">Scan barcode</h2><div class="scanner" aria-label="Camera preview"></div><p class="small">Hold the barcode inside the frame.</p><button class="btn btn-secondary" data-close="1">Cancel</button>', function (el) {
      el.querySelector('[data-close]').onclick = closeSheet;
      setTimeout(function () {
        if (!sheetRoot.firstChild) return;
        var fail = params.get('scan') === 'fail' || (params.get('scan') !== 'ok' && Math.random() < 0.25);
        if (fail) {
          track('Barcode Scan Failed', { failure_reason: 'barcode_not_recognised' });
          el.innerHTML = '<h2 style="margin-top:0">Barcode not recognised</h2><p>The camera could not read the barcode. Enter the tracking number instead.</p><button class="btn btn-primary" id="scan-manual">Enter number</button>';
          el.querySelector('#scan-manual').onclick = function () { closeSheet(); var i = document.getElementById('tn'); if (i) i.focus(); };
        } else { closeSheet(); doTrack('00340434161094022210', 'barcode_scan'); }
      }, 1800);
    });
  }
  function renderShipment(tn) {
    var s = shipmentFor(tn);
    var isSaved = state.saved.indexOf(tn) > -1;
    track('Shipment Details Viewed', { shipment_status: s.status });
    view.innerHTML = '<button class="btn btn-ghost" id="back" style="padding-left:0">Back</button>' + labelCard(tn).replace('<button class="label-card"', '<div class="label-card" style="cursor:default"').replace(/<\/button>$/, '</div>') +
      (s.status === 'out_for_delivery' ? '<div class="notice"><strong>Expected today, 10:30 to 12:00</strong><br><span class="small">About 6 stops before yours.</span></div>' : '') +
      (s.status === 'ready_for_pickup' ? '<div class="notice ok"><strong>Ready at Packstation 112</strong><br><span class="small">Pick up within 7 days.</span></div>' : '') +
      '<div class="stack">' +
      (s.status === 'out_for_delivery' ? '<button class="btn btn-primary" id="live">Follow live</button>' : '') +
      (s.status === 'in_transit' || s.status === 'out_for_delivery' ? '<button class="btn btn-secondary" id="change">Change delivery</button>' : '') +
      (s.status === 'ready_for_pickup' ? '<button class="btn btn-primary" id="to-ps">Pick up at Packstation</button>' : '') +
      (!isSaved ? '<button class="btn btn-secondary" id="save-s">Save shipment</button>' : '') + '</div>' +
      '<h2>Shipment history</h2><ol class="timeline">' + s.events.map(function (ev, i) { return '<li class="' + (i === 0 ? 'current' : '') + '"><time>' + esc(ev[0]) + '</time>' + esc(ev[1]) + '</li>'; }).join('') + '</ol>';
    document.getElementById('back').onclick = function () { go('track'); };
    var b;
    if ((b = document.getElementById('live'))) b.onclick = function () { renderLive(tn); };
    if ((b = document.getElementById('change'))) b.onclick = function () { openDeliveryOptions(tn); };
    if ((b = document.getElementById('to-ps'))) b.onclick = function () { go('packstation'); };
    if ((b = document.getElementById('save-s'))) b.onclick = function () {
      var limit = state.loginStatus === 'guest' ? 10 : 100;
      if (state.saved.length >= limit) { toast('Saved list is full. Log in to save up to 100 shipments.'); return; }
      state.saved.unshift(tn); save();
      track('Shipment Saved', { saved_count: state.saved.length, login_status: state.loginStatus });
      toast('Shipment saved'); renderShipment(tn);
    };
  }
  function renderLive(tn) {
    track('Live Tracking Viewed', { stops_before_delivery: 6 });
    view.innerHTML = '<button class="btn btn-ghost" id="back" style="padding-left:0">Back</button><h1>Your parcel is on its way</h1>' +
      '<p class="lede">6 stops before yours. Expected between 10:30 and 12:00.</p>' +
      '<div class="map" aria-label="Map showing the delivery vehicle"><svg viewBox="0 0 400 210" aria-hidden="true"><path d="M-10 160 C80 140 120 60 200 80 S330 170 410 40" stroke="#fff"/><path d="M60 -10 L120 220 M260 -10 L300 220" stroke="#fff" stroke-width="4"/></svg>' +
      '<span class="van" id="van" style="left:12%;top:68%"></span></div>' +
      '<div class="panel"><h3>Not home?</h3><p class="small">You can still redirect the parcel until it is 3 stops away.</p><button class="btn btn-secondary" id="change">Change delivery</button></div>';
    document.getElementById('back').onclick = function () { go('shipment/' + tn); };
    document.getElementById('change').onclick = function () { openDeliveryOptions(tn); };
    var pts = [[12, 68], [30, 52], [48, 38], [62, 48]], i = 0, van = document.getElementById('van');
    var iv = setInterval(function () { if (!document.body.contains(van)) return clearInterval(iv); i = (i + 1) % pts.length; van.style.left = pts[i][0] + '%'; van.style.top = pts[i][1] + '%'; }, 2000);
  }
  function openDeliveryOptions(tn) {
    var opts = [['neighbour', 'Neighbour', 'Name a neighbour who can accept it'], ['drop_off_spot', 'Drop-off spot', 'Garage, terrace or another safe place'],
      ['packstation', 'Packstation', 'Collect it 24/7 at Packstation 112'], ['post_office', 'Post office', 'Collect it at Post office Lindenau']];
    openSheet('<h2 style="margin-top:0">Change delivery</h2><div class="stack">' + opts.map(function (o) {
      return '<button class="choice" data-opt="' + o[0] + '"><span><strong>' + o[1] + '</strong><br><span class="small">' + o[2] + '</span></span></button>';
    }).join('') + '</div>', function (el) {
      // track after the sheet is in the DOM so guides anchored to [data-opt] find their target
      track('Delivery Options Viewed', { packstation_activated: state.packstationActivated });
      el.querySelectorAll('[data-opt]').forEach(function (b) {
        b.onclick = function () {
          var opt = b.getAttribute('data-opt');
          if (opt === 'packstation' && !state.packstationActivated) {
            closeSheet(); toast('Activate Packstation on this phone first'); go('packstation'); return;
          }
          track('Delivery Option Booked', { delivery_option: opt, login_status: state.loginStatus });
          closeSheet(); toast('Delivery changed'); go('shipment/' + tn);
        };
      });
    });
  }

  // ---------------------------------------------------------------- ship
  var shipEntry = 'ship_tab';
  var order = null;
  function renderShip() {
    if (!order) {
      order = { step: 1, product: null, destination: 'domestic', address: null, payment: null, attempts: 0 };
      track('Shipping Flow Started', { entry_point: shipEntry });
      shipEntry = 'ship_tab';
    }
    var steps = '<div class="steps" aria-label="Step ' + order.step + ' of 3">' + [1, 2, 3].map(function (n) { return '<span class="' + (n <= order.step ? 'done' : '') + '"></span>'; }).join('') + '</div>';
    if (order.step === 1) return shipStep1(steps);
    if (order.step === 2) return shipStep2(steps);
    if (order.step === 3) return shipStep3(steps);
    return shipDone();
  }
  function price() { return order.product ? +(order.product.price + DEST_SURCHARGE[order.destination]).toFixed(2) : 0; }
  function shipStep1(steps) {
    view.innerHTML = steps + '<h1>What are you sending?</h1><p class="lede">Prices include VAT. Your label is valid for 14 days.</p>' +
      '<div class="chips" role="group" aria-label="Destination">' + [['domestic', 'Germany'], ['eu', 'EU'], ['world', 'Worldwide']].map(function (d) {
        return '<button class="chip" data-dest="' + d[0] + '" aria-pressed="' + (order.destination === d[0]) + '">' + d[1] + '</button>'; }).join('') + '</div>' +
      '<div class="stack">' + PRODUCTS.map(function (p) {
        return '<button class="choice" data-prod="' + p.id + '" aria-pressed="' + (order.product && order.product.id === p.id) + '"><span><strong>' + p.name + '</strong><br><span class="small">' + p.detail + '</span></span><span class="price">' + eur(p.price + DEST_SURCHARGE[order.destination]) + '</span></button>'; }).join('') + '</div>';
    view.querySelectorAll('[data-dest]').forEach(function (b) { b.onclick = function () { order.destination = b.getAttribute('data-dest'); renderShip(); }; });
    view.querySelectorAll('[data-prod]').forEach(function (b) {
      b.onclick = function () {
        order.product = PRODUCTS.filter(function (p) { return p.id === b.getAttribute('data-prod'); })[0];
        track('Parcel Size Selected', { product_id: order.product.id, destination: order.destination, label_price: price() });
        order.step = 2; renderShip();
      };
    });
  }
  function shipStep2(steps) {
    var hasBook = state.loginStatus === 'registered';
    view.innerHTML = steps + '<h1>Who is it for?</h1><p class="lede">' + esc(order.product.name) + ', ' + eur(price()) + '</p>' +
      (hasBook ? '<button class="choice" id="addr-book" style="margin-bottom:14px"><span><strong>From address book</strong><br><span class="small">Lena Hoffmann, Berlin</span></span></button>' : '') +
      '<form id="addr-form"><div class="field"><label for="a-name">Name</label><input id="a-name" required autocomplete="off"></div>' +
      '<div class="field"><label for="a-street">Street and number</label><input id="a-street" required autocomplete="off"></div>' +
      '<div class="row"><div class="field" style="flex:1"><label for="a-zip">Postcode</label><input id="a-zip" required inputmode="numeric" autocomplete="off"></div>' +
      '<div class="field" style="flex:2"><label for="a-city">City</label><input id="a-city" required autocomplete="off"></div></div>' +
      '<button class="btn btn-primary" type="submit">Continue to payment</button></form>' +
      '<button class="btn btn-ghost" id="back">Back</button>';
    function next(source) {
      track('Recipient Address Entered', { address_source: source, destination: order.destination });
      order.step = 3; renderShip();
    }
    if (hasBook) document.getElementById('addr-book').onclick = function () { next('address_book'); };
    document.getElementById('addr-form').onsubmit = function (e) { e.preventDefault(); next('manual'); };
    document.getElementById('back').onclick = function () { order.step = 1; renderShip(); };
  }
  function shipStep3(steps) {
    var methods = [['paypal', 'PayPal', 'You will be redirected to PayPal'], ['credit_card', 'Credit card', 'Visa, Mastercard, American Express'],
      ['direct_debit', 'Direct debit', 'SEPA direct debit'], ['wallet', 'Google Pay / Apple Pay', 'Pay with one tap']];
    if (variants.wallet === 'treatment') methods = [methods[3], methods[0], methods[1], methods[2]];
    view.innerHTML = steps + '<h1>How do you want to pay?</h1><p class="lede">' + esc(order.product.name) + ' to ' + (order.destination === 'domestic' ? 'Germany' : order.destination.toUpperCase()) + ', ' + eur(price()) + '</p>' +
      '<div class="stack" id="pay-methods">' + methods.map(function (m) {
        var express = variants.wallet === 'treatment' && m[0] === 'wallet';
        return '<button class="choice" data-pay="' + m[0] + '" aria-pressed="' + (order.payment === m[0]) + '"><span><strong>' + m[1] + (express ? '<span class="badge">Express</span>' : '') + '</strong><br><span class="small">' + m[2] + '</span></span></button>'; }).join('') + '</div>' +
      '<div style="margin-top:16px" class="stack"><button class="btn btn-primary" id="pay" ' + (order.payment ? '' : 'disabled') + '>Pay ' + eur(price()) + '</button><button class="btn btn-ghost" id="back">Back</button></div>';
    view.querySelectorAll('[data-pay]').forEach(function (b) {
      b.onclick = function () {
        order.payment = b.getAttribute('data-pay');
        track('Payment Method Selected', { payment_method: order.payment, label_price: price() });
        renderShip();
      };
    });
    document.getElementById('back').onclick = function () { order.step = 2; renderShip(); };
    document.getElementById('pay').onclick = function () {
      var btn = this; btn.disabled = true; btn.textContent = order.payment === 'paypal' ? 'Waiting for PayPal…' : 'Processing…';
      order.attempts++;
      var failChance = order.payment === 'paypal' ? 0.35 : 0.04;
      var fail = paypalMode === 'fail' ? order.payment === 'paypal' : paypalMode === 'ok' ? false : Math.random() < failChance;
      setTimeout(function () {
        if (fail) {
          track('Payment Failed', { payment_method: order.payment, error_type: order.payment === 'paypal' ? 'redirect_timeout' : 'card_declined', attempt_number: order.attempts });
          view.insertAdjacentHTML('afterbegin', '<div class="notice" role="alert"><strong>Payment did not go through</strong><br><span class="small">' +
            (order.payment === 'paypal' ? 'PayPal did not respond in time. Your label was not purchased. Try again or choose another payment method.' : 'Your bank declined the payment. Choose another payment method.') + '</span></div>');
          btn.disabled = false; btn.textContent = 'Pay ' + eur(price());
          return;
        }
        var p = price();
        track('Shipping Label Purchased', { product_id: order.product.id, destination: order.destination, payment_method: order.payment, label_price: p, attempt_number: order.attempts },
          { price: p, quantity: 1, revenue: p, productId: order.product.id, revenueType: 'shipping_label' });
        state.labels.unshift({ product: order.product.name, price: p, at: Date.now() }); save();
        order.step = 4; renderShip();
      }, order.payment === 'paypal' ? 2600 : 1200);
    };
  }
  function shipDone() {
    view.innerHTML = '<h1>Your label is ready</h1><p class="lede">Show this code at a post office, a Packstation or to your delivery person. No printer needed.</p>' +
      '<div class="qr" role="img" aria-label="Mobile label QR code"></div><div class="stack"><button class="btn btn-primary" id="qr-done">Done</button>' +
      '<button class="btn btn-secondary" id="ship-another">Send another parcel</button></div>';
    track('Mobile Label QR Viewed', {});
    document.getElementById('qr-done').onclick = function () { order = null; go('track'); };
    document.getElementById('ship-another').onclick = function () { order = null; shipEntry = 'post_purchase'; renderShip(); };
  }

  // ---------------------------------------------------------------- locations
  var locFilter = 'all';
  function renderLocations() {
    var items = LOCATIONS.filter(function (l) { return locFilter === 'all' || l.type === locFilter; });
    view.innerHTML = '<h1>Find a location</h1><form class="track-entry" id="loc-form" style="margin-bottom:14px"><label for="loc-q">Address or postcode</label><div class="row"><input id="loc-q" value="Leipzig-Lindenau" autocomplete="off">' +
      '<button type="button" class="icon-btn" id="loc-gps" aria-label="Use my location"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button></div></form>' +
      '<div class="chips" role="group" aria-label="Location type">' + [['all', 'All'], ['packstation', 'Packstation'], ['post_office', 'Post office'], ['parcel_shop', 'Parcel shop'], ['parcel_box', 'Parcel box']].map(function (c) {
        return '<button class="chip" data-f="' + c[0] + '" aria-pressed="' + (locFilter === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<ul class="list">' + items.map(function (l) { return '<li><button class="list-btn" data-loc="' + l.id + '"><span><strong>' + esc(l.name) + '</strong><br><span class="meta">' + esc(l.addr) + '</span></span><span class="meta">' + l.dist + '</span></button></li>'; }).join('') + '</ul>';
    function search(method) { track('Location Search Performed', { search_method: method, location_type: locFilter, results_count: items.length }); }
    document.getElementById('loc-form').onsubmit = function (e) { e.preventDefault(); search('manual_entry'); toast(items.length + ' locations found'); };
    document.getElementById('loc-gps').onclick = function () { search('gps'); toast('Showing locations near you'); };
    view.querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { locFilter = b.getAttribute('data-f'); renderLocations(); search('filter'); }; });
    view.querySelectorAll('[data-loc]').forEach(function (b) {
      b.onclick = function () {
        var l = LOCATIONS.filter(function (x) { return x.id === b.getAttribute('data-loc'); })[0];
        track('Location Details Viewed', { location_type: l.type });
        openSheet('<h2 style="margin-top:0">' + esc(l.name) + '</h2><p>' + esc(l.addr) + '</p><p class="small">' + esc(l.hours) + '</p><button class="btn btn-secondary" data-close="1">Close</button>', function (el) { el.querySelector('[data-close]').onclick = closeSheet; });
      };
    });
  }

  // ---------------------------------------------------------------- packstation
  function renderPackstation() {
    track('Packstation Tab Viewed', { packstation_activated: state.packstationActivated });
    if (state.packstationActivated) {
      view.innerHTML = '<h1>Packstation</h1><p class="lede">This phone is activated. Open compartments at app-controlled Packstations.</p>' +
        '<div class="label-card" style="cursor:default"><div class="label-band"><span class="tn">PACKSTATION 112</span><span class="prod">Merseburger Str. 40</span></div>' +
        '<div class="label-body"><div><h3>1 parcel ready</h3><p class="small">From Electronics Express. Pick up by Thursday.</p></div><span class="stamp ok">Ready</span></div></div>' +
        '<div class="stack"><button class="btn btn-primary" id="code">Show pickup code</button><button class="btn btn-secondary" id="open">Open compartment</button></div>';
      document.getElementById('code').onclick = function () {
        track('Pickup Code Viewed', {});
        openSheet('<h2 style="margin-top:0">Pickup code</h2><p style="font-size:40px;font-weight:800;font-stretch:70%;letter-spacing:.12em;margin:10px 0">4 8 1 9</p><p class="small">Enter this code at the Packstation screen.</p><button class="btn btn-secondary" data-close="1">Close</button>', function (el) { el.querySelector('[data-close]').onclick = closeSheet; });
      };
      document.getElementById('open').onclick = function () { track('Parcel Picked Up', { pickup_method: 'app_bluetooth' }); toast('Compartment 23 is open'); };
      return;
    }
    if (state.activationPending) return renderCodeEntry();
    view.innerHTML = '<h1>Pick up parcels 24/7</h1><p class="lede">Activate this phone once to use Packstations without a customer card. It takes a moment and works for all your future parcels.</p>' +
      '<div class="panel"><h3>What you need</h3><p class="small">A Post Number. If you don\'t have one, we will create it during activation.</p></div>' +
      '<button class="btn btn-primary" id="ps-activate">Activate this phone</button>';
    document.getElementById('ps-activate').onclick = function () {
      track('Packstation Activation Started', { entry_point: 'packstation_tab', login_status: state.loginStatus });
      renderActivationMethods();
    };
  }
  function renderActivationMethods() {
    var letter = ['letter_code', 'Request activation code by letter', 'We post a code to your address. Arrives in 2 to 3 working days.'];
    var card = ['customer_card_scan', 'Scan your customer card', 'Use the barcode on your Packstation customer card.'];
    var idc = ['instant_id_check', 'Verify with your ID card', 'Takes about 2 minutes. Activate immediately.'];
    var methods = variants.activation === 'treatment' ? [idc, card, letter] : [letter, card];
    view.innerHTML = '<button class="btn btn-ghost" id="back" style="padding-left:0">Back</button><h1>How do you want to activate?</h1>' +
      '<p class="lede">You only do this once per phone.</p><div class="stack" id="activation-methods">' + methods.map(function (m, i) {
        var quiet = variants.activation === 'treatment' && m[0] === 'letter_code';
        return quiet ? '<button class="btn btn-ghost" data-m="' + m[0] + '">Or get a code by letter</button>' :
          '<button class="choice" data-m="' + m[0] + '"><span><strong>' + m[1] + (i === 0 && variants.activation === 'treatment' ? '<span class="badge">Fastest</span>' : '') + '</strong><br><span class="small">' + m[2] + '</span></span></button>';
      }).join('') + '</div>';
    document.getElementById('back').onclick = function () { go('packstation'); };
    view.querySelectorAll('[data-m]').forEach(function (b) {
      b.onclick = function () {
        var m = b.getAttribute('data-m');
        track('Activation Method Selected', { activation_method: m });
        if (m === 'letter_code') {
          track('Activation Code Requested By Mail', { expected_delivery_days: 3 });
          state.activationPending = { requestedAt: Date.now() }; save();
          view.innerHTML = '<h1>Your code is on its way</h1><p class="lede">We posted an activation code to your address. It usually arrives in 2 to 3 working days. Come back here when you have it.</p>' +
            '<div class="stack"><button class="btn btn-primary" id="have-code">I have my code</button><button class="btn btn-secondary" id="later">Remind me later</button></div>';
          document.getElementById('have-code').onclick = renderCodeEntry;
          document.getElementById('later').onclick = function () { go('track'); };
        } else if (m === 'customer_card_scan') {
          openSheet('<h2 style="margin-top:0">Scan customer card</h2><div class="scanner"></div><p class="small">Hold the barcode on the back of your card inside the frame.</p>', function () {
            setTimeout(function () { closeSheet(); completeActivation('customer_card_scan'); }, 1800);
          });
        } else {
          openSheet('<h2 style="margin-top:0">Verify your ID</h2><div class="scanner"></div><p class="small">Place the front of your ID card inside the frame, then take a short selfie video.</p>', function () {
            setTimeout(function () { closeSheet(); completeActivation('instant_id_check'); }, 2400);
          });
        }
      };
    });
  }
  function renderCodeEntry() {
    view.innerHTML = '<h1>Enter your activation code</h1><p class="lede">You will find the 8-character code in the letter we sent you.</p>' +
      '<form id="code-form"><div class="field"><label for="act-code">Activation code</label><input id="act-code" autocomplete="off" maxlength="8" style="font-size:22px;letter-spacing:.2em;text-transform:uppercase"></div>' +
      '<button class="btn btn-primary" type="submit">Activate</button></form><button class="btn btn-ghost" id="no-letter">I have not received the letter</button>';
    document.getElementById('code-form').onsubmit = function (e) {
      e.preventDefault();
      var v = document.getElementById('act-code').value.trim();
      if (v.length !== 8) { track('Activation Code Rejected', { reason: 'invalid_format' }); toast('The code has 8 characters. Check the letter and try again.'); return; }
      completeActivation('letter_code');
    };
    document.getElementById('no-letter').onclick = function () { track('Activation Letter Not Received', {}); toast('We have sent a new letter. It arrives in 2 to 3 working days.'); };
  }
  function completeActivation(method) {
    var days = state.activationPending ? Math.max(0, Math.round((Date.now() - state.activationPending.requestedAt) / 86400000)) : 0;
    track('Activation Code Entered', { activation_method: method });
    state.packstationActivated = true; state.activationPending = null; save();
    track('Packstation Activated', { activation_method: method, days_to_activate: days });
    identify({ packstation_activated: true, activation_method: method });
    toast('Packstation activated'); go('packstation');
  }

  // ---------------------------------------------------------------- more
  function renderMore() {
    var p = state.persona ? PERSONAS[state.persona] : null;
    view.innerHTML = '<h1>More</h1>' +
      '<div class="panel"><h3>' + (p ? 'Logged in as ' + p.name : 'You are using the app as a guest') + '</h3><p class="small">' + (p ? p.segment.replace('_', ' ') : 'Log in to save more shipments and see parcels sent to your Post Number.') + '</p>' +
      (p ? '<button class="btn btn-secondary" id="logout">Log out</button>' : '<button class="btn btn-primary" id="login">Log in</button>') + '</div>' +
      '<ul class="list">' +
      '<li><button class="list-btn" id="bonus"><span>Bonus programme</span><span class="meta">' + (state.bonusMember ? 'Member' : 'Join') + '</span></button></li>' +
      '<li><button class="list-btn" id="notif"><span>Notifications</span><span class="meta">' + (state.notifications ? 'On' : 'Off') + '</span></button></li>' +
      '<li><button class="list-btn" id="feedback"><span>Send feedback</span><span class="meta"></span></button></li>' +
      '<li><button class="list-btn" id="help"><span>Help and customer service</span><span class="meta"></span></button></li>' +
      '<li><button class="list-btn" id="reset"><span>Reset demo</span><span class="meta">Starts over as a new user</span></button></li></ul>';
    var b;
    if ((b = document.getElementById('login'))) b.onclick = function () { openLogin('login'); };
    if ((b = document.getElementById('logout'))) b.onclick = function () {
      track('Logged Out', {}); state.loginStatus = 'guest'; state.persona = null; save();
      if (amp) amp.reset(); identify(currentUserProps()); renderMore();
    };
    document.getElementById('bonus').onclick = function () {
      if (state.loginStatus === 'guest') { toast('Log in to join the bonus programme'); return; }
      if (!state.bonusMember) { state.bonusMember = true; save(); track('Bonus Program Joined', {}); identify({ bonus_program_member: true }); toast('Welcome to the bonus programme'); }
      renderMore();
    };
    document.getElementById('notif').onclick = function () {
      state.notifications = !state.notifications; save();
      track('Notification Settings Changed', { enabled: state.notifications }); identify({ push_enabled: state.notifications }); renderMore();
    };
    document.getElementById('feedback').onclick = function () { track('Feedback Opened', { entry_point: 'more_tab' }); toast('Thanks. A short survey opens if one is active.'); };
    document.getElementById('help').onclick = function () { track('Help Center Opened', {}); toast('Help centre is not part of this demo'); };
    document.getElementById('reset').onclick = function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      if (amp) amp.reset();
      location.href = location.pathname;
    };
  }

  // ---------------------------------------------------------------- router
  function render() {
    closeSheet();
    var route = (location.hash || '#/track').slice(2);
    var parts = route.split('/');
    var tab = parts[0] === 'shipment' ? 'track' : parts[0];
    document.querySelectorAll('.tab').forEach(function (t) { t.setAttribute('aria-current', t.getAttribute('data-route') === tab ? 'page' : 'false'); });
    if (!state.onboarded) { document.querySelector('.tabbar').style.display = 'none'; return renderOnboarding(0); }
    document.querySelector('.tabbar').style.display = '';
    if (parts[0] !== 'ship') order = order && order.step < 4 ? order : null;
    switch (parts[0]) {
      case 'shipment': renderShipment(parts[1]); break;
      case 'ship': renderShip(); break;
      case 'locations': renderLocations(); break;
      case 'packstation': renderPackstation(); break;
      case 'more': renderMore(); break;
      default: renderTrack();
    }
    view.scrollTop = 0;
  }
  document.querySelectorAll('[data-route]').forEach(function (b) { b.addEventListener('click', function () { go(b.getAttribute('data-route')); }); });
  window.addEventListener('hashchange', render);

  // App Opened once per page load (synthetic data fires it once per session)
  if (state.userId && amp) amp.setUserId(state.userId);
  identify(currentUserProps());
  track('App Opened', { is_first_open: !state.onboarded, login_status: state.loginStatus, experiment_overrides: variants.activation + '/' + variants.wallet });
  render();
})();
