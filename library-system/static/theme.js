(function () {
  var root = document.documentElement;
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  var toggles = document.querySelectorAll('[data-theme-toggle]');

  function current() {
    return root.getAttribute('data-theme') || (systemDark.matches ? 'dark' : 'light');
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
    });
  });
  if (systemDark.addEventListener) systemDark.addEventListener('change', label);
  label();
})();