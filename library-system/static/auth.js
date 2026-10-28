(function () {
  var wt = document.querySelector('[data-walkthrough]');
  if (wt) {
    var pills = Array.prototype.slice.call(wt.querySelectorAll('.wt-pill'));
    var captions = Array.prototype.slice.call(wt.querySelectorAll('.wt-caption'));
    var dots = Array.prototype.slice.call(wt.querySelectorAll('.wt-dot'));
    var radios = Array.prototype.slice.call(document.querySelectorAll('input[name="role"]'));
    var roleLinks = Array.prototype.slice.call(document.querySelectorAll('[data-role-link]'));
    var roleTexts = Array.prototype.slice.call(document.querySelectorAll('[data-role-text]'));
    var roles = pills.map(function (p) { return p.getAttribute('data-role'); });
    var names = { user: 'Borrower', admin: 'Admin' };
    var index = 0;

    function show(k) {
      index = Math.max(0, Math.min(roles.length - 1, k));
      var role = roles[index];
      pills.forEach(function (p, j) {
        var d = j - index;
        p.setAttribute('data-pos', d === 0 ? 'current' : d === 1 ? 'next' : d === -1 ? 'prev' : d > 0 ? 'after' : 'before');
      });
      captions.forEach(function (c, j) { c.classList.toggle('is-current', j === index); });
      dots.forEach(function (d, j) { d.setAttribute('aria-current', j === index ? 'true' : 'false'); });
      radios.forEach(function (r) { r.checked = r.value === role; });
      roleTexts.forEach(function (el) { el.textContent = el.getAttribute('data-role-text').replace('{role}', names[role]); });

      roleLinks.forEach(function (a) {
        var url = new URL(a.href, window.location.href);
        url.searchParams.set('role', role);
        a.href = url.pathname + url.search;
      });
    }

    radios.forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) show(roles.indexOf(r.value)); });
    });
    dots.forEach(function (d) {
      d.addEventListener('click', function () { show(roles.indexOf(d.getAttribute('data-role'))); });
    });
    wt.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { show(index + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { show(index - 1); e.preventDefault(); }
    });

    var stage = wt.querySelector('.wt-stage');
    var startX = null;
    var swiped = false;
    stage.addEventListener('pointerdown', function (e) { startX = e.clientX; swiped = false; });
    stage.addEventListener('pointerup', function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) {
        swiped = true;
        show(dx < 0 ? index + 1 : index - 1);
      }
    });
    pills.forEach(function (p, j) {
      p.addEventListener('click', function () { if (!swiped && j !== index) show(j); });
    });

    var checked = radios.filter(function (r) { return r.checked; })[0];
    var startRole = checked ? checked.value : (pills.filter(function (p) { return p.getAttribute('data-pos') === 'current'; })[0] || pills[0]).getAttribute('data-role');
    show(roles.indexOf(startRole));
  }

  document.querySelectorAll('[data-id-format]').forEach(function (input) {
    function format(digits) {
      return digits.length > 4 ? digits.slice(0, 4) + '-' + digits.slice(4) : digits;
    }
    function tidy() {
      var caret = input.selectionStart || 0;
      var digitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, '').length;
      var digits = input.value.replace(/\D/g, '').slice(0, 10);
      var formatted = format(digits);
      if (formatted !== input.value) {
        input.value = formatted;
        var pos = digitsBeforeCaret > 4 ? digitsBeforeCaret + 1 : digitsBeforeCaret;
        try { input.setSelectionRange(pos, pos); } catch (e) {}
      }
    }
    input.addEventListener('beforeinput', function (e) {
      if (e.data && /\D/.test(e.data.replace(/-/g, '')) && e.inputType !== 'insertFromPaste') e.preventDefault();
    });
    input.addEventListener('input', tidy);
    tidy();
  });

  var checkInput = document.querySelector('[data-email-check]');
  if (checkInput) {
    var msg = document.getElementById('email-msg');
    var checkUrl = checkInput.getAttribute('data-email-check');
    var loginUrl = checkInput.getAttribute('data-login-url');
    var timer = null;
    var seq = 0;
    var lastValue = '';
    var lastResult = null;
    var takenLink = false;

    function setMessage(text, state) {
      msg.textContent = '';
      msg.setAttribute('data-state', state || '');
      if (!text) return;
      var span = document.createElement('span');
      span.textContent = text;
      if (state === 'error' && takenLink && loginUrl) {
        var link = document.createElement('a');
        link.href = loginUrl;
        link.textContent = 'Log in instead';
        span.appendChild(document.createTextNode(' '));
        span.appendChild(link);
      }
      msg.appendChild(span);
    }

    function apply(result) {
      takenLink = result.status === 'taken';
      if (result.status === 'available') {
        checkInput.setCustomValidity('');
        setMessage(result.message, 'ok');
      } else if (result.message) {
        checkInput.setCustomValidity(result.message);
        setMessage(result.message, 'error');
      } else {
        checkInput.setCustomValidity('');
        setMessage('', '');
      }
    }

    function check(now) {
      clearTimeout(timer);
      var value = checkInput.value.trim().toLowerCase();
      checkInput.setCustomValidity('');
      if (!value || !checkInput.checkValidity()) {
        setMessage('', '');
        return;
      }
      if (value === lastValue && lastResult) {
        apply(lastResult);
        return;
      }
      timer = setTimeout(function () {
        var mine = ++seq;
        fetch(checkUrl + '?email=' + encodeURIComponent(value), { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
          .then(function (result) {
            if (mine !== seq) return;
            lastValue = value;
            lastResult = result;
            apply(result);
          })
          .catch(function () { if (mine === seq) setMessage('', ''); });
      }, now ? 0 : 450);
    }

    checkInput.addEventListener('input', function () { check(false); });
    checkInput.addEventListener('blur', function () { check(true); });
    if (checkInput.value) check(true);
  }
})();