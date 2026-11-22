/*!
 * LeonidaTracker app.js
 * Shared state (localStorage), filter/search engine, tracker, cheats, calculators,
 * and Base64 save export/import. No dependencies.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Store: one JSON object in localStorage, validated on every read.
   * ------------------------------------------------------------------ */
  var KEY = 'leonidatracker:v1';
  var EXPORT_PREFIX = 'LT1:';
  var ID_RE = /^[a-z0-9-]{1,60}$/;
  var MAX_NUM = 1e9;

  function defaults() {
    return { v: 1, checks: {}, counters: {}, favs: {}, prefs: { platform: 'ps5', spoilers: true } };
  }

  function normalize(input) {
    var out = defaults();
    if (!input || typeof input !== 'object') return out;
    ['checks', 'favs'].forEach(function (k) {
      var src = input[k];
      if (src && typeof src === 'object') {
        Object.keys(src).forEach(function (id) {
          if (ID_RE.test(id) && src[id] === true) out[k][id] = true;
        });
      }
    });
    if (input.counters && typeof input.counters === 'object') {
      Object.keys(input.counters).forEach(function (id) {
        var n = Number(input.counters[id]);
        if (ID_RE.test(id) && isFinite(n) && n > 0) out.counters[id] = Math.min(Math.floor(n), MAX_NUM);
      });
    }
    if (input.prefs && typeof input.prefs === 'object') {
      if (input.prefs.platform === 'xbox' || input.prefs.platform === 'ps5') out.prefs.platform = input.prefs.platform;
      if (typeof input.prefs.spoilers === 'boolean') out.prefs.spoilers = input.prefs.spoilers;
    }
    return out;
  }

  var storageOK = true;
  function readStorage() {
    try {
      var raw = window.localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : defaults();
    } catch (e) {
      storageOK = false;
      return defaults();
    }
  }

  var state = readStorage();
  var listeners = [];

  function persist() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOK = false; }
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { /* keep others running */ } });
  }

  var Store = {
    get: function () { return state; },
    isChecked: function (id) { return state.checks[id] === true; },
    count: function (id) { return state.counters[id] || 0; },
    setCheck: function (id, on) { if (on) state.checks[id] = true; else delete state.checks[id]; persist(); },
    setCounter: function (id, n) {
      n = Math.max(0, Math.min(Math.floor(Number(n) || 0), MAX_NUM));
      if (n > 0) state.counters[id] = n; else delete state.counters[id];
      persist();
    },
    toggleFav: function (id) { if (state.favs[id]) delete state.favs[id]; else state.favs[id] = true; persist(); return !!state.favs[id]; },
    setPref: function (k, v) { state.prefs[k] = v; persist(); },
    replace: function (data) { state = normalize(data); persist(); },
    reset: function () { state = defaults(); persist(); },
    on: function (fn) { listeners.push(fn); }
  };

  // Sync between open tabs.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { state = readStorage(); listeners.forEach(function (fn) { fn(state); }); }
  });

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function pct(x) { return Math.round(x * 1000) / 10; }

  var DATA = (function () {
    var el = document.getElementById('lt-data');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  })();

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  /* ------------------------------------------------------------------ *
   * Progress maths (shared by tracker + calculators)
   * Item fraction: checkbox = 0 or 1; counter = min(value / target, 1).
   * Category % = mean of its items. Overall % = mean of categories.
   * ------------------------------------------------------------------ */
  function itemFraction(item) {
    if (item.type === 'check') return Store.isChecked(item.id) ? 1 : 0;
    var t = item.target || 1;
    return Math.min(Store.count(item.id) / t, 1);
  }
  function categoryStats(catId) {
    if (!DATA || !DATA.items) return { frac: 0, done: 0, total: 0 };
    var items = DATA.items.filter(function (i) { return i.cat === catId; });
    if (!items.length) return { frac: 0, done: 0, total: 0 };
    var sum = 0, done = 0;
    items.forEach(function (i) { var f = itemFraction(i); sum += f; if (f >= 1) done++; });
    return { frac: sum / items.length, done: done, total: items.length };
  }
  function overallStats() {
    if (!DATA || !DATA.categories) return 0;
    var cats = DATA.categories.map(function (c) { return categoryStats(c.id).frac; });
    return cats.length ? cats.reduce(function (a, b) { return a + b; }, 0) / cats.length : 0;
  }
  function cheatStatus(cheat) {
    if (cheat.unlockCheck) {
      var ok = Store.isChecked(cheat.unlockCheck);
      return { known: true, have: ok ? 1 : 0, need: 1, frac: ok ? 1 : 0, label: ok ? 'Story complete' : 'Finish the main story' };
    }
    if (cheat.unlockCounter && cheat.unlockTarget) {
      var have = Store.count(cheat.unlockCounter);
      return { known: true, have: have, need: cheat.unlockTarget, frac: Math.min(have / cheat.unlockTarget, 1), label: fmt(Math.min(have, cheat.unlockTarget)) + ' / ' + fmt(cheat.unlockTarget) };
    }
    return { known: false };
  }

  /* ------------------------------------------------------------------ *
   * Navigation
   * ------------------------------------------------------------------ */
  function initNav() {
    var btn = $('[data-nav-toggle]');
    var nav = $('#site-nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function initCopyButtons() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-copy]');
      if (!b) return;
      copyText(b.getAttribute('data-copy')).then(function () { toast('Copied: ' + b.getAttribute('data-copy')); }, function () { toast('Copy failed. Select the text manually.'); });
    });
  }

  /* ------------------------------------------------------------------ *
   * Filter engine
   * Scope:  [data-filter-scope]
   * Inputs: [data-filter-search], select[data-filter-key="cat"],
   *         input[data-filter-flag="known"|"fav"], select[data-filter-status]
   * Items:  [data-filter-item] with data-search, data-cat, data-id, data-known
   * Groups: [data-filter-group] hidden when no visible items inside
   * ------------------------------------------------------------------ */
  function initFilters() {
    $$('[data-filter-scope]').forEach(function (scope) {
      var search = $('[data-filter-search]', scope);
      var keys = $$('[data-filter-key]', scope);
      var flags = $$('[data-filter-flag]', scope);
      var status = $('[data-filter-status]', scope);
      var items = $$('[data-filter-item]', scope);
      var groups = $$('[data-filter-group]', scope);
      var countEl = $('[data-filter-count]', scope);
      var emptyEl = $('[data-filter-empty]', scope);
      var syncUrl = scope.hasAttribute('data-filter-url');

      // Restore from URL (?q=&cat=) so filtered views are linkable.
      if (syncUrl && window.URLSearchParams) {
        var params = new URLSearchParams(window.location.search);
        if (search && params.get('q')) search.value = params.get('q').slice(0, 80);
        keys.forEach(function (sel) {
          var v = params.get(sel.getAttribute('data-filter-key'));
          if (v && $$('option', sel).some(function (o) { return o.value === v; })) sel.value = v;
        });
      }

      function apply() {
        var q = search ? search.value.trim().toLowerCase() : '';
        var terms = q ? q.split(/\s+/) : [];
        var visible = 0;
        items.forEach(function (it) {
          var ok = true;
          var hay = it.getAttribute('data-search') || it.textContent.toLowerCase();
          for (var i = 0; i < terms.length && ok; i++) if (hay.indexOf(terms[i]) === -1) ok = false;
          keys.forEach(function (sel) {
            var k = sel.getAttribute('data-filter-key');
            if (ok && sel.value !== 'all' && it.getAttribute('data-' + k) !== sel.value) ok = false;
          });
          flags.forEach(function (f) {
            if (!ok || !f.checked) return;
            var flag = f.getAttribute('data-filter-flag');
            if (flag === 'known' && it.getAttribute('data-known') !== '1') ok = false;
            if (flag === 'fav' && !Store.get().favs[it.getAttribute('data-id')]) ok = false;
          });
          if (ok && status && status.value !== 'all') {
            var id = it.getAttribute('data-id');
            var item = DATA && DATA.items ? DATA.items.find(function (x) { return x.id === id; }) : null;
            var done = item ? itemFraction(item) >= 1 : false;
            if (status.value === 'done' && !done) ok = false;
            if (status.value === 'todo' && done) ok = false;
          }
          it.hidden = !ok;
          if (ok) visible++;
        });
        groups.forEach(function (g) {
          g.hidden = !$$('[data-filter-item]', g).some(function (it) { return !it.hidden; });
        });
        if (countEl) countEl.textContent = visible + ' of ' + items.length + ' shown';
        if (emptyEl) emptyEl.hidden = visible !== 0;

        if (syncUrl && window.history && window.URLSearchParams) {
          var p = new URLSearchParams();
          if (q) p.set('q', q);
          keys.forEach(function (sel) { if (sel.value !== 'all') p.set(sel.getAttribute('data-filter-key'), sel.value); });
          var qs = p.toString();
          try { window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash); } catch (e) { /* sandboxed frames */ }
        }
      }

      if (search) search.addEventListener('input', apply);
      keys.concat(flags).forEach(function (el) { el.addEventListener('change', apply); });
      if (status) status.addEventListener('change', apply);
      Store.on(function () { if (status || flags.length) apply(); });
      apply();
    });
  }

  /* ------------------------------------------------------------------ *
   * Tracker: checkboxes, counters, progress bars, spoilers
   * ------------------------------------------------------------------ */
  function initTracker() {
    $$('input[type="checkbox"][data-check]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        Store.setCheck(cb.getAttribute('data-check'), cb.checked);
        toast(cb.checked ? 'Marked complete' : 'Marked not complete');
      });
    });

    $$('input[data-counter]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var max = Number(inp.getAttribute('max')) || MAX_NUM;
        var v = Math.max(0, Math.min(Math.floor(Number(inp.value) || 0), max));
        inp.value = v;
        Store.setCounter(inp.getAttribute('data-counter'), v);
      });
    });

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-step]');
      if (!b) return;
      var wrap = b.closest('.stepper');
      var inp = wrap && $('input[data-counter]', wrap);
      if (!inp) return;
      var size = Number(inp.getAttribute('step')) || 1;
      var max = Number(inp.getAttribute('max')) || MAX_NUM;
      var next = Store.count(inp.getAttribute('data-counter')) + Number(b.getAttribute('data-step')) * size;
      Store.setCounter(inp.getAttribute('data-counter'), Math.max(0, Math.min(next, max)));
    });

    document.addEventListener('click', function (e) {
      var s = e.target.closest('.spoiler');
      if (s && !s.classList.contains('revealed')) { s.classList.add('revealed'); e.preventDefault(); }
    });

    var spoilerToggle = $('[data-spoiler-toggle]');
    if (spoilerToggle) {
      spoilerToggle.addEventListener('change', function () { Store.setPref('spoilers', spoilerToggle.checked); });
    }

    render();
    Store.on(render);
  }

  function render() {
    var st = Store.get();
    document.body.classList.toggle('no-spoilers', st.prefs.spoilers === false);
    var spoilerToggle = $('[data-spoiler-toggle]');
    if (spoilerToggle) spoilerToggle.checked = st.prefs.spoilers !== false;

    $$('input[type="checkbox"][data-check]').forEach(function (cb) {
      var on = Store.isChecked(cb.getAttribute('data-check'));
      cb.checked = on;
      var li = cb.closest('.titem');
      if (li) li.classList.toggle('done', on);
    });

    $$('input[data-counter]').forEach(function (inp) {
      var id = inp.getAttribute('data-counter');
      var v = Store.count(id);
      if (document.activeElement !== inp) inp.value = v;
      var li = inp.closest('.titem');
      if (!li) return;
      var target = Number(li.getAttribute('data-target')) || 1;
      var unit = li.getAttribute('data-unit') || '';
      li.classList.toggle('done', v >= target);
      var bar = $('.bar > i', li); if (bar) bar.style.width = pct(Math.min(v / target, 1)) + '%';
      var frac = $('.frac', li); if (frac) frac.textContent = unit + fmt(v) + ' / ' + unit + fmt(target);
    });

    if (DATA && DATA.categories) {
      DATA.categories.forEach(function (c) {
        var s = categoryStats(c.id);
        $$('[data-cat-progress="' + c.id + '"]').forEach(function (el) {
          el.textContent = c.type === 'check' ? s.done + ' / ' + s.total + ' · ' + pct(s.frac) + '%' : pct(s.frac) + '%';
        });
        $$('[data-cat-bar="' + c.id + '"]').forEach(function (el) { el.style.width = pct(s.frac) + '%'; });
      });
      var o = overallStats();
      $$('[data-overall]').forEach(function (el) { el.textContent = pct(o) + '%'; });
      $$('[data-overall-bar]').forEach(function (el) { el.style.width = pct(o) + '%'; });
    }

    // Cheat unlock progress chips (cheats page + guide tables)
    if (DATA && DATA.cheats) {
      $$('[data-unlock-for]').forEach(function (el) {
        var ch = DATA.cheats.find(function (c) { return c.id === el.getAttribute('data-unlock-for'); });
        if (!ch) return;
        var s = cheatStatus(ch);
        if (!s.known) { el.hidden = true; return; }
        el.hidden = false;
        el.innerHTML = (s.frac >= 1 ? '<span class="chip chip-ok">Unlocked on your tracker</span>' :
          'Your progress: <b class="mono">' + esc(s.label) + '</b>') +
          '<div class="bar"><i style="width:' + pct(s.frac) + '%"></i></div>';
      });
    }

    $$('[data-fav]').forEach(function (b) {
      b.setAttribute('aria-pressed', st.favs[b.getAttribute('data-fav')] ? 'true' : 'false');
    });

    document.body.classList.toggle('plat-xbox', st.prefs.platform === 'xbox');
    $$('[data-platform]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-platform') === st.prefs.platform ? 'true' : 'false');
    });

    renderCalculators();
  }

  /* ------------------------------------------------------------------ *
   * Cheats page
   * ------------------------------------------------------------------ */
  function initCheats() {
    document.addEventListener('click', function (e) {
      var f = e.target.closest('[data-fav]');
      if (f) { var on = Store.toggleFav(f.getAttribute('data-fav')); toast(on ? 'Added to favourites' : 'Removed from favourites'); return; }
      var p = e.target.closest('[data-platform]');
      if (p) Store.setPref('platform', p.getAttribute('data-platform'));
    });
  }

  /* ------------------------------------------------------------------ *
   * Calculators
   * ------------------------------------------------------------------ */
  function renderCalculators() {
    if (!DATA) return;

    var comp = $('[data-calc="completion"]');
    if (comp && DATA.categories) {
      comp.innerHTML = DATA.categories.map(function (c) {
        var s = categoryStats(c.id);
        return '<div class="mb-2"><div class="progress-head"><span>' + esc(c.name) + '</span><strong>' + pct(s.frac) +
          '%</strong></div><div class="bar"><i style="width:' + pct(s.frac) + '%"></i></div><small>' + s.done + ' of ' + s.total + ' items complete</small></div>';
      }).join('');
    }

    var planner = $('[data-calc="planner"]');
    if (planner && DATA.cheats) {
      var showAll = $('[data-planner-all]') && $('[data-planner-all]').checked;
      var rows = DATA.cheats.map(function (c) { return { c: c, s: cheatStatus(c) }; })
        .filter(function (r) { return r.s.known && (showAll || r.s.frac < 1); })
        .sort(function (a, b) { return b.s.frac - a.s.frac || a.c.name.localeCompare(b.c.name); });
      var unlocked = DATA.cheats.filter(function (c) { var s = cheatStatus(c); return s.known && s.frac >= 1; }).length;
      var trackable = DATA.cheats.filter(function (c) { return cheatStatus(c).known; }).length;
      var summary = $('[data-planner-summary]');
      if (summary) summary.textContent = unlocked + ' of ' + trackable + ' trackable cheats unlocked on your tracker.';
      planner.innerHTML = rows.length ? rows.slice(0, 80).map(function (r) {
        var remaining = Math.max(r.s.need - r.s.have, 0);
        return '<tr><td><strong>' + esc(r.c.name) + '</strong><br><small>' + esc(r.c.unlock) + '</small></td>' +
          '<td class="mono">' + esc(r.s.label) + '<div class="bar mt-1"><i style="width:' + pct(r.s.frac) + '%"></i></div></td>' +
          '<td class="mono">' + (r.s.frac >= 1 ? '<span class="chip chip-ok">Ready</span>' : (r.c.unlockCheck ? 'Story' : fmt(remaining) + ' to go')) + '</td>' +
          '<td>' + (r.c.code ? '<span class="chip chip-cyan">Code known</span>' : '<span class="chip chip-warn">Code TBD</span>') + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="center dim">Every trackable cheat is unlocked. Nice work.</td></tr>';
    }

    var gap = $('[data-calc="gap"]');
    if (gap && DATA.requirements) {
      gap.innerHTML = DATA.requirements.map(function (r) {
        var have = r.check ? (Store.isChecked(r.check) ? 1 : 0) : (r.counters || [r.counter]).reduce(function (a, id) { return a + Store.count(id); }, 0);
        var need = r.check ? 1 : r.need;
        var left = Math.max(need - have, 0);
        var f = Math.min(have / need, 1);
        return '<tr><td><strong>' + esc(r.label) + '</strong>' + (r.note ? '<br><small>' + esc(r.note) + '</small>' : '') + '</td>' +
          '<td class="mono">' + (r.check ? (have ? 'Done' : 'Not yet') : fmt(Math.min(have, need)) + ' / ' + fmt(need)) +
          '<div class="bar mt-1"><i style="width:' + pct(f) + '%"></i></div></td>' +
          '<td class="mono">' + (left === 0 ? '<span class="chip chip-ok">Met</span>' : (r.check ? 'Required' : fmt(left) + ' left')) + '</td></tr>';
      }).join('');
    }

    var etaRemaining = $('[data-eta-remaining]');
    var etaCat = $('[data-eta-cat]');
    if (etaRemaining && etaCat && etaCat.value !== 'custom' && DATA.items) {
      var items = DATA.items.filter(function (i) { return etaCat.value === 'all' || i.cat === etaCat.value; });
      var left = items.filter(function (i) { return itemFraction(i) < 1; }).length;
      etaRemaining.value = left;
      computeEta();
    }
  }

  function computeEta() {
    var out = $('[data-eta-out]');
    if (!out) return;
    var n = Math.max(0, Number($('[data-eta-remaining]').value) || 0);
    var per = Math.max(0, Number($('[data-eta-per]').value) || 0);
    var session = Math.max(1, Number($('[data-eta-session]').value) || 1);
    var weekly = Math.max(1, Number($('[data-eta-weekly]').value) || 1);
    var minutes = n * per;
    var sessions = Math.ceil(minutes / session);
    var weeks = sessions / weekly;
    out.innerHTML =
      '<div class="grid grid-3">' +
      '<div class="stat"><b>' + (Math.round(minutes / 6) / 10) + ' h</b><span>Total play time</span></div>' +
      '<div class="stat"><b>' + fmt(sessions) + '</b><span>Sessions of ' + session + ' min</span></div>' +
      '<div class="stat"><b>' + (weeks < 1 && weeks > 0 ? '&lt; 1' : Math.ceil(weeks)) + '</b><span>Weeks at ' + weekly + ' sessions/week</span></div>' +
      '</div><p class="mt-2 dim mb-0">Formula: ' + fmt(n) + ' items × ' + per + ' min = ' + fmt(minutes) + ' min; ÷ ' + session + ' min per session = ' + fmt(sessions) + ' sessions; ÷ ' + weekly + ' per week.</p>';
  }

  function initCalculators() {
    var form = $('[data-calc="eta"]');
    if (form) {
      form.addEventListener('input', function (e) {
        if (e.target.matches('[data-eta-remaining]')) { var c = $('[data-eta-cat]'); if (c) c.value = 'custom'; }
        computeEta();
      });
      form.addEventListener('change', function (e) { if (e.target.matches('[data-eta-cat]')) renderCalculators(); });
      form.addEventListener('submit', function (e) { e.preventDefault(); computeEta(); });
      computeEta();
    }
    var all = $('[data-planner-all]');
    if (all) all.addEventListener('change', renderCalculators);
  }

  /* ------------------------------------------------------------------ *
   * Save export / import (Base64 of the state JSON, UTF-8 safe)
   * ------------------------------------------------------------------ */
  function toBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function fromBase64(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function exportCode() { return EXPORT_PREFIX + toBase64(JSON.stringify(Store.get())); }
  function parseCode(code) {
    code = String(code || '').trim().replace(/\s+/g, '');
    if (code.indexOf(EXPORT_PREFIX) === 0) code = code.slice(EXPORT_PREFIX.length);
    if (!code || code.length > 200000 || !/^[A-Za-z0-9+/=]+$/.test(code)) throw new Error('That does not look like a LeonidaTracker save code.');
    var obj = JSON.parse(fromBase64(code));
    if (!obj || typeof obj !== 'object' || obj.v !== 1) throw new Error('Unsupported save version.');
    return obj;
  }

  function initSaves() {
    var box = $('[data-save-code]');
    var exp = $('[data-save-export]');
    var dl = $('[data-save-download]');
    var imp = $('[data-save-import]');
    var file = $('[data-save-file]');
    var reset = $('[data-save-reset]');

    if (exp && box) exp.addEventListener('click', function () {
      box.value = exportCode();
      box.select();
      copyText(box.value).then(function () { toast('Save code copied'); }, function () { toast('Save code ready. Copy it from the box.'); });
    });

    if (dl) dl.addEventListener('click', function () {
      var blob = new Blob([exportCode() + '\n'], { type: 'text/plain' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'leonidatracker-save-' + new Date().toISOString().slice(0, 10) + '.txt';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('Save file downloaded');
    });

    if (imp && box) imp.addEventListener('click', function () {
      try { Store.replace(parseCode(box.value)); toast('Save imported'); }
      catch (e) { toast(e.message && e.message.length < 80 ? e.message : 'Import failed. Check the code.'); }
    });

    if (file && box) file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      if (f.size > 250000) { toast('That file is too large to be a save.'); return; }
      var r = new FileReader();
      r.onload = function () { box.value = String(r.result || '').trim(); toast('File loaded. Press Import to apply.'); };
      r.readAsText(f);
    });

    if (reset) {
      var armed = false, timer;
      reset.addEventListener('click', function () {
        if (!armed) {
          armed = true; reset.textContent = 'Click again to erase everything';
          timer = setTimeout(function () { armed = false; reset.textContent = 'Reset all progress'; }, 4000);
          return;
        }
        clearTimeout(timer); armed = false; reset.textContent = 'Reset all progress';
        Store.reset(); toast('All progress erased');
      });
    }

    var warn = $('[data-storage-warning]');
    if (warn && !storageOK) warn.hidden = false;
  }

  /* ------------------------------------------------------------------ */
  function boot() {
    initNav();
    initCopyButtons();
    initCheats();
    initTracker();
    initFilters();
    initCalculators();
    initSaves();
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  }

  // Exposed for debugging in the console only.
  window.LeonidaTracker = { store: Store, exportCode: exportCode, parseCode: parseCode };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
