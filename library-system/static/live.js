(function () {
  var script = document.currentScript;
  var URL_LIVE = script && script.getAttribute('data-url');
  if (!URL_LIVE || !window.fetch) return;

  var every = (parseFloat(script.getAttribute('data-every')) || 5) * 1000;
  var pendingSeen = null;
  var mineSeen = null;
  var timer = null;
  var running = false;
  var again = false;
  var generation = 0;
  var stopped = false;

  function parse(html) {
    var template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function toast(title, body) {
    if (window.Notify) window.Notify.show({ title: title, body: body }, false);
  }

  // Don't pull a row out from under someone who is using it.
  function inUse(el) {
    return el.getAttribute('aria-busy') === 'true' ||
      el.classList.contains('is-removing') ||
      el.contains(document.activeElement) && document.activeElement !== document.body ||
      !!el.querySelector('details[open]');
  }

  function known() {
    var parts = [];
    document.querySelectorAll('[data-list][data-live-hash], [data-live-block]').forEach(function (el) {
      var id = el.id || el.getAttribute('data-live-block');
      parts.push(id + ':' + el.getAttribute('data-live-hash'));
    });
    return parts.join(',');
  }

  function syncList(list, data) {
    var body = list.tagName === 'TABLE' ? list.tBodies[0] : list;
    var wanted = {};
    data.items.forEach(function (item) { wanted[item.id] = item; });
    var complete = true;
    var changed = false;

    body.querySelectorAll('[data-item][data-id]').forEach(function (row) {
      var id = row.getAttribute('data-id');
      var item = wanted[id];
      delete wanted[id];
      if (item && row.getAttribute('data-key') === item.key) return;
      if (inUse(row)) { complete = false; return; }
      if (!item) {
        row.remove();
        changed = true;
        return;
      }
      var fresh = parse(item.html);
      if (!fresh) return;
      fresh._order = row._order;
      flash(fresh);
      row.replaceWith(fresh);
      changed = true;
    });

    Object.keys(wanted).forEach(function (id) {
      var row = parse(wanted[id].html);
      if (!row) return;
      flash(row);
      body.appendChild(row);
      changed = true;
    });

    // Only remember the new version once every change has landed; otherwise retry next round.
    if (complete) list.setAttribute('data-live-hash', data.hash);
    if (changed && window.Lists) window.Lists.refresh(list.id);
  }

  function syncBlock(block, data) {
    var open = Array.prototype.map.call(block.querySelectorAll('details'), function (d) { return d.open; });
    block.innerHTML = data.html;
    block.querySelectorAll('details').forEach(function (d, i) { if (open[i]) d.open = true; });
    block.setAttribute('data-live-hash', data.hash);
  }

  function flash(el) {
    el.classList.add('is-new');
    setTimeout(function () { el.classList.remove('is-new'); }, 2500);
  }

  function setBadge(count) {
    document.querySelectorAll('[data-live-badge]').forEach(function (badge) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.hidden = count === 0;
      badge.setAttribute('aria-label', count + ' waiting');
    });
  }

  // Admin: a borrower sent a new request.
  function notePending(pending) {
    var ids = {};
    pending.forEach(function (r) { ids[r.id] = true; });
    if (pendingSeen) {
      var fresh = pending.filter(function (r) { return !pendingSeen[r.id]; });
      if (fresh.length === 1) toast('New borrow request', fresh[0].student + ' wants to borrow “' + fresh[0].title + '”.');
      else if (fresh.length > 1) toast('New borrow requests', fresh.length + ' new borrow requests are waiting.');
    }
    pendingSeen = ids;
    setBadge(pending.length);
  }

  // Borrower: the library approved, declined or checked in one of their requests.
  var MINE = {
    approved: function (r) { return ['Request approved', '“' + r.title + '” is now borrowed' + (r.due ? ', due ' + r.due : '') + '.']; },
    declined: function (r) { return ['Request declined', 'Your request for “' + r.title + '” was declined.']; },
    returned: function (r) { return ['Book returned', '“' + r.title + '” was marked as returned. Thank you!']; }
  };

  function noteMine(mine) {
    var now = {};
    mine.forEach(function (r) { now[r.id] = r.status; });
    if (mineSeen) {
      mine.forEach(function (r) {
        var before = mineSeen[r.id];
        if (before && before !== r.status && MINE[r.status]) toast.apply(null, MINE[r.status](r));
      });
    }
    mineSeen = now;
  }

  function apply(data) {
    Object.keys(data.lists || {}).forEach(function (id) {
      var list = document.getElementById(id);
      if (list) syncList(list, data.lists[id]);
    });
    Object.keys(data.blocks || {}).forEach(function (id) {
      var block = document.querySelector('[data-live-block="' + id + '"]');
      if (block) syncBlock(block, data.blocks[id]);
    });
    var values = data.values || {};
    if (values.pending) notePending(values.pending);
    if (values.mine) noteMine(values.mine);
    if (data.every) every = data.every * 1000;
  }

  function check() {
    if (stopped) return;
    if (running) { again = true; return; }
    running = true;
    var started = generation;
    fetch(URL_LIVE + '?h=' + encodeURIComponent(known()), {
      headers: { 'Accept': 'application/json' }, credentials: 'same-origin', cache: 'no-store'
    }).then(function (res) {
      if (res.status === 401) { stopped = true; return null; }
      var type = res.headers.get('Content-Type') || '';
      if (!res.ok || type.indexOf('application/json') === -1) throw new Error('not json');
      return res.json();
    }).then(function (data) {
      if (!data) return;
      // A save finished while this was in flight, so this answer may be out of date.
      if (started !== generation) { again = true; return; }
      apply(data);
    }).catch(function () { /* try again next round */ }).then(function () {
      running = false;
      if (again) { again = false; check(); }
      else schedule();
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (!document.hidden && !stopped) timer = setTimeout(check, every);
  }

  // Stop checking while the tab is in the background; catch up as soon as it's back.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) clearTimeout(timer);
    else check();
  });

  // Something was just saved on this page: refresh right away instead of waiting.
  document.addEventListener('app:saved', function () {
    generation++;
    check();
  });

  check();
})();
