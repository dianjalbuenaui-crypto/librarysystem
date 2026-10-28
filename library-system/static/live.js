(function () {
  var script = document.currentScript;
  var URL_LIVE = script && script.getAttribute('data-url');
  if (!URL_LIVE || !window.fetch) return;

  var EVERY = 5000;
  var seen = null;
  var timer = null;
  var running = false;
  var again = false;
  var generation = 0;

  function parse(html) {
    var template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function setCount(count) {
    document.querySelectorAll('[data-live-badge]').forEach(function (badge) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.hidden = count === 0;
      badge.setAttribute('aria-label', count + ' waiting');
    });
    document.querySelectorAll('[data-live-count]').forEach(function (el) { el.textContent = count; });
    document.querySelectorAll('[data-live-hint]').forEach(function (el) {
      el.textContent = count ? 'Requests to review' : 'All caught up';
    });
  }

  function syncPendingList(pending) {
    var table = document.getElementById('pending-list');
    if (!table) return;
    var body = table.tBodies[0];
    var wanted = {};
    pending.forEach(function (r) { wanted[r.id] = r; });

    var changed = false;
    body.querySelectorAll('[data-item][data-id]').forEach(function (row) {
      var id = row.getAttribute('data-id');
      if (wanted[id]) { delete wanted[id]; return; }
      // Someone else already handled it. Leave rows mid-save alone.
      if (row.getAttribute('aria-busy') === 'true' || row.classList.contains('is-removing')) return;
      row.remove();
      changed = true;
    });

    Object.keys(wanted).forEach(function (id) {
      var row = parse(wanted[id].html);
      if (!row) return;
      row.classList.add('is-new');
      body.appendChild(row);
      setTimeout(function () { row.classList.remove('is-new'); }, 2500);
      changed = true;
    });

    if (changed && window.Lists) window.Lists.refresh('pending-list');
  }

  function announce(fresh) {
    if (!fresh.length || !window.Notify) return;
    var body = fresh.length === 1
      ? fresh[0].student + ' wants to borrow “' + fresh[0].title + '”.'
      : fresh.length + ' new borrow requests are waiting.';
    window.Notify.show({ title: 'New borrow request', body: body }, false);
  }

  function check() {
    if (running) { again = true; return; }
    running = true;
    var started = generation;
    fetch(URL_LIVE, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) {
        var type = res.headers.get('Content-Type') || '';
        if (!res.ok || type.indexOf('application/json') === -1) throw new Error('not json');
        return res.json();
      })
      .then(function (data) {
        // A save finished while this was in flight, so this answer may be out of date.
        if (started !== generation) { again = true; return; }
        var ids = {};
        data.pending.forEach(function (r) { ids[r.id] = true; });
        if (seen) announce(data.pending.filter(function (r) { return !seen[r.id]; }));
        seen = ids;
        setCount(data.count);
        syncPendingList(data.pending);
      })
      .catch(function () { /* try again next round */ })
      .then(function () {
        running = false;
        if (again) { again = false; check(); }
        else schedule();
      });
  }

  function schedule() {
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(check, EVERY);
  }

  // Stop checking while the tab is in the background; catch up as soon as it's back.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) clearTimeout(timer);
    else check();
  });

  // The admin just saved something here: refresh right away instead of waiting.
  document.addEventListener('app:saved', function () {
    generation++;
    check();
  });

  check();
})();
