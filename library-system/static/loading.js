(function () {
  var main = document.getElementById('main');
  if (!main) return;

  // Wait a moment before showing the skeleton so fast pages don't flash it.
  var DELAY = 120;
  var timer = null;
  var activeBefore = null;

  function bone(cls, style) {
    return '<span class="bone ' + (cls || '') + '"' + (style ? ' style="' + style + '"' : '') + '></span>';
  }

  function repeat(n, html) {
    var out = '';
    for (var i = 0; i < n; i++) out += html;
    return out;
  }

  var head =
    '<div class="page-head"><div>' + bone('bone-title') + bone('bone-line', 'width: 260px') + '</div></div>';

  var stats =
    '<div class="stats">' + repeat(4, '<div class="stat">' + bone('bone-line', 'width: 60%') + bone('bone-number') + '</div>') + '</div>';

  var toolbar =
    '<div class="toolbar toolbar-plain">' + bone('bone-field', 'flex: 1 1 240px') + bone('bone-field', 'flex: 0 1 200px') + bone('bone-button') + '</div>';

  function rows(n) {
    return repeat(n, '<div class="bone-row">' + bone('bone-line', 'width: 22%') + bone('bone-line', 'width: 30%') +
      bone('bone-line', 'width: 14%') + bone('bone-pill') + '</div>');
  }

  function tableCard(n) {
    return '<div class="card"><div class="card-head">' + bone('bone-line bone-heading', 'width: 200px') + '</div>' + rows(n) + '</div>';
  }

  var books =
    '<div class="book-grid">' + repeat(8, '<div class="book">' + bone('bone-cover') +
      '<div class="book-body">' + bone('bone-line bone-heading', 'width: 80%') + bone('bone-line', 'width: 55%') + '</div>' +
      bone('bone-pill', 'width: 100%') + '</div>') + '</div>';

  var addForm =
    '<div class="card"><div class="card-head">' + bone('bone-line bone-heading', 'width: 120px') + '</div>' +
    '<div class="toolbar">' + bone('bone-field', 'flex: 1 1 200px') + bone('bone-field', 'flex: 1 1 200px') +
    bone('bone-field', 'flex: 0 1 110px') + bone('bone-button') + '</div></div>';

  var chartCards =
    '<div class="grid-2">' + repeat(2, '<div class="card"><div class="card-head">' + bone('bone-line bone-heading', 'width: 220px') +
      '</div>' + bone('bone-block') + '</div>') + '</div>';

  var LAYOUTS = {
    dashboard: head + stats + chartCards + tableCard(4),
    history: head + stats + tableCard(5),
    catalog: head + toolbar + books,
    'catalog-admin': head + addForm + toolbar + books,
    requests: head + toolbar + tableCard(3) + tableCard(4)
  };

  function show(layout) {
    var skeleton = document.createElement('div');
    skeleton.className = 'skeleton-page';
    skeleton.setAttribute('role', 'status');
    skeleton.innerHTML = '<span class="sr-only">Loading…</span><div aria-hidden="true">' + LAYOUTS[layout] + '</div>';
    main.insertBefore(skeleton, main.firstChild);
    main.classList.add('is-loading');
    main.setAttribute('aria-busy', 'true');
    window.scrollTo(0, 0);
  }

  function markActive(href) {
    activeBefore = [];
    document.querySelectorAll('.side-nav a, .tabbar a').forEach(function (a) {
      if (a.classList.contains('active')) activeBefore.push(a);
      var on = a.getAttribute('href') === href;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function reset() {
    clearTimeout(timer);
    var skeleton = main.querySelector('.skeleton-page');
    if (skeleton) skeleton.remove();
    main.classList.remove('is-loading');
    main.removeAttribute('aria-busy');
    if (activeBefore) {
      document.querySelectorAll('.side-nav a, .tabbar a').forEach(function (a) {
        var on = activeBefore.indexOf(a) !== -1;
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      activeBefore = null;
    }
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[data-skeleton]');
    if (!link || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || link.target === '_blank') return;
    var layout = link.getAttribute('data-skeleton');
    if (!LAYOUTS[layout]) return;

    reset();
    markActive(link.getAttribute('href'));
    timer = setTimeout(function () { show(layout); }, DELAY);
  });

  // Coming back with the browser's Back button can restore this page from memory, skeleton and all.
  window.addEventListener('pageshow', function (e) { if (e.persisted) reset(); });
})();
