(function () {
  var root = document.documentElement;
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  var toggles = document.querySelectorAll('[data-theme-toggle]');

  function current() {
    return root.getAttribute('data-theme') || (systemDark.matches ? 'dark' : 'light');
  }
  function syncIcon() {
    var icon = document.getElementById('site-icon');
    var href = icon && icon.getAttribute('data-' + current());
    if (href && icon.getAttribute('href') !== href) icon.setAttribute('href', href);
  }
  function label() {
    var text = current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    toggles.forEach(function (t) { t.setAttribute('aria-label', text); t.setAttribute('title', text); });
  }
  toggles.forEach(function (t) {
    t.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('ls-theme', next); } catch (e) {}
      label();
      syncIcon();
    });
  });
  if (systemDark.addEventListener) systemDark.addEventListener('change', function () { label(); syncIcon(); });
  label();
  syncIcon();
})();